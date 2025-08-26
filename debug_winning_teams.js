require('dotenv').config();
const PocketBase = require('pocketbase').default;

const pb = new PocketBase('https://last-man-chicago.pockethost.io');

async function debugWinningTeams() {
  try {
    await pb.admins.authWithPassword(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    
    const collections = await pb.collections.getFullList();
    const winningTeamsCollection = collections.find(c => c.name === 'winning_teams');
    
    if (winningTeamsCollection) {
      console.log('Winning teams collection found:');
      console.log('ID:', winningTeamsCollection.id);
      console.log('Name:', winningTeamsCollection.name);
      console.log('Schema:', JSON.stringify(winningTeamsCollection.schema, null, 2));
      
      // Try to get a record to see its structure
      try {
        const records = await pb.collection('winning_teams').getFullList();
        console.log('Records count:', records.length);
        if (records.length > 0) {
          console.log('First record:', JSON.stringify(records[0], null, 2));
        }
      } catch (err) {
        console.log('No records yet or error getting records:', err.message);
      }
    } else {
      console.log('No winning_teams collection found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugWinningTeams();