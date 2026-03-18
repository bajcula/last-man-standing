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

/**
 * Find the earliest match in an array of events and return deadline (6 hours before)
 */
export const calculateDeadlineFromMatches = (events) => {
  if (!events || events.length === 0) return null;

  let earliest = events[0];
  for (const match of events) {
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
