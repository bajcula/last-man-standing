require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function recreateTeams() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('✅ Admin authenticated successfully');
    
    // Delete existing teams collection
    try {
      const collections = await pb.collections.getFullList();
      const teamsCollection = collections.find(c => c.name === 'teams');
      if (teamsCollection) {
        await pb.collections.delete(teamsCollection.id);
        console.log('🗑️  Deleted old teams collection');
      }
    } catch (err) {
      console.log('⚠️  No teams collection to delete');
    }
    
    // Create teams collection with proper schema
    console.log('📦 Creating teams collection with proper schema...');
    const newTeamsCollection = await pb.collections.create({
      name: 'teams',
      type: 'base',
      schema: [
        {
          name: 'team_name',
          type: 'text',
          required: true,
          options: {
            min: 1,
            max: 50
          }
        },
        {
          name: 'team_short_name',
          type: 'text',
          required: true,
          options: {
            min: 2,
            max: 5
          }
        }
      ]
    });
    console.log('✅ Teams collection created with proper schema');

    // Add teams with data
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

    console.log('⚽ Adding teams with proper data...');
    for (const team of teams) {
      try {
        const newTeam = await pb.collection('teams').create(team);
        console.log(`✅ Added: ${team.team_name} (${team.team_short_name})`);
      } catch (err) {
        console.log(`❌ Failed to add: ${team.team_name}`, err.message);
      }
    }

    console.log('🎉 Teams collection recreated successfully!');

  } catch (error) {
    console.error('❌ Recreation failed:', error.message);
  }
}

recreateTeams();