import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';

function AllPlayersPicksHistory() {
  const [picksData, setPicksData] = useState({});
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxWeek, setMaxWeek] = useState(0);
  const [winningTeams, setWinningTeams] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(0);

  useEffect(() => {
    loadHistoricalData();
  }, []);

  const isWeekFinished = (week) => {
    return winningTeams.some(winner => winner.week_number === week);
  };

  const getBorderStyle = (week, teamId) => {
    const weekFinished = isWeekFinished(week);
    
    // No border for current/ongoing week
    if (week === currentWeek) {
      return '2px solid #007bff';
    }
    
    // Check if this team won in this week
    const teamWon = winningTeams.some(winner => 
      winner.week_number === week && winner.team_id === teamId
    );
    
    if (!weekFinished) {
      // Week is ongoing or no results yet - default blue border
      return '2px solid #007bff';
    }
    
    // Week has results - use double border and stronger colors for finished weeks
    const borderWidth = '3px double';
    return teamWon ? `${borderWidth} #28a745` : `${borderWidth} #dc3545`;
  };

  const calculateUserEliminations = async (users) => {
    try {
      // Get all winning teams data
      const allWinners = await pb.collection('winning_teams').getFullList();
      
      return users.map(user => {
        let eliminatedWeek = null;
        
        // Check each week in order
        const sortedPicks = user.picks.sort((a, b) => a.week - b.week);
        const maxWeek = Math.max(...user.picks.map(p => p.week), 0);
        
        for (let week = 1; week <= maxWeek; week++) {
          const pickForWeek = sortedPicks.find(p => p.week === week);
          
          if (!pickForWeek) {
            // No pick for this week - they would be eliminated
            // (though our system auto-assigns, so this shouldn't happen)
            continue;
          }
          
          // Check if their pick won
          const teamWon = allWinners.some(winner => 
            winner.week_number === week && winner.team_id === pickForWeek.teamInfo?.id
          );
          
          if (!teamWon && allWinners.some(w => w.week_number === week)) {
            // There are winners for this week, but this user's pick wasn't one
            eliminatedWeek = week;
            break;
          }
        }
        
        return { eliminatedWeek };
      });
    } catch (err) {
      console.error('Error calculating eliminations:', err);
      return users.map(() => ({ eliminatedWeek: null }));
    }
  };

  const loadHistoricalData = async () => {
    try {
      // Get all picks with user and team info
      const picks = await pb.collection('picks').getFullList({
        expand: 'user_id,team_id',
        sort: 'week_number',
      });
      
      // Manual user expansion since PocketBase expand might not work for auth users
      try {
        const users = await pb.collection('users').getFullList();
        
        // Create user lookup
        const userLookup = {};
        users.forEach(user => {
          userLookup[user.id] = user;
        });
        
        // Update picks with manual user data
        picks.forEach(pick => {
          if (!pick.expand?.user_id && userLookup[pick.user_id]) {
            if (!pick.expand) pick.expand = {};
            pick.expand.user_id = userLookup[pick.user_id];
          }
        });
      } catch (userErr) {
        console.log('Could not load users directly:', userErr);
      }

      // Get all deadlines to check which weeks are closed
      const deadlines = await pb.collection('deadlines').getFullList({
        sort: 'week_number',
      });

      // Get winning teams data
      const allWinners = await pb.collection('winning_teams').getFullList();
      setWinningTeams(allWinners);

      // Determine current week (latest week with active/upcoming deadline)
      const now = new Date();
      const currentWeekData = deadlines.find(d => 
        new Date(d.deadline_time) > now || d.status === 'active'
      );
      if (currentWeekData) {
        setCurrentWeek(currentWeekData.week_number);
      }

      // Check if current user is admin
      const currentUser = pb.authStore.model;
      const isAdmin = currentUser?.isAdmin || false;

      // Filter picks to only show weeks where deadline has passed (unless user is admin)
      let filteredPicks;
      if (isAdmin) {
        // Admin can see all picks, including current week
        filteredPicks = picks;
      } else {
        // Regular users only see picks after deadline has passed
        const now = new Date();
        const closedWeeks = deadlines
          .filter(d => new Date(d.deadline_time) < now || d.is_closed)
          .map(d => d.week_number);

        filteredPicks = picks.filter(pick => 
          closedWeeks.includes(pick.week_number)
        );
      }

      // Get all unique users and their elimination status
      const userMap = new Map();
      
      filteredPicks.forEach(pick => {
        const user = pick.expand?.user_id;
        const userId = pick.user_id;
        
        if (!userMap.has(userId)) {
          let displayName;
          if (user?.first_name && user?.last_name) {
            displayName = `${user.last_name}, ${user.first_name}`;
          } else if (user?.firstName && user?.lastName) {
            displayName = `${user.lastName}, ${user.firstName}`;
          } else if (user?.name) {
            displayName = user.name;
          } else {
            displayName = `User ${userId.substring(0, 8)}...`;
          }
          
          userMap.set(userId, {
            displayName,
            firstName: user?.first_name || user?.firstName || '',
            lastName: user?.last_name || user?.lastName || '',
            eliminatedWeek: null,
            picks: []
          });
        }
        
        userMap.get(userId).picks.push({
          week: pick.week_number,
          teamInfo: pick.expand?.team_id,
          pickDate: pick.created
        });
      });

      // Calculate elimination status for each user
      const userElimination = await calculateUserEliminations(Array.from(userMap.values()));
      
      // Update userMap with elimination info
      userElimination.forEach((eliminationInfo, index) => {
        const userArray = Array.from(userMap.values());
        userArray[index].eliminatedWeek = eliminationInfo.eliminatedWeek;
      });

      // Organize picks by week and player
      const organized = {};
      let maxWeekFound = 0;

      filteredPicks.forEach(pick => {
        const week = pick.week_number;
        const user = userMap.get(pick.user_id);
        const playerName = user.displayName;
        const teamInfo = pick.expand?.team_id;

        if (!organized[week]) {
          organized[week] = {};
        }
        organized[week][playerName] = {
          team: teamInfo?.team_name || 'Unknown Team',
          shortName: teamInfo?.team_short_name || 'UNK',
          pickDate: pick.created,
          teamId: teamInfo?.id
        };

        maxWeekFound = Math.max(maxWeekFound, week);
      });

      // Sort players: active players first (alphabetically), then eliminated players (by elimination round, then alphabetically)
      const sortedPlayers = Array.from(userMap.values()).sort((a, b) => {
        // Active players (not eliminated) come first
        if (a.eliminatedWeek === null && b.eliminatedWeek !== null) return -1;
        if (a.eliminatedWeek !== null && b.eliminatedWeek === null) return 1;
        
        // Both eliminated or both active
        if (a.eliminatedWeek !== null && b.eliminatedWeek !== null) {
          // Sort by elimination week (later elimination = better ranking)
          if (a.eliminatedWeek !== b.eliminatedWeek) {
            return b.eliminatedWeek - a.eliminatedWeek;
          }
        }
        
        // Same elimination status, sort alphabetically by last name
        return a.displayName.localeCompare(b.displayName);
      }).map(user => user.displayName);

      setPicksData(organized);
      setPlayers(sortedPlayers);
      setMaxWeek(maxWeekFound);
    } catch (err) {
      console.error('Failed to load historical data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="card">Loading historical data...</div>;

  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  const availableWeeks = weeks.filter(week => picksData[week]);

  return (
    <div className="card">
      <h2>All Players - Historical Picks</h2>
      <p>Shows all picks for weeks where the deadline has passed</p>
      
      {availableWeeks.length === 0 ? (
        <p>No historical picks available yet</p>
      ) : (
        <div className="history-table-container" style={{ overflowX: 'auto' }}>
          <table className="history-table">
            <thead>
              <tr>
                <th className="sticky-col">Player</th>
                {availableWeeks.map(week => {
                  const weekFinished = isWeekFinished(week);
                  return (
                    <th key={week} className={weekFinished ? 'week-done' : ''} style={{ minWidth: '70px', whiteSpace: 'nowrap' }}>
                      Week {week}
                      {weekFinished && (
                        <div style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 'bold', marginTop: '2px' }}>
                          DONE
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {players.map(player => (
                <tr key={player}>
                  <td className="sticky-col" style={{ fontWeight: 'bold' }}>
                    {player}
                  </td>
                  {availableWeeks.map(week => {
                    const pick = picksData[week]?.[player];
                    return (
                      <td key={`${player}-${week}`} style={{ padding: '6px', minWidth: '70px', textAlign: 'center' }}>
                        {pick ? (
                          <div style={{
                            border: getBorderStyle(week, pick.teamId),
                            borderRadius: '6px',
                            padding: '4px',
                            backgroundColor: '#f8f9fa',
                            textAlign: 'center',
                            minWidth: '50px'
                          }}>
                            <strong style={{ 
                              color: '#007bff', 
                              fontSize: '14px',
                              display: 'block'
                            }}>
                              {pick.shortName}
                            </strong>
                          </div>
                        ) : (
                          <span style={{ color: '#999' }}>-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {availableWeeks.length > 0 && (
        <div style={{ marginTop: '20px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
          <p>🔒 Current week picks are hidden until deadline passes</p>
        </div>
      )}
    </div>
  );
}

export default AllPlayersPicksHistory;