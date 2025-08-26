import { useState } from 'react';
import { pb } from '../lib/pocketbase';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await pb.collection('users').authWithPassword(email, password);
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.response?.data?.message || err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Last Man Standing - Login</h2>
      {error && <div className="error">{error}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#e8f4fd', 
        borderRadius: '8px', 
        border: '1px solid #b8daff',
        fontFamily: 'Georgia, serif',
        fontSize: '16px'
      }}>
        <strong style={{ fontSize: '18px' }}>🔐 Account Required</strong>
        <p style={{ marginTop: '10px', lineHeight: '1.6' }}>
          Don't have an account? Contact an administrator to create your account.
        </p>
        <p style={{ marginTop: '8px', lineHeight: '1.6' }}>
          They will provide your email and password credentials.
        </p>
      </div>
    </div>
  );
}

export default Login;