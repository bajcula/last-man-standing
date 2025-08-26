require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function checkWinningTeams() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    
    const collections = await pb.collections.getFullList();
    const winningTeamsCollection = collections.find(c => c.name === 'winning_teams');
    
    if (winningTeamsCollection) {
      console.log('Winning teams collection schema:');
      console.log(JSON.stringify(winningTeamsCollection.schema, null, 2));
    } else {
      console.log('No winning_teams collection found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkWinningTeams();