import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';

function PickTeam() {
  const [teams, setTeams] = useState([]);
  const [myPicks, setMyPicks] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [deadline, setDeadline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isEliminated, setIsEliminated] = useState(false);
  const [eliminationInfo, setEliminationInfo] = useState(null);
  const [weekMatches, setWeekMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Get all teams
      const teamsData = await pb.collection('teams').getFullList({
        sort: 'team_name',
      });
      setTeams(teamsData);

      // Get my picks
      const picksData = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model.id}"`,
        expand: 'team_id',
      });
      setMyPicks(picksData);

      // Get current week and deadline
      const deadlines = await pb.collection('deadlines').getFullList({
        sort: '-week_number',
      });
      
      let currentWeekNum = 1;
      if (deadlines.length > 0) {
        const currentDeadline = deadlines[0];
        currentWeekNum = currentDeadline.week_number;
        setCurrentWeek(currentWeekNum);
        setDeadline(currentDeadline);
      }

      // Auto-assign team for current week if user doesn't have a pick
      const thisWeekPick = picksData.find(p => p.week_number === currentWeekNum);
      if (!thisWeekPick) {
        const autoAssignedPick = await autoAssignTeam(teamsData, picksData, currentWeekNum);
        if (autoAssignedPick) {
          picksData.push(autoAssignedPick);
          setMyPicks(picksData);
          setSelectedTeam(autoAssignedPick.team_id);
        }
      } else {
        setSelectedTeam(thisWeekPick.team_id);
      }

      // Check elimination status
      await checkEliminationStatus(picksData, currentWeekNum);

      // Load matches for current week
      await loadWeekMatches(currentWeekNum);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadWeekMatches = async (weekNum) => {
    setMatchesLoading(true);
    try {
      const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=4328&r=${weekNum}&s=2025-2026`;
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
          winner: getMatchWinner(match)
        }));
        
        setWeekMatches(matches);
      } else {
        setWeekMatches([]);
      }
    } catch (error) {
      console.error('Failed to load week matches:', error);
      setWeekMatches([]);
    } finally {
      setMatchesLoading(false);
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

  const autoAssignTeam = async (allTeams, userPicks, weekNumber) => {
    try {
      // Get teams sorted alphabetically
      const sortedTeams = [...allTeams].sort((a, b) => a.team_name.localeCompare(b.team_name));
      
      // Get teams user has already picked
      const usedTeamIds = userPicks.map(pick => pick.team_id);
      
      // Find first available team
      const availableTeam = sortedTeams.find(team => !usedTeamIds.includes(team.id));
      
      if (!availableTeam) {
        console.error('No available teams for auto-assignment');
        return null;
      }
      
      // Create the pick
      const autoPick = await pb.collection('picks').create({
        user_id: pb.authStore.model.id,
        team_id: availableTeam.id,
        week_number: weekNumber,
      });
      
      console.log(`Auto-assigned ${availableTeam.team_name} for Week ${weekNumber}`);
      
      // Return pick with expanded team data
      return {
        ...autoPick,
        expand: { team_id: availableTeam }
      };
      
    } catch (error) {
      console.error('Failed to auto-assign team:', error);
      return null;
    }
  };

  const checkEliminationStatus = async (picksData, currentWeekNum) => {
    try {
      // If this is week 1, no one can be eliminated yet
      if (currentWeekNum <= 1) {
        setIsEliminated(false);
        return;
      }

      // Check if there are any winning teams data at all
      // If not, this might be a fresh game reset - no one should be eliminated
      const allWinners = await pb.collection('winning_teams').getFullList();
      if (allWinners.length === 0) {
        setIsEliminated(false);
        setEliminationInfo(null);
        return;
      }

      // Check each previous week to see if user is still alive
      for (let week = 1; week < currentWeekNum; week++) {
        // First check if this week even had winners declared
        const weekWinners = await pb.collection('winning_teams').getFullList({
          filter: `week_number = ${week}`,
        });
        
        // If no winners were declared for this week, skip it entirely (week wasn't played)
        if (weekWinners.length === 0) {
          console.log(`Week ${week} had no winners declared - skipping entirely (no picks, no elimination)`);
          continue;
        }

        // Find user's pick for this week
        const pickForWeek = picksData.find(p => p.week_number === week);

        if (!pickForWeek) {
          // User has no pick for this week - they're eliminated
          setIsEliminated(true);
          setEliminationInfo({
            reason: 'No pick made',
            week: week,
            teamName: 'No team selected',
            eliminatedWeek: week
          });
          return;
        }

        // Check if their pick was a winner
        const userTeamWon = weekWinners.some(winner => winner.team_id === pickForWeek.team_id);

        if (!userTeamWon) {
          // Their pick was not a winner - they're eliminated
          setIsEliminated(true);
          setEliminationInfo({
            reason: 'Team lost',
            week: week,
            teamName: pickForWeek.expand?.team_id?.team_name || 'Unknown Team',
            eliminatedWeek: week
          });
          return;
        }
      }

      // If we get here, user is still alive
      setIsEliminated(false);
      setEliminationInfo(null);
    } catch (err) {
      console.error('Failed to check elimination status:', err);
    }
  };

  const handleSubmit = async () => {
    if (!selectedTeam) {
      setError('Please select a team');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Check if pick exists for this week
      const existingPicks = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model.id}" && week_number = ${currentWeek}`,
      });

      if (existingPicks.length > 0) {
        // Update existing pick
        await pb.collection('picks').update(existingPicks[0].id, {
          team_id: selectedTeam,
        });
      } else {
        // Create new pick
        await pb.collection('picks').create({
          user_id: pb.authStore.model.id,
          team_id: selectedTeam,
          week_number: currentWeek,
        });
      }

      setSuccess('Pick submitted successfully!');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to submit pick');
    } finally {
      setLoading(false);
    }
  };

  const isTeamDisabled = (teamId) => {
    return myPicks.some(pick => pick.team_id === teamId && pick.week_number !== currentWeek);
  };

  const isDeadlinePassed = () => {
    if (!deadline) return false;
    return new Date(deadline.deadline_time) < new Date() || deadline.is_closed;
  };

  const getDeadlineStatus = () => {
    if (!deadline) return { status: 'no-deadline', message: 'No deadline set for this week' };
    
    const deadlineTime = new Date(deadline.deadline_time);
    const now = new Date();
    const timeDiff = deadlineTime - now;
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (deadline.is_closed) {
      return { 
        status: 'closed', 
        message: 'Week has been manually closed by admin',
        color: '#dc3545'
      };
    }
    
    if (timeDiff <= 0) {
      return { 
        status: 'passed', 
        message: 'Deadline has passed',
        color: '#dc3545'
      };
    }
    
    if (hoursDiff <= 1) {
      return { 
        status: 'urgent', 
        message: `⚠️ Only ${Math.floor(timeDiff / (1000 * 60))} minutes remaining!`,
        color: '#dc3545'
      };
    }
    
    if (hoursDiff <= 24) {
      return { 
        status: 'soon', 
        message: `⏰ ${Math.round(hoursDiff)} hours remaining`,
        color: '#ffc107'
      };
    }
    
    return { 
      status: 'open', 
      message: `✅ ${Math.round(hoursDiff)} hours remaining`,
      color: '#28a745'
    };
  };

  if (loading) return <div className="card">Loading...</div>;

  // If user is eliminated, show elimination message
  if (isEliminated && eliminationInfo) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2 style={{ color: '#dc3545', marginBottom: '20px' }}>🚫 Eliminated in Week {eliminationInfo.week}</h2>
          
          <div style={{ 
            backgroundColor: '#f8d7da', 
            border: '1px solid #f5c6cb', 
            borderRadius: '8px', 
            padding: '20px', 
            marginBottom: '20px' 
          }}>
            <div>
              <h4 style={{ color: '#721c24', marginBottom: '15px' }}>Your Journey Ends Here</h4>
              <p><strong>Week {eliminationInfo.week}:</strong> Your team {eliminationInfo.teamName} did not win their match</p>
              <p>Unfortunately, this means you're out of the Last Man Standing competition.</p>
            </div>
          </div>

          <div style={{ 
            backgroundColor: '#d1ecf1', 
            border: '1px solid #bee5eb', 
            borderRadius: '8px', 
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h4 style={{ color: '#0c5460', marginBottom: '15px' }}>🎯 What You Can Still Do</h4>
            <div style={{ textAlign: 'left', display: 'inline-block' }}>
              <p>✅ View other players' picks and results</p>
              <p>✅ Follow the remaining competition</p>
              <p>✅ See who becomes the Last Man Standing</p>
            </div>
          </div>

          <div style={{ 
            backgroundColor: '#d4edda', 
            border: '1px solid #c3e6cb', 
            borderRadius: '8px', 
            padding: '20px' 
          }}>
            <h4 style={{ color: '#155724', marginBottom: '15px' }}>🔥 Better Luck Next Season!</h4>
            <p style={{ fontSize: '16px', marginBottom: '15px' }}>
              Every great player has been eliminated at some point. Use this experience to come back stronger!
            </p>
            <p style={{ fontSize: '14px', color: '#666' }}>
              The next Last Man Standing competition will be even more exciting ⚽
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Pick Your Team - Week {currentWeek}</h2>
      
      {deadline && (
        <div className="deadline-info" style={{
          backgroundColor: isDeadlinePassed() ? '#f8d7da' : '#d4edda',
          border: `1px solid ${isDeadlinePassed() ? '#f5c6cb' : '#c3e6cb'}`,
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <strong>Week {currentWeek} Deadline:</strong>
            <span style={{ 
              color: getDeadlineStatus().color, 
              fontWeight: 'bold',
              fontSize: '14px'
            }}>
              {getDeadlineStatus().message}
            </span>
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            📅 {new Date(deadline.deadline_time).toLocaleDateString()} at {new Date(deadline.deadline_time).toLocaleTimeString()}
          </div>
          
          {isDeadlinePassed() && (
            <div style={{
              marginTop: '15px',
              padding: '10px',
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: '6px',
              fontSize: '14px'
            }}>
              <strong>🚫 Picks are now locked for Week {currentWeek}</strong>
              <p style={{margin: '5px 0 0 0'}}>You can no longer change your selection. Wait for results to be posted.</p>
            </div>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Week Matches Section */}
      {weekMatches.length > 0 && (
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h4>🏆 Week {currentWeek} Fixtures ({weekMatches.length} matches)</h4>
          {matchesLoading ? (
            <p>Loading matches...</p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '10px',
              marginTop: '10px',
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '5px'
            }}>
              {weekMatches.map(match => (
                <div key={match.id} style={{
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  backgroundColor: match.status === 'Match Finished' ? '#e8f5e8' : '#fff',
                  fontSize: '13px'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '14px' }}>
                    {match.homeTeam} vs {match.awayTeam}
                  </div>
                  {match.status === 'Match Finished' ? (
                    <div>
                      <div style={{ color: '#155724' }}>
                        Final Score: {match.homeScore} - {match.awayScore}
                      </div>
                      {match.winner !== 'Draw' && (
                        <div style={{ color: '#28a745', fontWeight: 'bold', marginTop: '3px' }}>
                          ✅ Winner: {match.winner}
                        </div>
                      )}
                      {match.winner === 'Draw' && (
                        <div style={{ color: '#6c757d', marginTop: '3px' }}>🤝 Draw</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#856404' }}>
                      📅 {new Date(match.date + ' ' + match.time).toLocaleDateString()} at {match.time}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="teams-grid" style={{
        opacity: isDeadlinePassed() ? 0.5 : 1,
        pointerEvents: isDeadlinePassed() ? 'none' : 'auto'
      }}>
        {teams.map(team => {
          const isDisabled = isTeamDisabled(team.id) || isDeadlinePassed();
          const isSelected = selectedTeam === team.id;
          const wasAlreadyPicked = isTeamDisabled(team.id);
          
          return (
            <div
              key={team.id}
              className={`team-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => {
                if (!isDisabled) {
                  setSelectedTeam(team.id);
                }
              }}
              style={{
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                position: 'relative'
              }}
            >
              <h3>{team.team_name}</h3>
              <p>{team.team_short_name}</p>
              {wasAlreadyPicked && (
                <p style={{fontSize: '12px', marginTop: '5px', color: '#dc3545'}}>Already picked</p>
              )}
              {isDeadlinePassed() && !wasAlreadyPicked && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(220, 53, 69, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#dc3545'
                }}>
                  LOCKED
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        {isDeadlinePassed() ? (
          <div style={{
            padding: '15px',
            backgroundColor: '#e9ecef',
            border: '2px solid #dee2e6',
            borderRadius: '8px',
            color: '#6c757d'
          }}>
            <h4 style={{ margin: '0 0 10px 0' }}>🔒 Picks Locked</h4>
            <p style={{ margin: 0, fontSize: '14px' }}>
              The deadline has passed. Wait for match results to see who advances to the next week.
            </p>
          </div>
        ) : (
          <>
            {!selectedTeam && (
              <p style={{ color: '#6c757d', marginBottom: '15px', fontSize: '14px' }}>
                Select a team above to submit your pick for Week {currentWeek}
              </p>
            )}
            <button 
              className="submit-btn" 
              onClick={handleSubmit} 
              disabled={!selectedTeam || loading}
              style={{
                padding: '15px 30px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Submitting...' : selectedTeam ? 'Submit Pick' : 'Select Team First'}
            </button>
            {selectedTeam && (
              <p style={{ color: '#28a745', marginTop: '10px', fontSize: '14px' }}>
                Ready to submit: <strong>{teams.find(t => t.id === selectedTeam)?.team_name}</strong>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PickTeam;