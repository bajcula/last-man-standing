import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';

function Admin() {
  // State for different admin functions
  const [activeTab, setActiveTab] = useState('users'); // users, winners, reset
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // Reset game state
  const [resetStartWeek, setResetStartWeek] = useState(1);
  const [resetLoading, setResetLoading] = useState(false);
  const [currentWeekFromAPI, setCurrentWeekFromAPI] = useState(2); // Default fallback
  
  // User creation state
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [users, setUsers] = useState([]);

  // Deadline management state
  const [week, setWeek] = useState(1);
  const [deadline, setDeadline] = useState('');
  const [currentDeadlines, setCurrentDeadlines] = useState([]);

  // Winners marking state
  const [teams, setTeams] = useState([]);
  const [winners, setWinners] = useState({});
  const [selectedWeek, setSelectedWeek] = useState(1);
  
  // Premier League API state
  const [plMatches, setPlMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchesMessage, setMatchesMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load users
      const usersData = await pb.collection('users').getFullList({
        sort: 'email',
      });
      setUsers(usersData);

      // Load teams
      const teamsData = await pb.collection('teams').getFullList({
        sort: 'team_name',
      });
      setTeams(teamsData);

      // Load deadlines
      const deadlinesData = await pb.collection('deadlines').getFullList({
        sort: '-week_number',
      });
      setCurrentDeadlines(deadlinesData);
      
      if (deadlinesData.length > 0) {
        setWeek(Math.max(...deadlinesData.map(d => d.week_number)) + 1);
      }

      // Load existing winners for selected week
      await loadWinnersForWeek(selectedWeek);
    } catch (err) {
      console.error('Failed to load data:', err);
      setMessage('Failed to load data');
    }
  };

  const loadWinnersForWeek = async (weekNum) => {
    try {
      const winnersData = await pb.collection('winning_teams').getFullList({
        filter: `week_number = ${weekNum}`,
      });
      
      const winnersObj = {};
      winnersData.forEach(winner => {
        winnersObj[winner.team_id] = true;
      });
      setWinners(winnersObj);
    } catch (err) {
      console.error('Failed to load winners:', err);
    }
  };

  // User creation functions
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password) {
      setMessage('All fields are required');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await pb.collection('users').create({
        first_name: newUser.firstName,
        last_name: newUser.lastName,
        email: newUser.email,
        password: newUser.password,
        passwordConfirm: newUser.password,
        username: newUser.email, // Use email as username
      });

      setMessage('User created successfully!');
      setNewUser({ firstName: '', lastName: '', email: '', password: '' });
      loadData();
    } catch (err) {
      console.error('Failed to create user:', err);
      setMessage(err.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  // Deadline management functions
  const handleSetDeadline = async () => {
    if (!deadline) {
      setMessage('Please select a deadline');
      return;
    }

    const deadlineDate = new Date(deadline);
    const now = new Date();
    
    if (deadlineDate <= now) {
      setMessage('Deadline must be in the future');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const existing = await pb.collection('deadlines').getFullList({
        filter: `week_number = ${week}`,
      });

      if (existing.length > 0) {
        await pb.collection('deadlines').update(existing[0].id, {
          deadline_time: deadlineDate.toISOString(),
          is_closed: false,
        });
        setMessage(`Week ${week} deadline updated successfully!`);
      } else {
        await pb.collection('deadlines').create({
          week_number: week,
          deadline_time: deadlineDate.toISOString(),
          is_closed: false,
        });
        setMessage(`Week ${week} deadline created successfully!`);
      }

      setDeadline('');
      loadData();
    } catch (err) {
      console.error('Failed to set deadline:', err);
      setMessage('Failed to set deadline: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleWeekStatus = async (deadlineRecord) => {
    setLoading(true);
    try {
      await pb.collection('deadlines').update(deadlineRecord.id, {
        is_closed: !deadlineRecord.is_closed,
      });
      setMessage(`Week ${deadlineRecord.week_number} ${deadlineRecord.is_closed ? 'reopened' : 'closed'} successfully!`);
      loadData();
    } catch (err) {
      console.error('Failed to toggle week status:', err);
      setMessage('Failed to update week status');
    } finally {
      setLoading(false);
    }
  };

  // Winners marking functions
  const handleToggleWinner = async (teamId) => {
    const newWinners = { ...winners };
    
    if (newWinners[teamId]) {
      delete newWinners[teamId];
      // Remove from winning_teams
      try {
        const existing = await pb.collection('winning_teams').getFullList({
          filter: `week_number = ${selectedWeek} && team_id = "${teamId}"`,
        });
        if (existing.length > 0) {
          await pb.collection('winning_teams').delete(existing[0].id);
        }
      } catch (err) {
        console.error('Failed to remove winner:', err);
      }
    } else {
      newWinners[teamId] = true;
      // Add to winning_teams
      try {
        await pb.collection('winning_teams').create({
          week_number: selectedWeek,
          team_id: teamId,
        });
      } catch (err) {
        console.error('Failed to add winner:', err);
      }
    }
    
    setWinners(newWinners);
  };

  const handleWeekChange = (newWeek) => {
    setSelectedWeek(newWeek);
    loadWinnersForWeek(newWeek);
  };

  // Premier League API functions
  const fetchPremierLeagueMatches = async (roundNumber = null) => {
    setLoadingMatches(true);
    setMatchesMessage('');
    
    try {
      // Fetch recent results if no round specified
      const apiUrl = roundNumber 
        ? `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=4328&r=${roundNumber}&s=2025-2026`
        : 'https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=4328';
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (data.events && data.events.length > 0) {
        const matches = data.events.map(match => ({
          id: match.idEvent,
          homeTeam: match.strHomeTeam,
          awayTeam: match.strAwayTeam,
          homeScore: match.intHomeScore,
          awayScore: match.intAwayScore,
          status: match.strStatus,
          date: match.dateEvent,
          time: match.strTime,
          round: match.strRound,
          winner: getMatchWinner(match)
        }));
        
        setPlMatches(matches);
        setMatchesMessage(`Loaded ${matches.length} matches`);
        
        // Auto-fill winners for finished matches
        if (roundNumber === selectedWeek) {
          await prefillWinnersFromMatches(matches);
        }
      } else {
        setMatchesMessage('No matches found for this round');
        setPlMatches([]);
      }
    } catch (error) {
      setMatchesMessage('Failed to fetch matches: ' + error.message);
      console.error('Error fetching matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  const getMatchWinner = (match) => {
    if (match.strStatus !== 'Match Finished') return null;
    
    const homeScore = parseInt(match.intHomeScore) || 0;
    const awayScore = parseInt(match.intAwayScore) || 0;
    
    if (homeScore > awayScore) return match.strHomeTeam;
    if (awayScore > homeScore) return match.strAwayTeam;
    return 'Draw';
  };

  const findTeamByApiName = (apiTeamName) => {
    // Create mapping between API names and our database names
    const teamMappings = {
      'Manchester United': 'Manchester United',
      'Manchester City': 'Manchester City', 
      'Man United': 'Manchester United',
      'Man City': 'Manchester City',
      'Newcastle': 'Newcastle United',
      'Newcastle United': 'Newcastle United',
      'West Ham': 'West Ham United',
      'West Ham United': 'West Ham United',
      'Tottenham': 'Tottenham Hotspur',
      'Tottenham Hotspur': 'Tottenham Hotspur',
      'Leicester': 'Leicester City',
      'Leicester City': 'Leicester City',
      'Wolves': 'Wolverhampton Wanderers',
      'Wolverhampton': 'Wolverhampton Wanderers',
      'Nottm Forest': 'Nottingham Forest',
      'Nottingham Forest': 'Nottingham Forest',
      'Brighton': 'Brighton',
      'Crystal Palace': 'Crystal Palace'
    };

    // First try direct mapping
    const mappedName = teamMappings[apiTeamName];
    if (mappedName) {
      const team = teams.find(t => t.team_name === mappedName);
      if (team) return team;
    }

    // Try exact match
    const exactMatch = teams.find(t => t.team_name === apiTeamName);
    if (exactMatch) return exactMatch;

    // Try partial matches
    const partialMatch = teams.find(team => 
      team.team_name.includes(apiTeamName) || 
      apiTeamName.includes(team.team_name.split(' ')[0]) ||
      team.team_short_name === apiTeamName.substring(0, 3).toUpperCase()
    );
    
    return partialMatch;
  };

  const prefillWinnersFromMatches = async (matches) => {
    try {
      const newWinners = { ...winners };
      
      // Clear existing winners for this week
      Object.keys(newWinners).forEach(teamId => delete newWinners[teamId]);
      
      console.log('🔍 Matching teams from API:', matches.map(m => m.winner).filter(w => w !== 'Draw'));
      
      for (const match of matches) {
        if (match.winner && match.winner !== 'Draw') {
          const winningTeam = findTeamByApiName(match.winner);
          
          if (winningTeam) {
            console.log(`✅ Matched: ${match.winner} → ${winningTeam.team_name}`);
            newWinners[winningTeam.id] = true;
            
            // Add to database
            try {
              await pb.collection('winning_teams').create({
                week_number: selectedWeek,
                team_id: winningTeam.id,
              });
            } catch (err) {
              // Might already exist, ignore error
              console.log('Winner already exists or error:', err.message);
            }
          } else {
            console.log(`❌ No match found for: ${match.winner}`);
          }
        }
      }
      
      setWinners(newWinners);
      setMatchesMessage(prev => prev + ` | Pre-filled ${Object.keys(newWinners).length} winners`);
    } catch (error) {
      console.error('Error prefilling winners:', error);
    }
  };

  const submitWeekResults = async () => {
    if (Object.keys(winners).length === 0) {
      setMessage('Please select at least one winning team first');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to submit Week ${selectedWeek} results?\n\n` +
      `This will:\n` +
      `• Eliminate users who picked losing teams\n` +
      `• Create deadline for Week ${selectedWeek + 1}\n` +
      `• This action cannot be undone`
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage('');

    try {
      // Get all picks for this week
      const picksData = await pb.collection('picks').getFullList({
        filter: `week_number = ${selectedWeek}`,
        expand: 'user_id,team_id'
      });

      console.log(`📊 Processing ${picksData.length} picks for Week ${selectedWeek}`);

      let eliminatedCount = 0;
      let advancedCount = 0;

      // Process each pick to determine elimination
      for (const pick of picksData) {
        const isWinner = winners[pick.team_id];
        const userName = `${pick.expand?.user_id?.first_name} ${pick.expand?.user_id?.last_name}`;
        const teamName = pick.expand?.team_id?.team_name;

        if (!isWinner) {
          // User picked a losing team - they're eliminated
          console.log(`❌ Eliminated: ${userName} (picked ${teamName})`);
          eliminatedCount++;
        } else {
          // User picked a winning team - they advance
          console.log(`✅ Advanced: ${userName} (picked ${teamName})`);
          advancedCount++;
        }
      }

      // Fetch next week's matches to set deadline 2 hours before first match
      let nextWeekDeadline = new Date();
      
      try {
        const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=4328&r=${selectedWeek + 1}&s=2025-2026`;
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (data.events && data.events.length > 0) {
          // Find the earliest match
          let earliestMatch = data.events[0];
          for (const match of data.events) {
            const matchDate = new Date(match.dateEvent + ' ' + match.strTime);
            const earliestDate = new Date(earliestMatch.dateEvent + ' ' + earliestMatch.strTime);
            if (matchDate < earliestDate) {
              earliestMatch = match;
            }
          }
          
          // Set deadline 2 hours before the earliest match
          const firstMatchTime = new Date(earliestMatch.dateEvent + ' ' + earliestMatch.strTime);
          nextWeekDeadline = new Date(firstMatchTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours before
          
          console.log(`⚽ First match Week ${selectedWeek + 1}: ${earliestMatch.strHomeTeam} vs ${earliestMatch.strAwayTeam} at ${firstMatchTime.toLocaleString()}`);
          console.log(`⏰ Setting deadline 2 hours before: ${nextWeekDeadline.toLocaleString()}`);
        } else {
          // Fallback if API fails - 7 days from now at 3 PM
          nextWeekDeadline.setDate(nextWeekDeadline.getDate() + 7);
          nextWeekDeadline.setHours(15, 0, 0, 0);
          console.log(`⚠️ No matches found for Week ${selectedWeek + 1}, using default deadline`);
        }
      } catch (err) {
        // Fallback if API fails
        nextWeekDeadline.setDate(nextWeekDeadline.getDate() + 7);
        nextWeekDeadline.setHours(15, 0, 0, 0);
        console.log(`⚠️ Failed to fetch matches, using default deadline`);
      }

      try {
        await pb.collection('deadlines').create({
          week_number: selectedWeek + 1,
          deadline_time: nextWeekDeadline.toISOString(),
          is_closed: false
        });
        console.log(`📅 Created deadline for Week ${selectedWeek + 1}: ${nextWeekDeadline.toLocaleString()}`);
      } catch (err) {
        console.log(`⚠️ Deadline might already exist for Week ${selectedWeek + 1}`);
      }

      setMessage(
        `🎉 Week ${selectedWeek} results submitted successfully!\n\n` +
        `📊 Summary:\n` +
        `• ${advancedCount} users advanced to Week ${selectedWeek + 1}\n` +
        `• ${eliminatedCount} users eliminated\n` +
        `• Next deadline: ${nextWeekDeadline.toLocaleString()}`
      );

      // Refresh data to show updated state
      loadData();

    } catch (err) {
      console.error('Failed to submit week results:', err);
      setMessage('Failed to submit week results: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Get current Premier League week from API
  const getCurrentPLWeek = async () => {
    try {
      // Try to find the current week by checking recent weeks for upcoming matches
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      // Check weeks 1-10 to find which has upcoming matches
      for (let week = 1; week <= 10; week++) {
        const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=4328&r=${week}&s=2025-2026`;
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (data.events && data.events.length > 0) {
          // Check if any matches in this week are in the future
          const hasUpcomingMatches = data.events.some(match => {
            const matchDate = new Date(match.dateEvent);
            return matchDate >= today;
          });
          
          if (hasUpcomingMatches) {
            console.log(`🎯 Current week detected: ${week} (has upcoming matches)`);
            return week;
          }
        }
      }
      
      // Fallback: return week 1 if no upcoming matches found
      console.log('⚠️ No upcoming matches found, defaulting to week 1');
      return 1;
    } catch (error) {
      console.error('Error fetching current week:', error);
      // Fallback to manual calculation if API fails
      return 2; // Safe default for late August 2025
    }
  };

  // Remove this line since getCurrentPLWeek is now async

  const resetGame = async () => {
    if (!resetStartWeek || resetStartWeek < 1 || resetStartWeek > 38) {
      setMessage('Please enter a valid week number (1-38)');
      return;
    }

    const currentPLWeek = await getCurrentPLWeek();
    if (resetStartWeek < currentPLWeek) {
      setMessage(`Cannot start from Week ${resetStartWeek} as it has already been played. Current week is ${currentPLWeek}.`);
      return;
    }

    const confirmed = window.confirm(
      `🚨 DANGER: This will completely reset the game!\n\n` +
      `This action will:\n` +
      `• DELETE all existing picks\n` +
      `• DELETE all existing deadlines\n` +
      `• DELETE all winning teams data\n` +
      `• START fresh competition from Week ${resetStartWeek}\n` +
      `• Create new deadline for Week ${resetStartWeek}\n\n` +
      `⚠️ THIS CANNOT BE UNDONE!\n\n` +
      `Are you sure you want to start a new game from Week ${resetStartWeek}?`
    );

    if (!confirmed) {
      setMessage('Reset cancelled');
      return;
    }

    setResetLoading(true);
    setMessage('');

    try {
      console.log(`🗑️ Starting game reset to Week ${resetStartWeek}...`);

      // 1. Delete all existing picks
      const existingPicks = await pb.collection('picks').getFullList();
      for (const pick of existingPicks) {
        await pb.collection('picks').delete(pick.id);
      }
      console.log(`🗑️ Deleted ${existingPicks.length} picks`);

      // 2. Delete all existing deadlines
      const existingDeadlines = await pb.collection('deadlines').getFullList();
      for (const deadline of existingDeadlines) {
        await pb.collection('deadlines').delete(deadline.id);
      }
      console.log(`🗑️ Deleted ${existingDeadlines.length} deadlines`);

      // 3. Delete all winning teams
      const existingWinners = await pb.collection('winning_teams').getFullList();
      for (const winner of existingWinners) {
        await pb.collection('winning_teams').delete(winner.id);
      }
      console.log(`🗑️ Deleted ${existingWinners.length} winners`);

      // 4. Fetch matches for starting week to set deadline 2 hours before first match
      let newDeadline = new Date();
      
      try {
        const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=4328&r=${resetStartWeek}&s=2025-2026`;
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (data.events && data.events.length > 0) {
          // Find the earliest match
          let earliestMatch = data.events[0];
          for (const match of data.events) {
            const matchDate = new Date(match.dateEvent + ' ' + match.strTime);
            const earliestDate = new Date(earliestMatch.dateEvent + ' ' + earliestMatch.strTime);
            if (matchDate < earliestDate) {
              earliestMatch = match;
            }
          }
          
          // Set deadline 2 hours before the earliest match
          const firstMatchTime = new Date(earliestMatch.dateEvent + ' ' + earliestMatch.strTime);
          newDeadline = new Date(firstMatchTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours before
          
          console.log(`⚽ First match Week ${resetStartWeek}: ${earliestMatch.strHomeTeam} vs ${earliestMatch.strAwayTeam} at ${firstMatchTime.toLocaleString()}`);
          console.log(`⏰ Setting deadline 2 hours before: ${newDeadline.toLocaleString()}`);
        } else {
          // Fallback - 7 days from now at 3 PM
          newDeadline.setDate(newDeadline.getDate() + 7);
          newDeadline.setHours(15, 0, 0, 0);
          console.log(`⚠️ No matches found for Week ${resetStartWeek}, using default deadline`);
        }
      } catch (err) {
        // Fallback if API fails
        newDeadline.setDate(newDeadline.getDate() + 7);
        newDeadline.setHours(15, 0, 0, 0);
        console.log(`⚠️ Failed to fetch matches, using default deadline`);
      }

      await pb.collection('deadlines').create({
        week_number: resetStartWeek,
        deadline_time: newDeadline.toISOString(),
        is_closed: false
      });
      console.log(`📅 Created deadline for Week ${resetStartWeek}: ${newDeadline.toLocaleString()}`);

      setMessage(
        `🎉 Game Successfully Reset!\n\n` +
        `🆕 Fresh Competition Started:\n` +
        `• All previous data cleared\n` +
        `• Starting from Week ${resetStartWeek}\n` +
        `• New deadline: ${newDeadline.toLocaleString()}\n` +
        `• All users can make fresh picks\n\n` +
        `📢 Notify players that a new competition has begun!`
      );

      // Reset selected week to the new starting week
      setSelectedWeek(resetStartWeek);
      setWeek(resetStartWeek);
      
      // Refresh all data
      loadData();

    } catch (err) {
      console.error('Failed to reset game:', err);
      setMessage('Failed to reset game: ' + err.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="card admin-panel">
      <h2>Admin Panel</h2>
      
      {message && (
        <div className={message.includes('Failed') || message.includes('required') ? 'error' : 'success'}>
          {message}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #ddd' }}>
        <button 
          onClick={() => setActiveTab('users')}
          style={{ 
            padding: '10px 20px', 
            border: 'none', 
            backgroundColor: activeTab === 'users' ? '#007bff' : 'transparent',
            color: activeTab === 'users' ? 'white' : '#007bff',
            cursor: 'pointer'
          }}
        >
          Manage Users
        </button>
        <button 
          onClick={() => setActiveTab('winners')}
          style={{ 
            padding: '10px 20px', 
            border: 'none', 
            backgroundColor: activeTab === 'winners' ? '#007bff' : 'transparent',
            color: activeTab === 'winners' ? 'white' : '#007bff',
            cursor: 'pointer'
          }}
        >
          Mark Winners
        </button>
        <button 
          onClick={() => setActiveTab('reset')}
          style={{ 
            padding: '10px 20px', 
            border: 'none', 
            backgroundColor: activeTab === 'reset' ? '#dc3545' : 'transparent',
            color: activeTab === 'reset' ? 'white' : '#dc3545',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🚨 Reset Game
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <div style={{ marginBottom: '30px' }}>
            <h3>Create New User</h3>
            <form onSubmit={handleCreateUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={newUser.firstName}
                    onChange={(e) => setNewUser({...newUser, firstName: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({...newUser, lastName: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    required
                  />
                </div>
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create User'}
              </button>
            </form>
          </div>

          <div>
            <h3>Registered Users ({users.length})</h3>
            <div className="users-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
              {users.map(user => (
                <div key={user.id} className="user-card" style={{ padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
                  <strong>{user.first_name} {user.last_name}</strong>
                  <p>{user.email}</p>
                  {user.isAdmin && <span className="admin-badge">ADMIN</span>}
                  <p style={{fontSize: '12px', marginTop: '5px', color: '#666'}}>
                    Joined: {new Date(user.created).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* Winners Tab */}
      {activeTab === 'winners' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h3>Mark Winners for Week</h3>
            <div className="form-group">
              <label>Select Week</label>
              <input
                type="number"
                value={selectedWeek}
                onChange={(e) => handleWeekChange(Number(e.target.value))}
                min="1"
                max="38"
              />
            </div>
          </div>

          {/* Premier League API Section */}
          <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
            <h4>🏆 Premier League Match Results</h4>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
              <button 
                onClick={() => fetchPremierLeagueMatches(selectedWeek)}
                disabled={loadingMatches}
                style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}
              >
                {loadingMatches ? 'Loading...' : `Fetch Week ${selectedWeek} & Auto-Fill`}
              </button>
            </div>
            
            {matchesMessage && (
              <div style={{ padding: '10px', backgroundColor: matchesMessage.includes('Failed') ? '#f8d7da' : '#d4edda', borderRadius: '4px', marginBottom: '15px' }}>
                {matchesMessage}
              </div>
            )}

            {plMatches.length > 0 && (
              <div>
                <h5>Match Results:</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                  {plMatches.map(match => (
                    <div key={match.id} style={{ 
                      padding: '10px', 
                      border: '1px solid #ddd', 
                      borderRadius: '4px', 
                      backgroundColor: match.status === 'Match Finished' ? '#e8f5e8' : '#fff3cd' 
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                        {match.homeTeam} vs {match.awayTeam}
                      </div>
                      {match.status === 'Match Finished' ? (
                        <div>
                          <div>Score: {match.homeScore}-{match.awayScore}</div>
                          {match.winner !== 'Draw' && (
                            <div style={{ color: '#28a745', fontWeight: 'bold' }}>Winner: {match.winner}</div>
                          )}
                          {match.winner === 'Draw' && (
                            <div style={{ color: '#6c757d' }}>Result: Draw</div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: '#856404' }}>
                          {match.date} {match.time}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <h4>Select Winning Teams for Week {selectedWeek}</h4>
            <p style={{ color: '#666', marginBottom: '15px' }}>Check the teams that won their games this week:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {teams.map(team => (
                <label key={team.id} style={{ display: 'flex', alignItems: 'center', padding: '10px', border: '1px solid #ddd', borderRadius: '5px', cursor: 'pointer', backgroundColor: winners[team.id] ? '#d4edda' : 'transparent' }}>
                  <input
                    type="checkbox"
                    checked={winners[team.id] || false}
                    onChange={() => handleToggleWinner(team.id)}
                    style={{ marginRight: '8px' }}
                  />
                  <div>
                    <strong>{team.team_short_name}</strong>
                    <br />
                    <small>{team.team_name}</small>
                  </div>
                </label>
              ))}
            </div>
            
            {Object.keys(winners).length > 0 && (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#d4edda', borderRadius: '5px' }}>
                <strong>✅ {Object.keys(winners).length} teams marked as winners for Week {selectedWeek}</strong>
                <p>Users who picked these teams will advance to the next week.</p>
                
                <button
                  onClick={submitWeekResults}
                  disabled={loading}
                  style={{
                    marginTop: '15px',
                    padding: '12px 24px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {loading ? 'Processing...' : `🔒 Submit Week ${selectedWeek} Results & Advance Round`}
                </button>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  This will eliminate users with incorrect picks and unlock the next week for winners.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset Game Tab */}
      {activeTab === 'reset' && (
        <div>
          <div style={{ 
            backgroundColor: '#f8d7da', 
            border: '2px solid #f5c6cb', 
            borderRadius: '8px', 
            padding: '20px', 
            marginBottom: '30px' 
          }}>
            <h3 style={{ color: '#721c24', marginBottom: '15px' }}>⚠️ Danger Zone - Reset Entire Game</h3>
            <p style={{ color: '#721c24', marginBottom: '15px' }}>
              This will completely wipe all game data and start a fresh competition from any week you specify.
              Use this when the game has ended and you want to start a new one.
            </p>
            <p style={{ color: '#721c24', fontWeight: 'bold' }}>
              ⚠️ WARNING: This can't be undone!
            </p>
          </div>

          <div style={{ 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffc107', 
            borderRadius: '8px', 
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h4 style={{ color: '#856404', marginBottom: '15px' }}>🔄 New Game Configuration</h4>
            
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '5px' }}>
              <p style={{ margin: '0', color: '#1565c0', fontWeight: 'bold' }}>
                📅 Current Premier League Week: {currentPLWeek}
              </p>
              <small style={{ color: '#1565c0' }}>
                You can only start from Week {currentPLWeek} or later
              </small>
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ color: '#856404', fontWeight: 'bold' }}>Starting Week Number</label>
              <input
                type="number"
                value={resetStartWeek}
                onChange={(e) => setResetStartWeek(Number(e.target.value))}
                min={currentPLWeek}
                max="38"
                style={{ 
                  width: '100px', 
                  textAlign: 'center', 
                  fontSize: '18px', 
                  fontWeight: 'bold',
                  marginTop: '5px',
                  borderColor: resetStartWeek < currentPLWeek ? '#dc3545' : '#ced4da'
                }}
              />
              <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                Enter the Premier League week number to start from ({currentPLWeek}-38)
              </small>
              
              {resetStartWeek < currentPLWeek && (
                <div style={{ 
                  marginTop: '10px', 
                  padding: '8px', 
                  backgroundColor: '#f8d7da', 
                  border: '1px solid #f5c6cb', 
                  borderRadius: '4px',
                  color: '#721c24'
                }}>
                  ⚠️ Week {resetStartWeek} has already been played. Please select Week {currentPLWeek} or later.
                </div>
              )}
            </div>

            <div style={{ fontSize: '14px', color: '#856404' }}>
              <p><strong>Starting Week {resetStartWeek} will:</strong></p>
              <ul style={{ marginLeft: '20px' }}>
                <li>Fetch Week {resetStartWeek} fixtures from Premier League API</li>
                <li>Allow all users to make fresh picks</li>
                <li>Set deadline 2 hours before the first match</li>
                <li>Clear all previous competition data</li>
              </ul>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={resetGame}
              disabled={resetLoading || !resetStartWeek || resetStartWeek < currentPLWeek}
              style={{
                padding: '15px 30px',
                backgroundColor: resetStartWeek < currentPLWeek ? '#6c757d' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: resetLoading || resetStartWeek < currentPLWeek ? 'not-allowed' : 'pointer',
                opacity: resetLoading || resetStartWeek < currentPLWeek ? 0.6 : 1
              }}
            >
              {resetLoading ? '🔄 Resetting Game...' : 
               resetStartWeek < currentPLWeek ? `❌ Cannot Reset to Past Week ${resetStartWeek}` :
               `🚨 Reset & Start New Game from Week ${resetStartWeek}`}
            </button>
            
            <p style={{ 
              marginTop: '10px', 
              fontSize: '12px', 
              color: '#666',
              maxWidth: '500px',
              margin: '10px auto 0'
            }}>
              This will delete ALL picks, deadlines, and winners. A confirmation dialog will appear.
              Make sure to notify all players before doing this!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;