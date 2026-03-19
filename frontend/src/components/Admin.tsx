import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import type { User, Team, Deadline } from '../types';
import UserManagement from './admin/UserManagement';
import WinnersMarking from './admin/WinnersMarking';
import GameReset from './admin/GameReset';

function Admin() {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [_currentDeadlines, setCurrentDeadlines] = useState<Deadline[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const usersData = await pb.collection('users').getFullList({
        sort: 'email',
      }) as unknown as User[];
      setUsers(usersData);

      const teamsData = await pb.collection('teams').getFullList({
        sort: 'team_name',
      }) as unknown as Team[];
      setTeams(teamsData);

      const deadlinesData = await pb.collection('deadlines').getFullList({
        sort: '-week_number',
      }) as unknown as Deadline[];
      setCurrentDeadlines(deadlinesData);

      if (deadlinesData.length > 0) {
        const currentWeek = Math.max(...deadlinesData.map(d => d.week_number));
        setSelectedWeek(currentWeek);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setMessage('Failed to load data');
    }
  };

  const handleWeekChange = (newWeek: number) => {
    setSelectedWeek(newWeek);
  };

  const handleResetComplete = (startWeek: number) => {
    setSelectedWeek(startWeek);
    loadData();
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
      <div className="admin-tabs">
        <button
          onClick={() => setActiveTab('users')}
          className={`admin-tab ${activeTab === 'users' ? 'admin-tab--active' : ''}`}
        >
          Manage Users
        </button>
        <button
          onClick={() => setActiveTab('winners')}
          className={`admin-tab ${activeTab === 'winners' ? 'admin-tab--active' : ''}`}
        >
          Mark Winners
        </button>
        <button
          onClick={() => setActiveTab('picks')}
          className={`admin-tab admin-tab--success ${activeTab === 'picks' ? 'admin-tab--active' : ''}`}
        >
          View All Picks
        </button>
        <button
          onClick={() => setActiveTab('reset')}
          className={`admin-tab admin-tab--danger ${activeTab === 'reset' ? 'admin-tab--active' : ''}`}
        >
          🚨 Reset Game
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <UserManagement
          users={users}
          loading={loading}
          message={message}
          setMessage={setMessage}
          onUserCreated={loadData}
        />
      )}

      {/* Winners Tab */}
      {activeTab === 'winners' && (
        <WinnersMarking
          teams={teams}
          selectedWeek={selectedWeek}
          onWeekChange={handleWeekChange}
          loading={loading}
          setLoading={setLoading}
          message={message}
          setMessage={setMessage}
        />
      )}

      {/* Reset Game Tab */}
      {activeTab === 'reset' && (
        <GameReset
          loading={resetLoading}
          setLoading={setResetLoading}
          message={message}
          setMessage={setMessage}
          onResetComplete={handleResetComplete}
        />
      )}
    </div>
  );
}

export default Admin;
