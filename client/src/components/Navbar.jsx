import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

function Navbar() {
  const { user } = useAuth();
  const { themeName, setThemeName } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const toggleTheme = () => {
    const newTheme = themeName === 'dark' ? 'light' : themeName === 'light' ? 'dark' : themeName === 'ocean' ? 'light' : 'dark';
    setThemeName(newTheme);
  };

  return (
    <div className="navbar">
      <Link to="/" className="navbar-brand" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <img src="/logo.png" alt="MCPConnect Logo" width="32" height="32" style={{ borderRadius: '6px', filter: themeName === 'dark' ? 'brightness(0.9)' : 'none' }} />
        MCPConnect
      </Link>
      <div className="navbar-menu">
        <Link to="/" className={isActive('/')}>Dashboard</Link>
        <Link to="/integrations" className={isActive('/integrations')}>Integrations</Link>
        <Link to="/tools" className={isActive('/tools')}>Tools</Link>
        <Link to="/prompts" className={isActive('/prompts')}>Prompts</Link>
        <Link to="/monitoring" className={isActive('/monitoring')}>Monitoring</Link>
        <Link to="/settings" className={isActive('/settings')}>Settings</Link>
        <label className="toggle" style={{ marginLeft: '0.5rem', marginRight: '0.5rem' }}>
          <input type="checkbox" checked={themeName === 'dark'} onChange={toggleTheme} />
          <span className="toggle-slider"></span>
        </label>
        <div className="user-avatar" onClick={() => navigate('/settings')} style={{ cursor: 'pointer' }}>
          {user?.name?.charAt(0)}
        </div>
      </div>
    </div>
  );
}

export default Navbar;