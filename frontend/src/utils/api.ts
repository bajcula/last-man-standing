import type { ApiMatch } from '../types';

const LEAGUE_ID = '4328'; // Premier League
const API_TIMEOUT_MS = 15000;

/**
 * Derive the TheSportsDB season string from the current date.
 * PL seasons run Aug–May, so Aug 1 onward is the new season.
 */
export const getCurrentSeason = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const startYear = month >= 7 ? year : year - 1; // Aug (7) starts new season
  return `${startYear}-${startYear + 1}`;
};

/**
 * Fetch with a timeout to prevent hanging requests.
 */
const fetchWithTimeout = async (url: string, timeoutMs = API_TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
};

/**
 * Fetch matches for a specific round from TheSportsDB
 */
export const fetchRoundMatches = async (round: number): Promise<ApiMatch[]> => {
  const season = getCurrentSeason();
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${season}`;
  const response = await fetchWithTimeout(url);
  const data = await response.json();
  return (data.events || []) as ApiMatch[];
};

/**
 * Fetch last completed matches from TheSportsDB
 */
export const fetchLastMatches = async (): Promise<ApiMatch[]> => {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${LEAGUE_ID}`;
  const response = await fetchWithTimeout(url);
  const data = await response.json();
  return (data.events || []) as ApiMatch[];
};

const SKIP_STATUSES = ['Match Postponed', 'Postponed', 'Cancelled', 'Abandoned', 'Awarded'];

export const isPostponedStatus = (status: string): boolean => SKIP_STATUSES.includes(status);

/**
 * Find the earliest playable match in an array of events and return deadline (6 hours before)
 * Skips postponed/cancelled matches so they don't corrupt the deadline.
 */
export const calculateDeadlineFromMatches = (events: ApiMatch[]): Date | null => {
  if (!events || events.length === 0) return null;

  const playable = events.filter(e => !isPostponedStatus(e.strStatus));
  if (playable.length === 0) return null;

  let earliest = playable[0]!;
  for (const match of playable) {
    const matchDate = new Date(match.dateEvent + 'T' + (match.strTime || '00:00:00') + 'Z');
    const earliestDate = new Date(earliest.dateEvent + 'T' + (earliest.strTime || '00:00:00') + 'Z');
    if (matchDate < earliestDate) {
      earliest = match;
    }
  }

  const firstMatchTime = new Date(earliest.dateEvent + 'T' + (earliest.strTime || '00:00:00') + 'Z');
  return new Date(firstMatchTime.getTime() - (6 * 60 * 60 * 1000));
};

/**
 * Get a fallback deadline (7 days from now at 3 PM)
 */
export const getFallbackDeadline = (): Date => {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  deadline.setHours(15, 0, 0, 0);
  return deadline;
};
