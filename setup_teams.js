require('dotenv').config();
const axios = require('axios');

const teams = [
  {"team_name": "Arsenal", "team_short_name": "ARS"},
  {"team_name": "Aston Villa", "team_short_name": "AVL"},
  {"team_name": "Bournemouth", "team_short_name": "BOU"},
  {"team_name": "Brentford", "team_short_name": "BRE"},
  {"team_name": "Brighton", "team_short_name": "BHA"},
  {"team_name": "Burnley", "team_short_name": "BUR"},
  {"team_name": "Chelsea", "team_short_name": "CHE"},
  {"team_name": "Crystal Palace", "team_short_name": "CRY"},
  {"team_name": "Everton", "team_short_name": "EVE"},
  {"team_name": "Fulham", "team_short_name": "FUL"},
  {"team_name": "Leeds United", "team_short_name": "LEE"},
  {"team_name": "Liverpool", "team_short_name": "LIV"},
  {"team_name": "Man. City", "team_short_name": "MCI"},
  {"team_name": "Man. Utd", "team_short_name": "MUN"},
  {"team_name": "Newcastle", "team_short_name": "NEW"},
  {"team_name": "Nottingham", "team_short_name": "NOT"},
  {"team_name": "Sunderland", "team_short_name": "SUN"},
  {"team_name": "Tottenham", "team_short_name": "TOT"},
  {"team_name": "West Ham", "team_short_name": "WHU"},
  {"team_name": "Wolves", "team_short_name": "WOL"}
];

async function addTeams() {
  const baseURL = 'http://127.0.0.1:8090';
  
  // Load credentials from environment variables
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  
  try {
    // Login
    const authResponse = await axios.post(`${baseURL}/api/admins/auth-with-password`, {
      identity: email,
      password: password
    });
    
    const token = authResponse.data.token;
    console.log('✓ Authenticated');
    
    // Add teams
    for (const team of teams) {
      try {
        await axios.post(`${baseURL}/api/collections/teams/records`, team, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`✓ Added: ${team.team_name}`);
      } catch (error) {
        console.log(`✗ Failed: ${team.team_name} (${error.response?.data?.message || 'unknown error'})`);
      }
    }
    
    console.log('🎉 All teams processed!');
  } catch (error) {
    console.error('Authentication failed:', error.response?.data || error.message);
  }
}

addTeams();