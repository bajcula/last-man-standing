import { useState, useEffect, type KeyboardEvent } from 'react';
import { pb } from '../lib/pocketbase';
import { getMatchWinner, getFirstAvailableTeam, checkUserElimination } from '../utils/gameLogic';
import { fetchRoundMatches, isPostponedStatus } from '../utils/api';
import { findTeamByApiName } from '../utils/teamMapping';
import type { Team, Pick, Deadline, WinningTeam, DisplayMatch, EliminationInfo, DeadlineStatus } from '../types';

function PickTeam() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [myPicks, setMyPicks] = useState<Pick[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isEliminated, setIsEliminated] = useState(false);
  const [eliminationInfo, setEliminationInfo] = useState<EliminationInfo | null>(null);
  const [weekMatches, setWeekMatches] = useState<DisplayMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const teamsData = await pb.collection('teams').getFullList({
        sort: 'team_name',
      }) as unknown as Team[];
      setTeams(teamsData);

      const picksData = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model!.id}"`,
        expand: 'team_id',
      }) as unknown as Pick[];
      setMyPicks(picksData);

      const deadlines = await pb.collection('deadlines').getFullList({
        sort: '-week_number',
      }) as unknown as Deadline[];

      let currentWeekNum = 1;
      if (deadlines.length > 0) {
        const currentDeadline = deadlines[0]!;
        currentWeekNum = currentDeadline.week_number;
        setCurrentWeek(currentWeekNum);
        setDeadline(currentDeadline);
      }

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

      await checkEliminationStatus(picksData, currentWeekNum);
      await loadWeekMatches(currentWeekNum);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadWeekMatches = async (weekNum: number) => {
    setMatchesLoading(true);
    try {
      const events = await fetchRoundMatches(weekNum);
      const matches: DisplayMatch[] = events.map(match => ({
        id: match.idEvent,
        homeTeam: match.strHomeTeam,
        awayTeam: match.strAwayTeam,
        homeScore: match.intHomeScore,
        awayScore: match.intAwayScore,
        status: match.strStatus,
        postponed: match.strPostponed,
        date: match.dateEvent,
        time: match.strTime,
        round: match.strRound,
        winner: getMatchWinner(match)
      }));
      setWeekMatches(matches);
    } catch (err) {
      console.error('Failed to load week matches:', err);
      setWeekMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  };

  const autoAssignTeam = async (allTeams: Team[], userPicks: Pick[], weekNumber: number): Promise<Pick | null> => {
    try {
      const availableTeam = getFirstAvailableTeam(allTeams, userPicks);

      if (!availableTeam) {
        console.error('No available teams for auto-assignment');
        return null;
      }

      const autoPick = await pb.collection('picks').create({
        user_id: pb.authStore.model!.id,
        team_id: availableTeam.id,
        week_number: weekNumber,
      });

      console.log(`Auto-assigned ${availableTeam.team_name} for Week ${weekNumber}`);

      return {
        ...autoPick,
        user_id: pb.authStore.model!.id,
        team_id: availableTeam.id,
        week_number: weekNumber,
        expand: { team_id: availableTeam }
      } as Pick;

    } catch (err) {
      console.error('Failed to auto-assign team:', err);
      return null;
    }
  };

  const checkEliminationStatus = async (picksData: Pick[], currentWeekNum: number) => {
    try {
      if (currentWeekNum <= 1) {
        setIsEliminated(false);
        return;
      }

      const allWinners = await pb.collection('winning_teams').getFullList() as unknown as WinningTeam[];
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
    if (!selectedTeam || submitting) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const existingPicks = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model!.id}" && week_number = ${currentWeek}`,
      });

      if (existingPicks.length > 0) {
        await pb.collection('picks').update(existingPicks[0]!.id, {
          team_id: selectedTeam,
        });
      } else {
        await pb.collection('picks').create({
          user_id: pb.authStore.model!.id,
          team_id: selectedTeam,
          week_number: currentWeek,
        });
      }

      setSuccess('Pick submitted successfully!');
      loadData();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to submit pick');
    } finally {
      setSubmitting(false);
    }
  };

  const getShortName = (fullName: string): string => {
    if (!fullName) return '???';
    const exact = teams.find(t => t.team_name === fullName);
    if (exact) return exact.team_short_name;
    const partial = teams.find(t => fullName.includes(t.team_name) || t.team_name.includes(fullName));
    return partial?.team_short_name || fullName.substring(0, 3).toUpperCase();
  };

  const isTeamDisabled = (teamId: string): boolean => {
    return myPicks.some(pick => pick.team_id === teamId && pick.week_number !== currentWeek);
  };

  const isDeadlinePassed = (): boolean => {
    if (!deadline) return false;
    return new Date(deadline.deadline_time) < new Date() || deadline.is_closed;
  };

  const getDeadlineStatus = (): DeadlineStatus => {
    if (!deadline) return { status: 'no-deadline', message: 'No deadline set for this week' };

    const deadlineTime = new Date(deadline.deadline_time);
    const now = new Date();
    const timeDiff = deadlineTime.getTime() - now.getTime();
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

  if (loading) return (
    <div className="card">
      <div className="skeleton skeleton-row skeleton-row--medium"></div>
      <div className="skeleton skeleton-card"></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px', marginTop: '20px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '60px' }}></div>
        ))}
      </div>
    </div>
  );

  if (!loading && error && teams.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <h2 style={{ color: 'var(--color-danger)', marginBottom: '15px' }}>Failed to load game data</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '20px' }}>{error}</p>
        <button onClick={() => { setError(''); setLoading(true); loadData(); }} style={{ width: 'auto', padding: '12px 30px' }}>
          Try Again
        </button>
      </div>
    );
  }

  if (isEliminated && eliminationInfo) {
    return (
      <div className="card">
        <div className="elimination">
          <h2 className="elimination__title">Eliminated in Week {eliminationInfo.week}</h2>
          <p className="elimination__summary">
            Your team <strong>{eliminationInfo.teamName}</strong> did not win in Week {eliminationInfo.week}, so you're out of the competition.
            You can still view other players' picks and follow the remaining games. Better luck next time!
          </p>
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
        const isMoved = (m: DisplayMatch): boolean => {
          if (m.postponed === 'yes') return true;
          if (isPostponedStatus(m.status)) return true;
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
                    <div key={match.id} className={`match-card ${match.status === 'Match Finished' ? 'match-card--finished' : 'match-card--upcoming'}`}>
                      <div className="match-card__teams">
                        {getShortName(match.homeTeam)} {match.status === 'Match Finished' ? `${match.homeScore} - ${match.awayScore}` : 'vs'} {getShortName(match.awayTeam)}
                      </div>
                      {match.status !== 'Match Finished' && (
                        <div className="match-card__date">
                          📅 {new Date(match.date + ' ' + match.time).toLocaleDateString()} at {match.time}
                        </div>
                      )}
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
        const unavailableTeamIds = new Set<string>();
        for (const match of weekMatches) {
          const moved = match.postponed === 'yes' || isPostponedStatus(match.status);
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
                  onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isDisabled) setSelectedTeam(team.id); }}}
                >
                  <h3>{team.team_short_name}</h3>
                  <p className="already-picked" style={{ visibility: wasAlreadyPicked ? 'visible' : 'hidden' }}>Already picked</p>
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
              disabled={!selectedTeam || submitting}
              style={{ padding: '15px 30px', fontSize: '16px', fontWeight: 'bold' }}
            >
              {submitting ? 'Submitting...' : selectedTeam ? 'Submit Pick' : 'Select Team First'}
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
