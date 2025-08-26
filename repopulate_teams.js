require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function repopulateTeams() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('✅ Admin authenticated successfully');
    
    // Clear existing team records
    const existingTeams = await pb.collection('teams').getFullList();
    console.log(`Clearing ${existingTeams.length} existing team records...`);
    for (const team of existingTeams) {
      await pb.collection('teams').delete(team.id);
    }
    
    // Add all teams
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

    console.log('⚽ Adding all 20 Premier League teams...');
    for (const team of teams) {
      try {
        await pb.collection('teams').create(team);
        console.log(`✅ Added: ${team.team_name} (${team.team_short_name})`);
      } catch (err) {
        console.log(`❌ Failed to add: ${team.team_name}`, err.message);
      }
    }

    console.log('🎉 Teams repopulated successfully!');

  } catch (error) {
    console.error('❌ Repopulation failed:', error.message);
  }
}

repopulateTeams();