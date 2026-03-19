import type { ApiMatch, Team, Pick, WinningTeam, EliminationResult } from '../types';

/**
 * Determines the winner of a match based on scores
 */
export const getMatchWinner = (match: ApiMatch): string | null => {
  if (match.strStatus !== 'Match Finished') return null;

  const homeScore = parseInt(match.intHomeScore ?? '0') || 0;
  const awayScore = parseInt(match.intAwayScore ?? '0') || 0;

  if (homeScore > awayScore) return match.strHomeTeam;
  if (awayScore > homeScore) return match.strAwayTeam;
  return 'Draw';
};

/**
 * Gets the first available team alphabetically for a user
 */
export const getFirstAvailableTeam = (allTeams: Team[], userPicks: Pick[]): Team | null => {
  const sortedTeams = [...allTeams].sort((a, b) => a.team_name.localeCompare(b.team_name));
  const usedTeamIds = userPicks.map(pick => pick.team_id);
  return sortedTeams.find(team => !usedTeamIds.includes(team.id)) ?? null;
};

/**
 * Checks if a user should be eliminated based on their picks and winning teams
 */
export const checkUserElimination = (
  userPicks: Pick[],
  allWinningTeams: WinningTeam[],
  currentWeek: number
): EliminationResult => {
  if (currentWeek <= 1) {
    return { isEliminated: false, eliminationInfo: null };
  }

  for (let week = 1; week < currentWeek; week++) {
    const weekWinners = allWinningTeams.filter(w => w.week_number === week);

    if (weekWinners.length === 0) {
      continue;
    }

    const pickForWeek = userPicks.find(p => p.week_number === week);

    if (!pickForWeek) {
      return {
        isEliminated: true,
        eliminationInfo: {
          reason: 'No pick made',
          week: week,
          teamName: 'No team selected',
          eliminatedWeek: week
        }
      };
    }

    const userTeamWon = weekWinners.some(winner => winner.team_id === pickForWeek.team_id);

    if (!userTeamWon) {
      return {
        isEliminated: true,
        eliminationInfo: {
          reason: 'Team lost',
          week: week,
          teamName: pickForWeek.expand?.team_id?.team_name || 'Unknown Team',
          eliminatedWeek: week
        }
      };
    }
  }

  return { isEliminated: false, eliminationInfo: null };
};
