import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Plug, Wrench, Server, FileText, Plus, ChevronRight, Settings, Layers, MessagesSquare, Monitor, Zap, Clock } from 'lucide-react';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ 
    integrations: { total: 0, active: 0, inactive: 0 },
    tools: { total: 0, active: 0, inactive: 0 },
    mcpServers: { total: 0, active: 0 },
    prompts: { total: 0 },
    sessions: { contexts: 0, shared: 0, channels: 0 }
  });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const intRes = await api.get('/integrations');
        const integrations = intRes.data || [];
        
        const activeIntegrations = integrations.filter(i => i.isActive).length;
        
        const toolsPromises = integrations.map(integration => 
          api.get(`/integrations/${integration._id}/tools`).catch(() => ({ data: [] }))
        );
        const toolsResponses = await Promise.all(toolsPromises);
        
        const allTools = toolsResponses.flatMap(res => res.data || []);
        
        let activeTools = 0;
        let inactiveTools = 0;
        
        toolsResponses.forEach((res, idx) => {
          const integration = integrations[idx];
          const tools = res.data || [];
          tools.forEach(tool => {
            if (integration.isActive && tool.isActive) {
              activeTools++;
            } else {
              inactiveTools++;
            }
          });
        });

        const mcpRes = await api.get('/external-mcp').catch(() => ({ data: [] }));
        const mcpServers = mcpRes.data || [];
        const activeMcp = mcpServers.filter(s => s.isActive).length;

        const promptsRes = await api.get('/skills').catch(() => ({ data: [] }));
        const prompts = promptsRes.data || [];

        // Fetch session data
        const ctxRes = await api.get('/session-contexts').catch(() => ({ data: [] }));
        const contexts = ctxRes.data || [];
        const sharedContexts = contexts.filter(c => c.isShared).length;

        const chRes = await api.get('/session-channels').catch(() => ({ data: [] }));
        const channels = chRes.data || [];
        
        setStats({
          integrations: { 
            total: integrations.length, 
            active: activeIntegrations, 
            inactive: integrations.length - activeIntegrations 
          },
          tools: { 
            total: allTools.length, 
            active: activeTools, 
            inactive: inactiveTools
          },
          mcpServers: {
            total: mcpServers.length,
            active: activeMcp
          },
          prompts: {
            total: prompts.length
          },
          sessions: {
            contexts: contexts.length,
            shared: sharedContexts,
            channels: channels.length
          }
        });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
        setStats({ 
          integrations: { total: 0, active: 0, inactive: 0 },
          tools: { total: 0, active: 0, inactive: 0 },
          mcpServers: { total: 0, active: 0 },
          prompts: { total: 0 },
          sessions: { contexts: 0, shared: 0, channels: 0 }
        });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    let eventSource;
    let retryTimer;

    const connectSSE = () => {
      eventSource = new EventSource('/api/mcp/sessions/stream');

      eventSource.addEventListener('sessions', (event) => {
        setClients(JSON.parse(event.data));
      });

      eventSource.onerror = () => {
        eventSource.close();
        retryTimer = setTimeout(connectSSE, 5000);
      };
    };

    api.get('/mcp/sessions').then(res => setClients(res.data || [])).catch(() => {});
    connectSSE();

    return () => {
      eventSource?.close();
      clearTimeout(retryTimer);
    };
  }, []);

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return `${Math.floor(diffSec / 3600)}h ago`;
  };

  return (
    <div>
      <div className="container">
        <div className="page-header">
          <h1>Welcome back, {user?.name}</h1>
          <p>Manage your integrations and automate workflows</p>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner"></div></div>
        ) : (
          <>
            <div className="grid-4" style={{ marginBottom: '2rem' }}>
              <div className="stat-card">
                <div className="stat-card-icon"><Plug size={20} /></div>
                <div className="stat-card-value">{stats.integrations.total}</div>
                <div className="stat-card-label">Integrations</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--success)' }}>{stats.integrations.active} active</span>
                  <span style={{ color: 'var(--danger)' }}>{stats.integrations.inactive} inactive</span>
                </div>
                <Link to="/integrations" className="btn btn-primary btn-small" style={{ marginTop: '0.5rem' }}>
                  View All
                </Link>
              </div>
              
              <div className="stat-card">
                <div className="stat-card-icon"><Wrench size={20} /></div>
                <div className="stat-card-value">{stats.tools.total}</div>
                <div className="stat-card-label">Tools</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--success)' }}>{stats.tools.active} active</span>
                  <span style={{ color: 'var(--danger)' }}>{stats.tools.inactive} inactive</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-icon"><Server size={20} /></div>
                <div className="stat-card-value">{stats.mcpServers.total}</div>
                <div className="stat-card-label">External MCP</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--success)' }}>{stats.mcpServers.active} active</span>
                </div>
                <Link to="/settings" className="btn btn-primary btn-small" style={{ marginTop: '0.5rem' }}>
                  Configure
                </Link>
              </div>

              <div className="stat-card">
                <div className="stat-card-icon"><Layers size={20} /></div>
                <div className="stat-card-value">{stats.sessions.contexts + stats.sessions.channels}</div>
                <div className="stat-card-label">Sessions</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--text-light)' }}>{stats.sessions.contexts} contexts</span>
                  <span style={{ color: 'var(--text-light)' }}>{stats.sessions.channels} channels</span>
                </div>
                {stats.sessions.shared > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '0.25rem' }}>
                    {stats.sessions.shared} shared
                  </div>
                )}
                <Link to="/session-contexts" className="btn btn-primary btn-small" style={{ marginTop: '0.5rem' }}>
                  View
                </Link>
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Quick Actions</h3>
                </div>
                <div className="quick-actions">
                  <Link to="/integrations" className="quick-action">
                    <div className="quick-action-icon"><Plus size={16} /></div>
                    <div className="quick-action-label">Add Integration</div>
                  </Link>
                  <Link to="/skills" className="quick-action">
                    <div className="quick-action-icon"><FileText size={16} /></div>
                    <div className="quick-action-label">Create Skill</div>
                  </Link>
                  <Link to="/settings" className="quick-action">
                    <div className="quick-action-icon"><Settings size={16} /></div>
                    <div className="quick-action-label">API Settings</div>
                  </Link>
                  <Link to="/session-contexts" className="quick-action">
                    <div className="quick-action-icon"><MessagesSquare size={16} /></div>
                    <div className="quick-action-label">Browse Sessions</div>
                  </Link>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Getting Started</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '600', flexShrink: 0 }}>1</div>
                    <div>
                      <strong>Add an Integration</strong>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>Connect to any third-party API endpoint</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '600', flexShrink: 0 }}>2</div>
                    <div>
                      <strong>Create Tools</strong>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>Define API endpoints you want to expose</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '600', flexShrink: 0 }}>3</div>
                    <div>
                      <strong>Explore Optional Features</strong>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>Connect external MCP servers for more tools, or use Session Contexts and Channels to share AI working state across sessions</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '600', flexShrink: 0 }}>4</div>
                    <div>
                      <strong>Consume via AI tool</strong>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>Call your tools from any external AI tool like Claude</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><Monitor size={16} style={{ marginRight: '0.5rem' }} />Connected Clients</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{clients.length} active</span>
              </div>
              {clients.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-light)' }}>
                  No clients connected yet
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Session</th>
                      <th>Connected</th>
                      <th>Last Call</th>
                      <th>Calls</th>
                      <th>Last Tool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(s => (
                      <tr key={s.sessionId}>
                        <td>
                          <strong>{s.clientName || 'Unknown'}</strong>
                          {s.clientVersion && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-light)' }}>v{s.clientVersion}</span>}
                        </td>
                        <td><code style={{ fontSize: '0.75rem' }}>{s.sessionId}</code></td>
                        <td><span title={s.connectedAt}>{fmtTime(s.connectedAt)}</span></td>
                        <td><span title={s.lastCallAt}>{s.lastCallAt ? fmtTime(s.lastCallAt) : '—'}</span></td>
                        <td>{s.callCount}</td>
                        <td>{s.lastTool || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
