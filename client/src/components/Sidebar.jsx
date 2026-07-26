import { Link, useLocation } from 'react-router';
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
  MessagesSquare,
  Users,
  Users2,
  Shield,
  HeartPulse,
  Sun,
  Moon,
  Menu,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';

const MOBILE_QUERY = '(max-width: 768px)';

function Sidebar() {
  const { user, logout, appConfig } = useAuth();
  const { themeName, setThemeName } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handleChange = (e) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileOpen(false);
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  const effectiveCollapsed = collapsed && !isMobile;
  const enabledFeatures = appConfig?.enabledFeatures;

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const toggleTheme = () => {
    const newTheme = themeName === 'dark' ? 'light' : themeName === 'light' ? 'dark' : themeName === 'ocean' ? 'light' : 'dark';
    setThemeName(newTheme);
  };

  const LOCKED_FEATURES = ['integrations', 'tools'];

  const filterItems = (items) => items.filter(item =>
    !item.feature ||
    LOCKED_FEATURES.includes(item.feature) ||
    !enabledFeatures ||
    enabledFeatures.includes(item.feature)
  );

  const navItems = [
    { section: 'Common', items: filterItems([
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/integrations', icon: Plug, label: 'Integrations', feature: 'integrations' },
    ])},
    { section: 'Tools', items: filterItems([
      { path: '/tools', icon: Wrench, label: 'Tools', feature: 'tools' },
      { path: '/skills', icon: FileText, label: 'Skills', feature: 'skills' },
      { path: '/agents', icon: User, label: 'Agents', feature: 'agents' },
    ])},
    { section: 'Sessions', items: filterItems([
      { path: '/session-contexts', icon: Layers, label: 'Contexts', feature: 'sessions' },
      { path: '/session-channels', icon: MessagesSquare, label: 'Channels', feature: 'channels' },
    ])},
    { section: 'Operations', items: filterItems([
      { path: '/monitoring', icon: Activity, label: 'Monitoring', feature: 'monitoring' },
      { path: '/health', icon: HeartPulse, label: 'Health', feature: 'health' },
    ])},
    { section: 'Identity', items: [
      { path: '/groups', icon: Users2, label: 'Groups' },
      ...(user?.role === 'admin' ? [{ path: '/users', icon: Users, label: 'Users', feature: 'users' }] : []),
    ]},
    { section: 'System', items: [
      ...(user?.role === 'admin' ? [{ path: '/policy', icon: Shield, label: 'Policy' }] : []),
      { path: '/settings', icon: Settings, label: 'Settings' },
    ]},
  ];

  return (
    <>
      {isMobile && !mobileOpen && (
        <button
          className="sidebar-mobile-trigger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      )}
      {isMobile && mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <div className={`sidebar ${effectiveCollapsed ? 'collapsed' : ''} ${isMobile && mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <Link to="/" className="sidebar-brand" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logo-mark.svg" width="28" height="28" alt="MCP Depot" style={{ borderRadius: '7px', flexShrink: 0 }} />
          {!effectiveCollapsed && <span className="sidebar-brand-text">MCP Depot</span>}
        </Link>
        <button
          className="sidebar-toggle"
          onClick={() => isMobile ? setMobileOpen(false) : setCollapsed(!collapsed)}
          title={isMobile ? 'Close menu' : (collapsed ? 'Expand' : 'Collapse')}
          aria-label={isMobile ? 'Close menu' : (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
        >
          {isMobile ? <X size={16} /> : (collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />)}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.filter(section => section.items.length > 0).map((section, idx) => (
          <div key={section.section} className="sidebar-section">
            {!effectiveCollapsed && <div className="sidebar-section-title">{section.section}</div>}
            {section.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-link ${isActive(item.path)}`}
                title={effectiveCollapsed ? item.label : undefined}
                onClick={() => isMobile && setMobileOpen(false)}
              >
                <item.icon size={18} />
                {!effectiveCollapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ flexDirection: effectiveCollapsed ? 'column' : 'row', alignItems: 'center' }}>
        <button
          onClick={toggleTheme}
          title={themeName === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '5px 7px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          {themeName === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        
        <div style={{ position: 'relative', width: '100%' }}>
          <div 
            className="sidebar-user" 
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{ 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
              padding: effectiveCollapsed ? '0.25rem 0' : '0.25rem 0.5rem'
            }}
          >
            <div className="sidebar-user-avatar" style={{ width: effectiveCollapsed ? '28px' : '32px', height: effectiveCollapsed ? '28px' : '32px', fontSize: effectiveCollapsed ? '0.75rem' : '0.875rem' }}>
              {user?.name?.charAt(0)}
            </div>
            {!effectiveCollapsed && (
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
              left: effectiveCollapsed ? '-8px' : '0.5rem',
              right: effectiveCollapsed ? '-8px' : '0.5rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.25rem',
              marginBottom: '0.5rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: effectiveCollapsed ? 'unset' : 'auto',
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
    </>
  );
}

export default Sidebar;