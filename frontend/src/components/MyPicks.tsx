import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import type { Pick, WinningTeam } from '../types';

function MyPicks() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [winningTeams, setWinningTeams] = useState<WinningTeam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPicks();
  }, []);

  const loadPicks = async () => {
    try {
      const [picksData, winners] = await Promise.all([
        pb.collection('picks').getFullList({
          filter: `user_id = "${pb.authStore.model!.id}"`,
          expand: 'team_id',
          sort: '-week_number',
        }) as unknown as Promise<Pick[]>,
        pb.collection('winning_teams').getFullList() as unknown as Promise<WinningTeam[]>,
      ]);

      setWinningTeams(winners);

      // Remove duplicates - keep only one pick per week
      const uniquePicks: Record<number, Pick> = {};
      picksData.forEach(pick => {
        const week = pick.week_number;
        if (!uniquePicks[week]) {
          uniquePicks[week] = pick;
        }
      });

      const finalPicks = Object.values(uniquePicks).sort((a, b) => a.week_number - b.week_number);
      setPicks(finalPicks);
    } catch (err) {
      console.error('Failed to load picks:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPickResult = (pick: Pick): 'won' | 'lost' | 'pending' => {
    const weekHasWinners = winningTeams.some(w => w.week_number === pick.week_number);
    if (!weekHasWinners) return 'pending';
    const teamWon = winningTeams.some(
      w => w.week_number === pick.week_number && w.team_id === pick.team_id
    );
    return teamWon ? 'won' : 'lost';
  };

  if (loading) return (
    <div className="card">
      <div className="skeleton skeleton-row skeleton-row--short"></div>
      <div className="picks-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '180px' }}></div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="card">
      <h2>My Picks History</h2>

      {picks.length === 0 ? (
        <p>No picks yet</p>
      ) : (
        <div className="picks-grid">
          {picks.map(pick => {
            const result = getPickResult(pick);
            return (
            <div key={pick.id} className={`pick-card ${result !== 'pending' ? `pick-card--${result}` : ''}`}>
              <div className="pick-card__week">
                Week {pick.week_number}
                {result === 'won' && <span style={{ marginLeft: '8px', color: 'var(--color-success)' }}>W</span>}
                {result === 'lost' && <span style={{ marginLeft: '8px', color: 'var(--color-danger)' }}>L</span>}
              </div>
              <div className="pick-card__team">
                {pick.expand?.team_id?.team_name ? (
                  <>
                    <strong className="pick-card__short-name">
                      {pick.expand.team_id.team_short_name}
                    </strong>
                    <small className="pick-card__full-name">
                      {pick.expand.team_id.team_name}
                    </small>
                  </>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    Team unavailable
                  </span>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MyPicks;
