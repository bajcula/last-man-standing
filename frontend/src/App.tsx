import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, NavLink, useLocation } from 'react-router-dom';
import { pb } from './lib/pocketbase';
import type { User } from './types';
import { CompetitionProvider } from './contexts/CompetitionContext';
import Login from './components/Login';
import PickTeam from './components/PickTeam';
import MyPicks from './components/MyPicks';
import AllPlayersPicksHistory from './components/AllPlayersPicksHistory';
import Admin from './components/Admin';
import CompetitionSwitcher from './components/CompetitionSwitcher';
import ErrorBoundary from './components/ErrorBoundary';
import NotFound from './components/NotFound';
import './App.css';

function NavBar({ user, logout }: { user: User; logout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen]);

  return (
    <nav className="nav" ref={menuRef}>
      <div className="nav-content">
        <div className="nav-header">
          <h2>Last Man Standing</h2>
          <button
            className="hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span className={`hamburger__line ${menuOpen ? 'hamburger__line--open' : ''}`} />
            <span className={`hamburger__line ${menuOpen ? 'hamburger__line--open' : ''}`} />
            <span className={`hamburger__line ${menuOpen ? 'hamburger__line--open' : ''}`} />
          </button>
        </div>
        <div className={`nav-links ${menuOpen ? 'nav-links--open' : ''}`}>
          <NavLink to="/pick">Pick Team</NavLink>
          <NavLink to="/my-picks">My Picks</NavLink>
          <NavLink to="/history">All Players</NavLink>
          {user.isAdmin && <NavLink to="/admin">Admin</NavLink>}
          <div className="nav-user">
            {user.isAdmin && <span className="admin-badge">ADMIN</span>}
            <span className="nav-welcome">Hi, {user.first_name || user.username}!</span>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </div>
      </div>
    </nav>
  );
}

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
      <CompetitionProvider>
        <div>
          <NavBar user={user} logout={logout} />
          <CompetitionSwitcher />

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
      </CompetitionProvider>
    </Router>
  );
}

export default App;
