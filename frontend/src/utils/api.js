const SEASON = '2025-2026';
const LEAGUE_ID = '4328'; // Premier League

/**
 * Fetch matches for a specific round from TheSportsDB
 */
export const fetchRoundMatches = async (round) => {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${SEASON}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.events || [];
};

/**
 * Fetch last completed matches from TheSportsDB
 */
export const fetchLastMatches = async () => {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${LEAGUE_ID}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.events || [];
};

const SKIP_STATUSES = ['Match Postponed', 'Postponed', 'Cancelled', 'Abandoned', 'Awarded'];

export const isPostponedStatus = (status) => SKIP_STATUSES.includes(status);

/**
 * Find the earliest playable match in an array of events and return deadline (6 hours before)
 * Skips postponed/cancelled matches so they don't corrupt the deadline.
 */
export const calculateDeadlineFromMatches = (events) => {
  if (!events || events.length === 0) return null;

  const playable = events.filter(e => !isPostponedStatus(e.strStatus));
  if (playable.length === 0) return null;

  let earliest = playable[0];
  for (const match of playable) {
    const matchDate = new Date(match.dateEvent + ' ' + match.strTime);
    const earliestDate = new Date(earliest.dateEvent + ' ' + earliest.strTime);
    if (matchDate < earliestDate) {
      earliest = match;
    }
  }

  const firstMatchTime = new Date(earliest.dateEvent + ' ' + earliest.strTime);
  return new Date(firstMatchTime.getTime() - (6 * 60 * 60 * 1000));
};

/**
 * Get a fallback deadline (7 days from now at 3 PM)
 */
export const getFallbackDeadline = () => {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  deadline.setHours(15, 0, 0, 0);
  return deadline;
};
