import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import { getMatchWinner, getFirstAvailableTeam, checkUserElimination } from '../utils/gameLogic';
import { fetchRoundMatches, isPostponedStatus } from '../utils/api';
import { findTeamByApiName } from '../utils/teamMapping';

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
      const events = await fetchRoundMatches(weekNum);
      const matches = events.map(match => ({
        id: match.idEvent,
        homeTeam: match.strHomeTeam,
        awayTeam: match.strAwayTeam,
        homeScore: match.intHomeScore,
        awayScore: match.intAwayScore,
        status: match.strStatus,
        postponed: match.strPostponed,
        date: match.dateEvent,
        time: match.strTime,
        winner: getMatchWinner(match)
      }));
      setWeekMatches(matches);
    } catch (error) {
      console.error('Failed to load week matches:', error);
      setWeekMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  };

  const autoAssignTeam = async (allTeams, userPicks, weekNumber) => {
    try {
      const availableTeam = getFirstAvailableTeam(allTeams, userPicks);
      
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
      if (currentWeekNum <= 1) {
        setIsEliminated(false);
        return;
      }

      const allWinners = await pb.collection('winning_teams').getFullList();
      if (allWinners.length === 0) {
        setIsEliminated(false);
        setEliminationInfo(null);
        return;
      }

      const result = checkUserElimination(picksData, allWinners, currentWeekNum);
      setIsEliminated(result.isEliminated);
      setEliminationInfo(result.eliminationInfo);
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

  const getShortName = (fullName) => {
    if (!fullName) return '???';
    const exact = teams.find(t => t.team_name === fullName);
    if (exact) return exact.team_short_name;
    const partial = teams.find(t => fullName.includes(t.team_name) || t.team_name.includes(fullName));
    return partial?.team_short_name || fullName.substring(0, 3).toUpperCase();
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
        <div className="elimination">
          <h2 className="elimination__title">🚫 Eliminated in Week {eliminationInfo.week}</h2>

          <div className="elimination__box elimination__box--danger">
            <h4 style={{ color: '#721c24', marginBottom: '15px' }}>Your Journey Ends Here</h4>
            <p><strong>Week {eliminationInfo.week}:</strong> Your team {eliminationInfo.teamName} did not win their match</p>
            <p>Unfortunately, this means you're out of the Last Man Standing competition.</p>
          </div>

          <div className="elimination__box elimination__box--info">
            <h4 style={{ color: '#0c5460', marginBottom: '15px' }}>🎯 What You Can Still Do</h4>
            <div style={{ textAlign: 'left', display: 'inline-block' }}>
              <p>✅ View other players' picks and results</p>
              <p>✅ Follow the remaining competition</p>
              <p>✅ See who becomes the Last Man Standing</p>
            </div>
          </div>

          <div className="elimination__box elimination__box--success">
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
        <div className={`deadline-bar ${isDeadlinePassed() ? 'deadline-bar--passed' : 'deadline-bar--open'}`}>
          <div className="deadline-bar__header">
            <strong>Week {currentWeek} Deadline:</strong>
            <span style={{ color: getDeadlineStatus().color, fontWeight: 'bold', fontSize: '14px' }}>
              {getDeadlineStatus().message}
            </span>
          </div>
          <div className="deadline-bar__time">
            📅 {new Date(deadline.deadline_time).toLocaleDateString()} at {new Date(deadline.deadline_time).toLocaleTimeString()}
          </div>
          {isDeadlinePassed() && (
            <div className="deadline-bar__locked">
              <strong>🚫 Picks are now locked for Week {currentWeek}</strong>
              <p style={{margin: '5px 0 0 0'}}>You can no longer change your selection. Wait for results to be posted.</p>
            </div>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Week Matches Section */}
      {weekMatches.length > 0 && (() => {
        const isMoved = (m) => {
          if (m.postponed === 'yes') return true;
          if (isPostponedStatus(m.status)) return true;
          // Finished match played on a past date (rescheduled early)
          if (m.status === 'Match Finished') {
            const matchDate = new Date(m.date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return matchDate < today;
          }
          return false;
        };
        const upcomingMatches = weekMatches.filter(m => !isMoved(m));
        const movedMatches = weekMatches.filter(m => isMoved(m));
        const selectedTeamName = teams.find(t => t.id === selectedTeam)?.team_name;
        const isPickAffected = selectedTeamName && movedMatches.some(m =>
          m.homeTeam === selectedTeamName || m.awayTeam === selectedTeamName ||
          getShortName(m.homeTeam) === teams.find(t => t.id === selectedTeam)?.team_short_name ||
          getShortName(m.awayTeam) === teams.find(t => t.id === selectedTeam)?.team_short_name
        );

        return (
          <div className="matches-section">
            <h4>🏆 Week {currentWeek} Fixtures ({upcomingMatches.length} matches)</h4>

            {isPickAffected && (
              <div className="message message--warning">
                Your selected team's match has been moved this week. Consider picking a different team.
              </div>
            )}

            {matchesLoading ? (
              <p>Loading matches...</p>
            ) : (
              <>
                <div className="matches-grid">
                  {upcomingMatches.map(match => (
                    <div key={match.id} className="match-card match-card--upcoming">
                      <div className="match-card__teams">{getShortName(match.homeTeam)} vs {getShortName(match.awayTeam)}</div>
                      <div className="match-card__date">
                        📅 {new Date(match.date + ' ' + match.time).toLocaleDateString()} at {match.time}
                      </div>
                    </div>
                  ))}
                </div>

                {movedMatches.length > 0 && (
                  <div className="postponed-section">
                    {movedMatches.map(match => (
                      <div key={match.id} className="match-card match-card--postponed">
                        <div className="match-card__teams">
                          <span className="match-card__team-names">{getShortName(match.homeTeam)} vs {getShortName(match.awayTeam)}</span>
                          <span className="postponed-badge">MOVED</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {(() => {
        // Build set of team IDs that can't be picked (match moved/postponed or finished early)
        const unavailableTeamIds = new Set();
        for (const match of weekMatches) {
          const moved = match.postponed === 'yes' || isPostponedStatus(match.status) ||
            (match.status === 'Match Finished' && new Date(match.date) < new Date(new Date().toDateString()));
          if (moved) {
            const homeTeam = findTeamByApiName(match.homeTeam, teams);
            const awayTeam = findTeamByApiName(match.awayTeam, teams);
            if (homeTeam) unavailableTeamIds.add(homeTeam.id);
            if (awayTeam) unavailableTeamIds.add(awayTeam.id);
          }
        }

        const pickableTeams = teams.filter(t => !unavailableTeamIds.has(t.id));

        return (
          <div className={`teams-grid ${isDeadlinePassed() ? 'teams-grid--locked' : ''}`}>
            {pickableTeams.map(team => {
              const isDisabled = isTeamDisabled(team.id) || isDeadlinePassed();
              const isSelected = selectedTeam === team.id;
              const wasAlreadyPicked = isTeamDisabled(team.id);

              return (
                <div
                  key={team.id}
                  className={`team-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''} ${isDeadlinePassed() && !wasAlreadyPicked ? 'team-card--locked' : ''}`}
                  onClick={() => {
                    if (!isDisabled) {
                      setSelectedTeam(team.id);
                    }
                  }}
                  tabIndex={isDisabled ? -1 : 0}
                  role="button"
                  aria-pressed={isSelected}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isDisabled) setSelectedTeam(team.id); }}}
                >
                  <h3>{team.team_short_name}</h3>
                  {wasAlreadyPicked && (
                    <p className="already-picked">Already picked</p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      <div className="submit-area">
        {isDeadlinePassed() ? (
          <div className="picks-locked">
            <h4 style={{ margin: '0 0 10px 0' }}>🔒 Picks Locked</h4>
            <p style={{ margin: 0, fontSize: '14px' }}>
              The deadline has passed. Wait for match results to see who advances to the next week.
            </p>
          </div>
        ) : (
          <>
            {!selectedTeam && (
              <p className="submit-hint">
                Select a team above to submit your pick for Week {currentWeek}
              </p>
            )}
            <button
              className="submit-btn"
              onClick={handleSubmit}
              disabled={!selectedTeam || loading}
              style={{ padding: '15px 30px', fontSize: '16px', fontWeight: 'bold' }}
            >
              {loading ? 'Submitting...' : selectedTeam ? 'Submit Pick' : 'Select Team First'}
            </button>
            {selectedTeam && (
              <p className="submit-ready">
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