require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function recreateAllCorrect() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('✅ Admin authenticated successfully');
    
    // Get collections
    const collections = await pb.collections.getFullList();
    const teamsCollection = collections.find(c => c.name === 'teams');
    const usersCollection = collections.find(c => c.name === 'users');
    
    // Delete and recreate picks collection with CORRECT field names
    console.log('📦 Recreating picks collection...');
    const picksCollection = collections.find(c => c.name === 'picks');
    if (picksCollection) {
      await pb.collections.delete(picksCollection.id);
    }
    
    await pb.collections.create({
      name: 'picks',
      type: 'base',
      schema: [
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          options: {
            collectionId: usersCollection.id,
            cascadeDelete: true,
            maxSelect: 1
          }
        },
        {
          name: 'team_id',
          type: 'relation',
          required: true,
          options: {
            collectionId: teamsCollection.id,
            cascadeDelete: false,
            maxSelect: 1
          }
        },
        {
          name: 'week_number',
          type: 'number',
          required: true,
          options: {
            min: 1,
            max: 38
          }
        }
      ]
    });
    console.log('✅ picks collection recreated with CORRECT field names');

    // Delete and recreate deadlines collection with CORRECT field names
    console.log('📦 Recreating deadlines collection...');
    const deadlinesCollection = collections.find(c => c.name === 'deadlines');
    if (deadlinesCollection) {
      await pb.collections.delete(deadlinesCollection.id);
    }
    
    await pb.collections.create({
      name: 'deadlines',
      type: 'base',
      schema: [
        {
          name: 'week_number',
          type: 'number',
          required: true,
          options: {
            min: 1,
            max: 38
          }
        },
        {
          name: 'deadline_time',
          type: 'date',
          required: true
        },
        {
          name: 'is_closed',
          type: 'bool',
          required: false
        }
      ]
    });
    console.log('✅ deadlines collection recreated with CORRECT field names');

    // Delete and recreate winning_teams collection with CORRECT field names
    console.log('📦 Recreating winning_teams collection...');
    const winningTeamsCollection = collections.find(c => c.name === 'winning_teams');
    if (winningTeamsCollection) {
      await pb.collections.delete(winningTeamsCollection.id);
    }
    
    await pb.collections.create({
      name: 'winning_teams',
      type: 'base',
      schema: [
        {
          name: 'week_number',
          type: 'number',
          required: true,
          options: {
            min: 1,
            max: 38
          }
        },
        {
          name: 'team_id',
          type: 'relation',
          required: true,
          options: {
            collectionId: teamsCollection.id,
            cascadeDelete: false,
            maxSelect: 1
          }
        }
      ]
    });
    console.log('✅ winning_teams collection recreated with CORRECT field names');

    console.log('🎉 All collections recreated with the exact same field names as local!');
    console.log('');
    console.log('Field names used:');
    console.log('- picks: user_id, team_id, week_number');
    console.log('- deadlines: week_number, deadline_time, is_closed'); 
    console.log('- winning_teams: week_number, team_id');
    console.log('- teams: team_name, team_short_name (already correct)');

  } catch (error) {
    console.error('❌ Recreation failed:', error.message);
  }
}

recreateAllCorrect();