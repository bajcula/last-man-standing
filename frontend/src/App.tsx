import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, NavLink } from 'react-router-dom';
import { pb } from './lib/pocketbase';
import type { User } from './types';
import Login from './components/Login';
import PickTeam from './components/PickTeam';
import MyPicks from './components/MyPicks';
import AllPlayersPicksHistory from './components/AllPlayersPicksHistory';
import Admin from './components/Admin';
import ErrorBoundary from './components/ErrorBoundary';
import NotFound from './components/NotFound';
import './App.css';

function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      if (pb.authStore.model) {
        try {
          const fullUser = await pb.collection('users').getOne(pb.authStore.model.id) as unknown as User;
          setUser(fullUser);
        } catch (err) {
          console.error('Failed to load user data:', err);
          setUser(pb.authStore.model as unknown as User);
        }
      } else {
        setUser(null);
      }
    };

    loadUserData();

    const unsubscribe = pb.authStore.onChange((_token, model) => {
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
              <NavLink to="/pick">Pick Team</NavLink>
              <NavLink to="/my-picks">My Picks</NavLink>
              <NavLink to="/history">All Players History</NavLink>
              {user.isAdmin && <NavLink to="/admin">Admin</NavLink>}
              {user.isAdmin && <span className="admin-badge">ADMIN</span>}
              <span>Welcome, {user.first_name || user.username}!</span>
              <button className="logout-btn" onClick={logout}>Logout</button>
            </div>
          </div>
        </nav>

        <div className="container">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/pick" />} />
              <Route path="/pick" element={<PickTeam />} />
              <Route path="/my-picks" element={<MyPicks />} />
              <Route path="/history" element={<AllPlayersPicksHistory />} />
              <Route path="/admin" element={user.isAdmin ? <Admin /> : <Navigate to="/pick" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </Router>
  );
}

export default App;
