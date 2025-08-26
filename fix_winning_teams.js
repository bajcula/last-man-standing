require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function fixWinningTeams() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('✅ Admin authenticated successfully');
    
    // Delete existing winning_teams collection
    try {
      const collections = await pb.collections.getFullList();
      const winningTeamsCollection = collections.find(c => c.name === 'winning_teams');
      if (winningTeamsCollection) {
        await pb.collections.delete(winningTeamsCollection.id);
        console.log('🗑️  Deleted old winning_teams collection');
      }
    } catch (err) {
      console.log('⚠️  No winning_teams collection to delete');
    }
    
    // Get teams collection ID for relation
    const teamsCollection = await pb.collections.getOne('teams');
    
    // Create winning_teams collection with proper schema
    console.log('📦 Creating winning_teams collection with proper schema...');
    await pb.collections.create({
      name: 'winning_teams',
      type: 'base',
      schema: [
        {
          name: 'week',
          type: 'number',
          required: true,
          options: {
            min: 1,
            max: 38
          }
        },
        {
          name: 'team',
          type: 'relation',
          required: true,
          options: {
            collectionId: teamsCollection.id,
            cascadeDelete: false,
            minSelect: 1,
            maxSelect: 1,
            displayFields: ["team_name"]
          }
        }
      ]
    });
    console.log('✅ winning_teams collection created with proper schema');

    console.log('🎉 winning_teams collection fixed!');

  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  }
}

fixWinningTeams();