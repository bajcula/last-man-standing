require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function addFieldsManually() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('✅ Admin authenticated successfully');
    
    // Get collections
    const collections = await pb.collections.getFullList();
    const teamsCollection = collections.find(c => c.name === 'teams');
    const winningTeamsCollection = collections.find(c => c.name === 'winning_teams');
    
    console.log('Teams collection ID:', teamsCollection.id);
    console.log('Winning teams collection ID:', winningTeamsCollection.id);
    
    // Update winning_teams collection by adding schema
    console.log('📦 Adding fields to winning_teams collection...');
    
    const updatedWinningTeams = {
      ...winningTeamsCollection,
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
    };
    
    await pb.collections.update(winningTeamsCollection.id, updatedWinningTeams);
    console.log('✅ Fields added to winning_teams collection');

    // Do the same for other collections if needed
    const picksCollection = collections.find(c => c.name === 'picks');
    const usersCollection = collections.find(c => c.name === 'users');
    
    console.log('📦 Adding fields to picks collection...');
    const updatedPicks = {
      ...picksCollection,
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
    };
    
    await pb.collections.update(picksCollection.id, updatedPicks);
    console.log('✅ Fields added to picks collection');

    console.log('📦 Adding fields to deadlines collection...');
    const deadlinesCollection = collections.find(c => c.name === 'deadlines');
    const updatedDeadlines = {
      ...deadlinesCollection,
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
    };
    
    await pb.collections.update(deadlinesCollection.id, updatedDeadlines);
    console.log('✅ Fields added to deadlines collection');

    console.log('🎉 All collection schemas fixed by adding fields manually!');

  } catch (error) {
    console.error('❌ Update failed:', error.message);
  }
}

addFieldsManually();