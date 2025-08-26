require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function setupAllCollections() {
  try {
    console.log('🔐 Authenticating with admin credentials...');
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('✅ Admin authenticated successfully');
    
    // Create picks collection
    console.log('📦 Creating picks collection...');
    try {
      await pb.collections.create({
        name: 'picks',
        type: 'base',
        schema: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            options: {
              collectionId: pb.collection('users').id,
              cascadeDelete: false,
              minSelect: 1,
              maxSelect: 1
            }
          },
          {
            name: 'team',
            type: 'relation',
            required: true,
            options: {
              collectionId: 'teams',
              cascadeDelete: false,
              minSelect: 1,
              maxSelect: 1
            }
          },
          {
            name: 'week',
            type: 'number',
            required: true
          }
        ]
      });
      console.log('✅ Picks collection created');
    } catch (err) {
      console.log('⚠️  Picks collection might already exist');
    }

    // Create deadlines collection
    console.log('📦 Creating deadlines collection...');
    try {
      await pb.collections.create({
        name: 'deadlines',
        type: 'base',
        schema: [
          {
            name: 'week',
            type: 'number',
            required: true
          },
          {
            name: 'deadline',
            type: 'date',
            required: true
          }
        ]
      });
      console.log('✅ Deadlines collection created');
    } catch (err) {
      console.log('⚠️  Deadlines collection might already exist');
    }

    // Create winning_teams collection
    console.log('📦 Creating winning_teams collection...');
    try {
      await pb.collections.create({
        name: 'winning_teams',
        type: 'base',
        schema: [
          {
            name: 'week',
            type: 'number',
            required: true
          },
          {
            name: 'team',
            type: 'relation',
            required: true,
            options: {
              collectionId: 'teams',
              cascadeDelete: false,
              minSelect: 1,
              maxSelect: 1
            }
          }
        ]
      });
      console.log('✅ Winning teams collection created');
    } catch (err) {
      console.log('⚠️  Winning teams collection might already exist');
    }

    // Update users collection to add isAdmin field
    console.log('📦 Updating users collection...');
    try {
      const usersCollection = await pb.collections.getOne('users');
      usersCollection.schema.push(
        {
          name: 'first_name',
          type: 'text',
          required: false
        },
        {
          name: 'last_name',
          type: 'text', 
          required: false
        },
        {
          name: 'isAdmin',
          type: 'bool',
          required: false
        }
      );
      await pb.collections.update(usersCollection.id, usersCollection);
      console.log('✅ Users collection updated');
    } catch (err) {
      console.log('⚠️  Users collection might already be updated');
    }

    console.log('🎉 All collections setup complete!');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

setupAllCollections();