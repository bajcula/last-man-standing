require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function fixAllCollections() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('✅ Admin authenticated successfully');
    
    // Get collections
    const collections = await pb.collections.getFullList();
    const teamsCollection = collections.find(c => c.name === 'teams');
    const usersCollection = collections.find(c => c.name === 'users');
    
    // Fix picks collection
    console.log('📦 Fixing picks collection...');
    const picksCollection = collections.find(c => c.name === 'picks');
    if (picksCollection) {
      await pb.collections.delete(picksCollection.id);
    }
    
    await pb.collections.create({
      name: 'picks',
      type: 'base',
      schema: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          options: {
            collectionId: usersCollection.id,
            cascadeDelete: false,
            minSelect: 1,
            maxSelect: 1,
            displayFields: ["first_name", "last_name"]
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
        },
        {
          name: 'week',
          type: 'number',
          required: true,
          options: {
            min: 1,
            max: 38
          }
        }
      ]
    });
    console.log('✅ picks collection fixed');

    // Fix deadlines collection  
    console.log('📦 Fixing deadlines collection...');
    const deadlinesCollection = collections.find(c => c.name === 'deadlines');
    if (deadlinesCollection) {
      await pb.collections.delete(deadlinesCollection.id);
    }
    
    await pb.collections.create({
      name: 'deadlines',
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
          name: 'deadline',
          type: 'date',
          required: true
        }
      ]
    });
    console.log('✅ deadlines collection fixed');

    console.log('🎉 All collections fixed with proper schemas!');

  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  }
}

fixAllCollections();