import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';

function MyPicks() {
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPicks();
  }, []);

  const loadPicks = async () => {
    try {
      const picksData = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model.id}"`,
        expand: 'team_id',
        sort: '-week_number,-updated',
      });
      
      // Remove duplicates - keep only the latest pick for each week
      const uniquePicks = {};
      picksData.forEach(pick => {
        const week = pick.week_number;
        if (!uniquePicks[week] || new Date(pick.updated) > new Date(uniquePicks[week].updated)) {
          uniquePicks[week] = pick;
        }
      });
      
      // Convert back to array and sort by week number ascending (Week 1 first)
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
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '20px',
          marginTop: '20px'
        }}>
          {picks.map(pick => (
            <div key={pick.id} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '15px',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              backgroundColor: '#f8fff9',
              minHeight: '180px',
              justifyContent: 'space-between'
            }}>
              <div style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#333',
                marginBottom: '15px'
              }}>
                Week {pick.week_number}
              </div>
              
              <div style={{
                border: '2px solid #28a745',
                borderRadius: '8px',
                padding: '15px',
                backgroundColor: '#fff',
                textAlign: 'center',
                width: '100%',
                minHeight: '80px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flex: '1'
              }}>
                {pick.expand?.team_id?.team_name ? (
                  <>
                    <strong style={{ 
                      color: '#28a745', 
                      fontSize: '18px',
                      marginBottom: '8px',
                      display: 'block'
                    }}>
                      {pick.expand.team_id.team_short_name}
                    </strong>
                    <small style={{ 
                      color: '#666',
                      fontSize: '12px',
                      lineHeight: '1.2'
                    }}>
                      {pick.expand.team_id.team_name}
                    </small>
                  </>
                ) : (
                  <span style={{ color: '#dc3545', fontSize: '12px' }}>
                    Team ID: {pick.team_id}
                  </span>
                )}
              </div>
              
              <div style={{
                marginTop: '10px',
                fontSize: '11px',
                color: '#666'
              }}>
                {new Date(pick.created).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyPicks;