require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function checkTeams() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    
    const teams = await pb.collection('teams').getFullList();
    console.log('Teams found:', teams.length);
    console.log('First team structure:', JSON.stringify(teams[0], null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkTeams();