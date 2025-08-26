import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, Link } from 'react-router-dom';
import { pb } from './lib/pocketbase';
import Login from './components/Login';
import PickTeam from './components/PickTeam';
import MyPicks from './components/MyPicks';
import AllPlayersPicksHistory from './components/AllPlayersPicksHistory';
import Admin from './components/Admin';
import './App.css';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUserData = async () => {
      if (pb.authStore.model) {
        try {
          // Fetch complete user record with custom fields
          const fullUser = await pb.collection('users').getOne(pb.authStore.model.id);
          setUser(fullUser);
        } catch (err) {
          console.error('Failed to load user data:', err);
          setUser(pb.authStore.model); // Fallback to auth model
        }
      } else {
        setUser(null);
      }
    };

    // Load user data on initial load
    loadUserData();

    // Listen for auth changes
    const unsubscribe = pb.authStore.onChange((token, model) => {
      if (model) {
        loadUserData();
      } else {
        setUser(null);
      }
    });
    
    return unsubscribe;
  }, []);

  const logout = () => {
    pb.authStore.clear();
    setUser(null);
  };

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <div>
        <nav className="nav">
          <div className="nav-content">
            <h2>Last Man Standing</h2>
            <div className="nav-links">
              <Link to="/pick">Pick Team</Link>
              <Link to="/my-picks">My Picks</Link>
              <Link to="/history">All Players History</Link>
              {user.isAdmin && <Link to="/admin">Admin</Link>}
              {user.isAdmin && <span className="admin-badge">ADMIN</span>}
              <span>Welcome, {user.first_name || user.username}!</span>
              <button className="logout-btn" onClick={logout}>Logout</button>
            </div>
          </div>
        </nav>
        
        <div className="container">
          <Routes>
            <Route path="/" element={<Navigate to="/pick" />} />
            <Route path="/pick" element={<PickTeam />} />
            <Route path="/my-picks" element={<MyPicks />} />
            <Route path="/history" element={<AllPlayersPicksHistory />} />
            {user.isAdmin && <Route path="/admin" element={<Admin />} />}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;