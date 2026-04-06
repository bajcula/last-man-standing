import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import { useCompetition } from '../contexts/CompetitionContext';
import type { User, Pick, Deadline } from '../types';
import UserManagement from './admin/UserManagement';
import GameReset from './admin/GameReset';
import CompetitionManagement from './admin/CompetitionManagement';

function CurrentWeekPicks() {
  const { selectedCompetition } = useCompetition();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentPicks();
  }, []);

  const loadCurrentPicks = async () => {
    try {
      const deadlines = await pb.collection('deadlines').getFullList({
        filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
        sort: '-week_number',
      }) as unknown as Deadline[];

      if (deadlines.length === 0) {
        setLoading(false);
        return;
      }

      const current = deadlines[0]!;
      setCurrentWeek(current.week_number);
      setDeadline(current);

      const picksData = await pb.collection('picks').getFullList({
        filter: `week_number = ${current.week_number}${selectedCompetition ? ` && competition_id = "${selectedCompetition.id}"` : ''}`,
        expand: 'user_id,team_id',
      }) as unknown as Pick[];

      setPicks(picksData);
    } catch (err) {
      console.error('Failed to load current picks:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (currentWeek === 0) return <p>No active week yet.</p>;

  const deadlinePassed = deadline && (new Date(deadline.deadline_time) < new Date() || deadline.is_closed);

  return (
    <div>
      <h3>Week {currentWeek} Picks</h3>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        {deadlinePassed
          ? 'Deadline has passed — picks are locked.'
          : `Deadline: ${new Date(deadline!.deadline_time).toLocaleString()}`
        }
      </p>

      {picks.length === 0 ? (
        <p>No picks submitted yet for Week {currentWeek}.</p>
      ) : (
        <table className="history-table" style={{ marginTop: '10px' }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {picks.map(pick => {
              const user = pick.expand?.user_id;
              const team = pick.expand?.team_id;
              const name = user?.first_name && user?.last_name
                ? `${user.first_name} ${user.last_name}`
                : 'Unknown';

              return (
                <tr key={pick.id}>
                  <td style={{ fontWeight: 'bold' }}>{name}</td>
                  <td>
                    <strong>{team?.team_short_name || '???'}</strong>
                    <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px', fontSize: '13px' }}>
                      {team?.team_name || ''}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Admin() {
  const [activeTab, setActiveTab] = useState('picks');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const usersData = await pb.collection('users').getFullList({
        sort: 'email',
      }) as unknown as User[];
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setMessage('Failed to load data');
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

      <div className="admin-tabs">
        <button
          onClick={() => setActiveTab('picks')}
          className={`admin-tab ${activeTab === 'picks' ? 'admin-tab--active' : ''}`}
        >
          Current Picks
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`admin-tab ${activeTab === 'users' ? 'admin-tab--active' : ''}`}
        >
          Manage Users
        </button>
        <button
          onClick={() => setActiveTab('competitions')}
          className={`admin-tab ${activeTab === 'competitions' ? 'admin-tab--active' : ''}`}
        >
          Competitions
        </button>
        <button
          onClick={() => setActiveTab('reset')}
          className={`admin-tab admin-tab--danger ${activeTab === 'reset' ? 'admin-tab--active' : ''}`}
        >
          Reset Game
        </button>
      </div>

      {activeTab === 'picks' && <CurrentWeekPicks />}

      {activeTab === 'users' && (
        <UserManagement
          users={users}
          loading={loading}
          message={message}
          setMessage={setMessage}
          onUserCreated={loadData}
        />
      )}

      {activeTab === 'competitions' && (
        <CompetitionManagement users={users} />
      )}

      {activeTab === 'reset' && (
        <GameReset
          loading={loading}
          setLoading={setLoading}
          message={message}
          setMessage={setMessage}
          onResetComplete={() => loadData()}
        />
      )}
    </div>
  );
}

export default Admin;
