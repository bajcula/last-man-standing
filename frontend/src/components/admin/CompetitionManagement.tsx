import { useState, useEffect } from 'react';
import { pb } from '../../lib/pocketbase';
import { useCompetition } from '../../contexts/CompetitionContext';
import type { Competition, User } from '../../types';

interface Props {
  users: User[];
}

function CompetitionManagement({ users }: Props) {
  const { competitions, reload } = useCompetition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSelectedUsers(new Set(users.map(u => u.id)));
  }, [users]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setMessage('Name is required');
      return;
    }
    if (selectedUsers.size === 0) {
      setMessage('Select at least one participant');
      return;
    }

    setCreating(true);
    setMessage('');
    try {
      const pbUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://localhost:8090';
      const resp = await fetch(`${pbUrl}/api/competitions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': pb.authStore.token,
        },
        body: JSON.stringify({
          name: newName.trim(),
          participant_ids: Array.from(selectedUsers),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || 'Failed to create competition');
      }

      const data = await resp.json();
      setMessage(`Created "${data.name}" starting at week ${data.start_week} with ${data.participants} participants`);
      setShowCreateModal(false);
      setNewName('');
      await reload();
    } catch (err: unknown) {
      setMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleEnd = async (comp: Competition) => {
    if (!window.confirm(`End "${comp.name}"? This will freeze all picks and mark it as completed.`)) return;

    setEnding(comp.id);
    setMessage('');
    try {
      const pbUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://localhost:8090';
      const resp = await fetch(`${pbUrl}/api/competitions/${comp.id}/end`, {
        method: 'POST',
        headers: { 'Authorization': pb.authStore.token },
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || 'Failed to end competition');
      }

      setMessage(`"${comp.name}" has been ended`);
      await reload();
    } catch (err: unknown) {
      setMessage((err as Error).message);
    } finally {
      setEnding(null);
    }
  };

  const toggleUser = (uid: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const activeComps = competitions.filter(c => c.status === 'active');
  const endedComps = competitions.filter(c => c.status === 'ended');

  return (
    <div>
      {message && (
        <div className={message.includes('Failed') || message.includes('required') || message.includes('Select') ? 'error' : 'success'} style={{ marginBottom: '15px' }}>
          {message}
        </div>
      )}

      <button
        onClick={() => setShowCreateModal(true)}
        style={{
          padding: '12px 24px',
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        + Start New Competition
      </button>

      {showCreateModal && (
        <div style={{
          border: '2px solid var(--color-primary)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
          backgroundColor: 'var(--color-surface)',
        }}>
          <h4 style={{ marginTop: 0 }}>New Competition</h4>

          <div className="form-group">
            <label>Competition Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Round 2"
            />
          </div>

          <div className="form-group">
            <label>Participants ({selectedUsers.size} / {users.length} selected)</label>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setSelectedUsers(new Set(users.map(u => u.id)))}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedUsers(new Set())}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Deselect All
              </button>
            </div>
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '10px',
            }}>
              {users.map(u => (
                <label key={u.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 0',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  {u.first_name} {u.last_name}
                  {u.isAdmin && <span className="admin-badge" style={{ fontSize: '10px' }}>ADMIN</span>}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--color-success)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creating...' : 'Create Competition'}
            </button>
            <button
              onClick={() => setShowCreateModal(false)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeComps.length > 0 && (
        <>
          <h3>Active Competitions</h3>
          <table className="history-table" style={{ marginBottom: '20px' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Start Week</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeComps.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                  <td>Week {c.start_week}</td>
                  <td><span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>Active</span></td>
                  <td>
                    <button
                      onClick={() => handleEnd(c)}
                      disabled={ending === c.id}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: 'var(--color-danger)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: ending === c.id ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      {ending === c.id ? 'Ending...' : 'End Competition'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {endedComps.length > 0 && (
        <>
          <h3>Past Competitions</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Weeks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {endedComps.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                  <td>Week {c.start_week}–{c.end_week}</td>
                  <td><span style={{ color: 'var(--color-text-muted)' }}>Ended</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default CompetitionManagement;
