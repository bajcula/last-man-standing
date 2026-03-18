import { useState } from 'react';
import { pb } from '../../lib/pocketbase';

function UserManagement({ users, loading, message, setMessage, onUserCreated }) {
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [creating, setCreating] = useState(false);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password) {
      setMessage('All fields are required');
      return;
    }

    setCreating(true);
    setMessage('');

    try {
      await pb.collection('users').create({
        first_name: newUser.firstName,
        last_name: newUser.lastName,
        email: newUser.email,
        password: newUser.password,
        passwordConfirm: newUser.password,
        username: newUser.email,
      });

      setMessage('User created successfully!');
      setNewUser({ firstName: '', lastName: '', email: '', password: '' });
      onUserCreated();
    } catch (err) {
      console.error('Failed to create user:', err);
      setMessage(err.response?.data?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '30px' }}>
        <h3>Create New User</h3>
        <form onSubmit={handleCreateUser}>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={newUser.firstName}
                onChange={(e) => setNewUser({...newUser, firstName: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={newUser.lastName}
                onChange={(e) => setNewUser({...newUser, lastName: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={creating || loading}>
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </div>

      <div>
        <h3>Registered Users ({users.length})</h3>
        <div className="users-grid">
          {users.map(user => (
            <div key={user.id} className="user-card">
              <strong className="user-card__name">{user.first_name} {user.last_name}</strong>
              <p className="user-card__email">{user.email}</p>
              {user.isAdmin && <span className="admin-badge">ADMIN</span>}
              <p className="user-card__date">
                Joined: {new Date(user.created).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UserManagement;
