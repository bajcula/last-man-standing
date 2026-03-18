import { useState, useEffect } from 'react';
import { pb } from '../../lib/pocketbase';
import { getMatchWinner } from '../../utils/gameLogic';
import { findTeamByApiName } from '../../utils/teamMapping';
import { fetchRoundMatches, fetchLastMatches, calculateDeadlineFromMatches, getFallbackDeadline } from '../../utils/api';

function WinnersMarking({ teams, selectedWeek, onWeekChange, loading, setLoading, message, setMessage }) {
  const [winners, setWinners] = useState({});
  const [plMatches, setPlMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchesMessage, setMatchesMessage] = useState('');

  useEffect(() => {
    loadWinnersForWeek(selectedWeek);
  }, [selectedWeek]);

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

  const handleToggleWinner = async (teamId) => {
    const newWinners = { ...winners };

    if (newWinners[teamId]) {
      delete newWinners[teamId];
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

  const fetchPremierLeagueMatches = async (roundNumber = null) => {
    setLoadingMatches(true);
    setMatchesMessage('');

    try {
      const events = roundNumber
        ? await fetchRoundMatches(roundNumber)
        : await fetchLastMatches();

      if (events.length > 0) {
        const matches = events.map(match => ({
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

  const prefillWinnersFromMatches = async (matches) => {
    try {
      const newWinners = {};

      console.log('Matching teams from API:', matches.map(m => m.winner).filter(w => w !== 'Draw'));

      for (const match of matches) {
        if (match.winner && match.winner !== 'Draw') {
          const winningTeam = findTeamByApiName(match.winner, teams);

          if (winningTeam) {
            console.log(`Matched: ${match.winner} -> ${winningTeam.team_name}`);
            newWinners[winningTeam.id] = true;

            try {
              await pb.collection('winning_teams').create({
                week_number: selectedWeek,
                team_id: winningTeam.id,
              });
            } catch (err) {
              console.log('Winner already exists or error:', err.message);
            }
          } else {
            console.log(`No match found for: ${match.winner}`);
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
      `- Eliminate users who picked losing teams\n` +
      `- Create deadline for Week ${selectedWeek + 1}\n` +
      `- This action cannot be undone`
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage('');

    try {
      const picksData = await pb.collection('picks').getFullList({
        filter: `week_number = ${selectedWeek}`,
        expand: 'user_id,team_id'
      });

      console.log(`Processing ${picksData.length} picks for Week ${selectedWeek}`);

      let eliminatedCount = 0;
      let advancedCount = 0;

      for (const pick of picksData) {
        const isWinner = winners[pick.team_id];
        const userName = `${pick.expand?.user_id?.first_name} ${pick.expand?.user_id?.last_name}`;
        const teamName = pick.expand?.team_id?.team_name;

        if (!isWinner) {
          console.log(`Eliminated: ${userName} (picked ${teamName})`);
          eliminatedCount++;
        } else {
          console.log(`Advanced: ${userName} (picked ${teamName})`);
          advancedCount++;
        }
      }

      let nextWeekDeadline;
      try {
        const events = await fetchRoundMatches(selectedWeek + 1);
        nextWeekDeadline = calculateDeadlineFromMatches(events);
        if (!nextWeekDeadline) {
          nextWeekDeadline = getFallbackDeadline();
          console.log(`No matches found for Week ${selectedWeek + 1}, using default deadline`);
        } else {
          console.log(`Setting deadline for Week ${selectedWeek + 1}: ${nextWeekDeadline.toLocaleString()}`);
        }
      } catch (err) {
        nextWeekDeadline = getFallbackDeadline();
        console.log('Failed to fetch matches, using default deadline');
      }

      try {
        await pb.collection('deadlines').create({
          week_number: selectedWeek + 1,
          deadline_time: nextWeekDeadline.toISOString(),
          is_closed: false
        });
        console.log(`Created deadline for Week ${selectedWeek + 1}: ${nextWeekDeadline.toLocaleString()}`);
      } catch (err) {
        console.log(`Deadline might already exist for Week ${selectedWeek + 1}`);
      }

      setMessage(
        `Week ${selectedWeek} results submitted successfully!\n\n` +
        `Summary:\n` +
        `- ${advancedCount} users advanced to Week ${selectedWeek + 1}\n` +
        `- ${eliminatedCount} users eliminated\n` +
        `- Next deadline: ${nextWeekDeadline.toLocaleString()}`
      );

    } catch (err) {
      console.error('Failed to submit week results:', err);
      setMessage('Failed to submit week results: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3>Mark Winners for Week</h3>
        <div className="form-group">
          <label>Select Week</label>
          <input
            type="number"
            value={selectedWeek}
            onChange={(e) => onWeekChange(Number(e.target.value))}
            min="1"
            max="38"
          />
        </div>
      </div>

      {/* Premier League API Section */}
      <div className="matches-section">
        <h4>Premier League Match Results</h4>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
          <button
            onClick={() => fetchPremierLeagueMatches(selectedWeek)}
            disabled={loadingMatches}
            className="submit-btn"
            style={{ width: 'auto', marginTop: 0 }}
          >
            {loadingMatches ? 'Loading...' : `Fetch Week ${selectedWeek} & Auto-Fill`}
          </button>
        </div>

        {matchesMessage && (
          <div className={matchesMessage.includes('Failed') ? 'message message--error' : 'message message--success'}>
            {matchesMessage}
          </div>
        )}

        {plMatches.length > 0 && (
          <div>
            <h5>Match Results:</h5>
            <div className="matches-grid">
              {plMatches.map(match => (
                <div key={match.id} className={`match-card ${match.status === 'Match Finished' ? 'match-card--finished' : 'match-card--upcoming'}`}>
                  <div className="match-card__teams">
                    {match.homeTeam} vs {match.awayTeam}
                  </div>
                  {match.status === 'Match Finished' ? (
                    <div>
                      <div>Score: {match.homeScore}-{match.awayScore}</div>
                      {match.winner !== 'Draw' && (
                        <div className="match-card__winner">Winner: {match.winner}</div>
                      )}
                      {match.winner === 'Draw' && (
                        <div className="match-card__draw">Result: Draw</div>
                      )}
                    </div>
                  ) : (
                    <div className="match-card__date">
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
        <div className="winners-grid">
          {teams.map(team => (
            <label key={team.id} className={`winner-label ${winners[team.id] ? 'winner-label--checked' : ''}`}>
              <input
                type="checkbox"
                checked={winners[team.id] || false}
                onChange={() => handleToggleWinner(team.id)}
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
          <div className="winners-summary">
            <strong>{Object.keys(winners).length} teams marked as winners for Week {selectedWeek}</strong>
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
              {loading ? 'Processing...' : `Submit Week ${selectedWeek} Results & Advance Round`}
            </button>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              This will eliminate users with incorrect picks and unlock the next week for winners.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default WinnersMarking;
