import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  LayoutDashboard, 
  Plug, 
  Wrench, 
  FileText, 
  Activity, 
  Settings, 
  ChevronLeft,
  Zap,
  ChevronRight,
  LogOut,
  ChevronDown,
  User,
  Layers,
  MessagesSquare
} from 'lucide-react';
import { useState } from 'react';

function Sidebar() {
  const { user, logout } = useAuth();
  const { themeName, setThemeName } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const toggleTheme = () => {
    const newTheme = themeName === 'dark' ? 'light' : themeName === 'light' ? 'dark' : themeName === 'ocean' ? 'light' : 'dark';
    setThemeName(newTheme);
  };

  const navItems = [
    { section: 'Common', items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/integrations', icon: Plug, label: 'Integrations' },
    ]},
    { section: 'Tools', items: [
      { path: '/tools', icon: Wrench, label: 'Tools' },
      // { path: '/workflows', icon: FileText, label: 'Workflows' },
      { path: '/skills', icon: FileText, label: 'Skills' },
      { path: '/personas', icon: User, label: 'Personas' },
    ]},
    { section: 'Sessions', items: [
      { path: '/session-contexts', icon: Layers, label: 'Contexts' },
      { path: '/session-channels', icon: MessagesSquare, label: 'Channels' },
    ]},
    { section: 'Operations', items: [
      { path: '/monitoring', icon: Activity, label: 'Monitoring' },
    ]},
    { section: 'System', items: [
      { path: '/settings', icon: Settings, label: 'Settings' },
    ]},
  ];

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <Link to="/" className="sidebar-brand" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Zap size={24} className="sidebar-logo" />
          {!collapsed && <span className="sidebar-brand-text">MCP Depot</span>}
        </Link>
        <button 
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((section, idx) => (
          <div key={section.section} className="sidebar-section">
            {!collapsed && <div className="sidebar-section-title">{section.section}</div>}
            {section.items.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`sidebar-link ${isActive(item.path)}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ flexDirection: collapsed ? 'column' : 'row', alignItems: 'center' }}>
        <label 
          className="sidebar-theme-toggle" 
          title={themeName === 'dark' ? 'Switch to light' : 'Switch to dark'}
          style={{ flexShrink: 0 }}
        >
          <input type="checkbox" checked={themeName === 'dark'} onChange={toggleTheme} />
          <span className="toggle-slider"></span>
        </label>
        
        <div style={{ position: 'relative', width: '100%' }}>
          <div 
            className="sidebar-user" 
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{ 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '0.25rem 0' : '0.25rem 0.5rem'
            }}
          >
            <div className="sidebar-user-avatar" style={{ width: collapsed ? '28px' : '32px', height: collapsed ? '28px' : '32px', fontSize: collapsed ? '0.75rem' : '0.875rem' }}>
              {user?.name?.charAt(0)}
            </div>
            {!collapsed && (
              <>
                <div className="sidebar-user-info">
                  <div className="sidebar-user-name">{user?.name}</div>
                  <div className="sidebar-user-email">{user?.email}</div>
                </div>
                <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
              </>
            )}
          </div>
          {showUserMenu && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: collapsed ? '-8px' : '0.5rem',
              right: collapsed ? '-8px' : '0.5rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.25rem',
              marginBottom: '0.5rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: collapsed ? 'unset' : 'auto',
              whiteSpace: 'nowrap'
            }}>
              <button 
                onClick={() => { window.location.href = '/settings'; setShowUserMenu(false); }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  borderRadius: '4px'
                }}
              >
                <User size={14} />
                <span>Profile</span>
              </button>
              <button 
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  borderRadius: '4px'
                }}
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;