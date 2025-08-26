/**
 * Game logic utilities for Last Man Standing
 */

/**
 * Determines the winner of a match based on scores
 * @param {Object} match - Match object with scores and status
 * @returns {string|null} Winner team name, 'Draw', or null if not finished
 */
export const getMatchWinner = (match) => {
  if (match.strStatus !== 'Match Finished') return null;
  
  const homeScore = parseInt(match.intHomeScore) || 0;
  const awayScore = parseInt(match.intAwayScore) || 0;
  
  if (homeScore > awayScore) return match.strHomeTeam;
  if (awayScore > homeScore) return match.strAwayTeam;
  return 'Draw';
};

/**
 * Gets the first available team alphabetically for a user
 * @param {Array} allTeams - Array of all teams
 * @param {Array} userPicks - Array of user's previous picks
 * @returns {Object|null} Available team or null if none available
 */
export const getFirstAvailableTeam = (allTeams, userPicks) => {
  // Sort teams alphabetically
  const sortedTeams = [...allTeams].sort((a, b) => a.team_name.localeCompare(b.team_name));
  
  // Get teams user has already picked
  const usedTeamIds = userPicks.map(pick => pick.team_id);
  
  // Find first available team
  return sortedTeams.find(team => !usedTeamIds.includes(team.id)) || null;
};

/**
 * Checks if a user should be eliminated based on their picks and winning teams
 * @param {Array} userPicks - User's picks for all weeks
 * @param {Array} allWinningTeams - All winning teams by week
 * @param {number} currentWeek - Current week number
 * @returns {Object} Elimination status and info
 */
export const checkUserElimination = (userPicks, allWinningTeams, currentWeek) => {
  // If this is week 1, no one can be eliminated yet
  if (currentWeek <= 1) {
    return { isEliminated: false, eliminationInfo: null };
  }

  // Check each previous week
  for (let week = 1; week < currentWeek; week++) {
    // Get winners for this week
    const weekWinners = allWinningTeams.filter(w => w.week_number === week);
    
    // If no winners were declared for this week, skip it entirely (week wasn't played)
    if (weekWinners.length === 0) {
      continue;
    }

    // Find user's pick for this week
    const pickForWeek = userPicks.find(p => p.week_number === week);

    if (!pickForWeek) {
      // User has no pick for this week - they're eliminated
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

    // Check if their pick was a winner
    const userTeamWon = weekWinners.some(winner => winner.team_id === pickForWeek.team_id);

    if (!userTeamWon) {
      // Their pick was not a winner - they're eliminated
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

  // If we get here, user is still alive
  return { isEliminated: false, eliminationInfo: null };
};