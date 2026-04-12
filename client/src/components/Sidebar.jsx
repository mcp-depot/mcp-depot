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
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';

function Sidebar() {
  const { user } = useAuth();
  const { themeName, setThemeName } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path) => location.pathname === path ? 'active' : '';

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
      { path: '/prompts', icon: FileText, label: 'Prompts' },
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
          {!collapsed && <span className="sidebar-brand-text">MCPConnect</span>}
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

      <div className="sidebar-footer">
        <label className="sidebar-theme-toggle" title={themeName === 'dark' ? 'Switch to light' : 'Switch to dark'}>
          <input type="checkbox" checked={themeName === 'dark'} onChange={toggleTheme} />
          <span className="toggle-slider"></span>
        </label>
        <div className="sidebar-user" onClick={() => window.location.href = '/settings'} style={{ cursor: 'pointer' }}>
          <div className="sidebar-user-avatar">
            {user?.name?.charAt(0)}
          </div>
          {!collapsed && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name}</div>
              <div className="sidebar-user-email">{user?.email}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;