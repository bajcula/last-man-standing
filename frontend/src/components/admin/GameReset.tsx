import { useState } from 'react';
import { pb } from '../../lib/pocketbase';
import { fetchRoundMatches, calculateDeadlineFromMatches, getFallbackDeadline } from '../../utils/api';
import type { GameResetProps } from '../../types';

function GameReset({ loading: resetLoading, setLoading: setResetLoading, setMessage, onResetComplete }: GameResetProps) {
  const [resetStartWeek, setResetStartWeek] = useState(1);
  const [currentWeekFromAPI, setCurrentWeekFromAPI] = useState(2);

  const getCurrentPLWeek = async (): Promise<number> => {
    try {
      const today = new Date();

      for (let week = 1; week <= 10; week++) {
        const events = await fetchRoundMatches(week);

        if (events.length > 0) {
          const hasUpcomingMatches = events.some(match => {
            const matchDate = new Date(match.dateEvent);
            return matchDate >= today;
          });

          if (hasUpcomingMatches) {
            console.log(`Current week detected: ${week} (has upcoming matches)`);
            return week;
          }
        }
      }

      console.log('No upcoming matches found, defaulting to week 1');
      return 1;
    } catch (error) {
      console.error('Error fetching current week:', error);
      return 2;
    }
  };

  const resetGame = async () => {
    if (!resetStartWeek || resetStartWeek < 1 || resetStartWeek > 38) {
      setMessage('Please enter a valid week number (1-38)');
      return;
    }

    const currentPLWeek = await getCurrentPLWeek();
    setCurrentWeekFromAPI(currentPLWeek);

    if (resetStartWeek < currentPLWeek) {
      setMessage(`Cannot start from Week ${resetStartWeek} as it has already been played. Current week is ${currentPLWeek}.`);
      return;
    }

    const confirmed = window.confirm(
      `DANGER: This will completely reset the game!\n\n` +
      `This action will:\n` +
      `- DELETE all existing picks\n` +
      `- DELETE all existing deadlines\n` +
      `- DELETE all winning teams data\n` +
      `- START fresh competition from Week ${resetStartWeek}\n` +
      `- Create new deadline for Week ${resetStartWeek}\n\n` +
      `THIS CANNOT BE UNDONE!\n\n` +
      `Are you sure you want to start a new game from Week ${resetStartWeek}?`
    );

    if (!confirmed) {
      setMessage('Reset cancelled');
      return;
    }

    setResetLoading(true);
    setMessage('');

    try {
      console.log(`Starting game reset to Week ${resetStartWeek}...`);

      const existingPicks = await pb.collection('picks').getFullList();
      for (const pick of existingPicks) {
        await pb.collection('picks').delete(pick.id);
      }
      console.log(`Deleted ${existingPicks.length} picks`);

      const existingDeadlines = await pb.collection('deadlines').getFullList();
      for (const deadline of existingDeadlines) {
        await pb.collection('deadlines').delete(deadline.id);
      }
      console.log(`Deleted ${existingDeadlines.length} deadlines`);

      const existingWinners = await pb.collection('winning_teams').getFullList();
      for (const winner of existingWinners) {
        await pb.collection('winning_teams').delete(winner.id);
      }
      console.log(`Deleted ${existingWinners.length} winners`);

      let newDeadline: Date;
      try {
        const events = await fetchRoundMatches(resetStartWeek);
        newDeadline = calculateDeadlineFromMatches(events) ?? getFallbackDeadline();
      } catch {
        newDeadline = getFallbackDeadline();
        console.log('Failed to fetch matches, using default deadline');
      }

      await pb.collection('deadlines').create({
        week_number: resetStartWeek,
        deadline_time: newDeadline.toISOString(),
        is_closed: false
      });
      console.log(`Created deadline for Week ${resetStartWeek}: ${newDeadline.toLocaleString()}`);

      setMessage(
        `Game Successfully Reset!\n\n` +
        `Fresh Competition Started:\n` +
        `- All previous data cleared\n` +
        `- Starting from Week ${resetStartWeek}\n` +
        `- New deadline: ${newDeadline.toLocaleString()}\n` +
        `- All users can make fresh picks\n\n` +
        `Notify players that a new competition has begun!`
      );

      onResetComplete(resetStartWeek);

    } catch (err: unknown) {
      const error = err as Error;
      console.error('Failed to reset game:', error);
      setMessage('Failed to reset game: ' + error.message);
    } finally {
      setResetLoading(false);
    }
  };

  const currentPLWeek = currentWeekFromAPI;

  return (
    <div>
      <div className="danger-zone">
        <h3>Danger Zone - Reset Entire Game</h3>
        <p style={{ marginBottom: '15px' }}>
          This will completely wipe all game data and start a fresh competition from any week you specify.
          Use this when the game has ended and you want to start a new one.
        </p>
        <p style={{ fontWeight: 'bold' }}>
          WARNING: This can't be undone!
        </p>
      </div>

      <div className="message message--warning" style={{ padding: '20px' }}>
        <h4 style={{ color: '#856404', marginBottom: '15px' }}>New Game Configuration</h4>

        <div className="message message--info" style={{ marginBottom: '15px' }}>
          <p style={{ margin: '0', color: '#1565c0', fontWeight: 'bold' }}>
            Current Premier League Week: {currentPLWeek}
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
              Week {resetStartWeek} has already been played. Please select Week {currentPLWeek} or later.
            </div>
          )}
        </div>

        <div style={{ fontSize: '14px', color: '#856404' }}>
          <p><strong>Starting Week {resetStartWeek} will:</strong></p>
          <ul style={{ marginLeft: '20px' }}>
            <li>Fetch Week {resetStartWeek} fixtures from Premier League API</li>
            <li>Allow all users to make fresh picks</li>
            <li>Set deadline 6 hours before the first match</li>
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
          {resetLoading ? 'Resetting Game...' :
           resetStartWeek < currentPLWeek ? `Cannot Reset to Past Week ${resetStartWeek}` :
           `Reset & Start New Game from Week ${resetStartWeek}`}
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
  );
}

export default GameReset;
