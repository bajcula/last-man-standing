import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
      <h2 style={{ fontSize: '48px', marginBottom: '10px' }}>404</h2>
      <p style={{ fontSize: '18px', color: 'var(--color-text-muted)', marginBottom: '30px' }}>
        Page not found
      </p>
      <Link to="/pick" style={{
        display: 'inline-block',
        background: 'var(--color-primary)',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '5px',
        textDecoration: 'none',
        fontWeight: 'bold'
      }}>
        Back to Game
      </Link>
    </div>
  );
}

export default NotFound;
