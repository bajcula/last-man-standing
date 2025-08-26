require('dotenv').config();
const axios = require('axios');

const baseURL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

// Load credentials from environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function setupCollections() {
  try {
    console.log('🔐 Authenticating as admin...');
    
    // Login as admin
    const authResponse = await axios.post(`${baseURL}/api/admins/auth-with-password`, {
      identity: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    const token = authResponse.data.token;
    console.log('✅ Authenticated successfully');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Create teams collection
    console.log('📦 Creating teams collection...');
    try {
      await axios.post(`${baseURL}/api/collections`, {
        name: 'teams',
        type: 'base',
        schema: [
          {
            name: 'name',
            type: 'text',
            required: true,
            options: {
              min: 1,
              max: 50
            }
          },
          {
            name: 'short_name',
            type: 'text',
            required: true,
            options: {
              min: 3,
              max: 3
            }
          }
        ]
      }, { headers });
      console.log('✅ Teams collection created');
    } catch (error) {
      console.log('⚠️  Teams collection might already exist');
    }

    // Create picks collection
    console.log('📦 Creating picks collection...');
    try {
      await axios.post(`${baseURL}/api/collections`, {
        name: 'picks',
        type: 'base',
        schema: [
          {
            name: 'user_id',
            type: 'relation',
            required: true,
            options: {
              collectionId: '_pb_users_auth_',
              cascadeDelete: true,
              maxSelect: 1
            }
          },
          {
            name: 'team_id', 
            type: 'relation',
            required: true,
            options: {
              collectionId: 'teams',
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
      }, { headers });
      console.log('✅ Picks collection created');
    } catch (error) {
      console.log('⚠️  Picks collection might already exist');
    }

    // Create deadlines collection  
    console.log('📦 Creating deadlines collection...');
    try {
      await axios.post(`${baseURL}/api/collections`, {
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
      }, { headers });
      console.log('✅ Deadlines collection created');
    } catch (error) {
      console.log('⚠️  Deadlines collection might already exist');
    }

    // Create winning_teams collection
    console.log('📦 Creating winning_teams collection...');
    try {
      await axios.post(`${baseURL}/api/collections`, {
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
              collectionId: 'teams',
              cascadeDelete: false,
              maxSelect: 1
            }
          }
        ]
      }, { headers });
      console.log('✅ Winning teams collection created');
    } catch (error) {
      console.log('⚠️  Winning teams collection might already exist');
    }

    console.log('🎉 Setup complete! Collections are ready.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Go to http://localhost:8090/_/');
    console.log('2. Check that picks and deadlines collections exist');
    console.log('3. Set API rules to empty for testing');
    console.log('4. Test the app at http://localhost:5173');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('');
    console.log('Please update ADMIN_EMAIL and ADMIN_PASSWORD at the top of this script');
  }
}

setupCollections();