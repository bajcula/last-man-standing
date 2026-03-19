import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import type { Pick } from '../types';

function MyPicks() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPicks();
  }, []);

  const loadPicks = async () => {
    try {
      const picksData = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model!.id}"`,
        expand: 'team_id',
        sort: '-week_number',
      }) as unknown as Pick[];

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

  if (loading) return <div className="card">Loading...</div>;

  return (
    <div className="card">
      <h2>My Picks History</h2>

      {picks.length === 0 ? (
        <p>No picks yet</p>
      ) : (
        <div className="picks-grid">
          {picks.map(pick => (
            <div key={pick.id} className="pick-card">
              <div className="pick-card__week">
                Week {pick.week_number}
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
          ))}
        </div>
      )}
    </div>
  );
}

export default MyPicks;
