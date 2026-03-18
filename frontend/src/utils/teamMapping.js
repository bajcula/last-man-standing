// Team name mapping between TheSportsDB API names and our database names
const TEAM_NAME_MAP = {
  'Manchester United': 'Manchester United',
  'Manchester City': 'Manchester City',
  'Man United': 'Manchester United',
  'Man City': 'Manchester City',
  'Newcastle': 'Newcastle United',
  'Newcastle United': 'Newcastle United',
  'West Ham': 'West Ham United',
  'West Ham United': 'West Ham United',
  'Tottenham': 'Tottenham Hotspur',
  'Tottenham Hotspur': 'Tottenham Hotspur',
  'Leicester': 'Leicester City',
  'Leicester City': 'Leicester City',
  'Wolves': 'Wolverhampton Wanderers',
  'Wolverhampton': 'Wolverhampton Wanderers',
  'Nottm Forest': 'Nottingham Forest',
  'Nottingham Forest': 'Nottingham Forest',
  'Brighton': 'Brighton',
  'Crystal Palace': 'Crystal Palace'
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
