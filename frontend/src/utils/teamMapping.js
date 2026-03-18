// Team name mapping between TheSportsDB API names and our database names
// DB uses full API names (e.g., "Brighton and Hove Albion", "Wolverhampton Wanderers")
const TEAM_NAME_MAP = {
  // Identity mappings for all 20 DB team names
  'Arsenal': 'Arsenal',
  'Aston Villa': 'Aston Villa',
  'Bournemouth': 'Bournemouth',
  'Brentford': 'Brentford',
  'Brighton and Hove Albion': 'Brighton and Hove Albion',
  'Burnley': 'Burnley',
  'Chelsea': 'Chelsea',
  'Crystal Palace': 'Crystal Palace',
  'Everton': 'Everton',
  'Fulham': 'Fulham',
  'Leeds United': 'Leeds United',
  'Leicester City': 'Leicester City',
  'Liverpool': 'Liverpool',
  'Manchester City': 'Manchester City',
  'Manchester United': 'Manchester United',
  'Newcastle United': 'Newcastle United',
  'Nottingham Forest': 'Nottingham Forest',
  'Sunderland': 'Sunderland',
  'Tottenham Hotspur': 'Tottenham Hotspur',
  'West Ham United': 'West Ham United',
  'Wolverhampton Wanderers': 'Wolverhampton Wanderers',
  // Alternate/short names from API
  'Man United': 'Manchester United',
  'Man City': 'Manchester City',
  'Newcastle': 'Newcastle United',
  'West Ham': 'West Ham United',
  'Tottenham': 'Tottenham Hotspur',
  'Spurs': 'Tottenham Hotspur',
  'Leicester': 'Leicester City',
  'Wolves': 'Wolverhampton Wanderers',
  'Wolverhampton': 'Wolverhampton Wanderers',
  'Nottm Forest': 'Nottingham Forest',
  "Nott'm Forest": 'Nottingham Forest',
  'Brighton': 'Brighton and Hove Albion',
  'AFC Bournemouth': 'Bournemouth',
  'Leeds': 'Leeds United',
};

/**
 * Find a team in the database by its API name
 * @param {string} apiTeamName - Team name from TheSportsDB API
 * @param {Array} teams - Array of team objects from the database
 * @returns {Object|undefined} Matching team object
 */
export const findTeamByApiName = (apiTeamName, teams) => {
  // First try direct mapping
  const mappedName = TEAM_NAME_MAP[apiTeamName];
  if (mappedName) {
    const team = teams.find(t => t.team_name === mappedName);
    if (team) return team;
  }

  // Try exact match
  const exactMatch = teams.find(t => t.team_name === apiTeamName);
  if (exactMatch) return exactMatch;

  // Try partial matches
  return teams.find(team =>
    team.team_name.includes(apiTeamName) ||
    apiTeamName.includes(team.team_name.split(' ')[0]) ||
    team.team_short_name === apiTeamName.substring(0, 3).toUpperCase()
  );
};
