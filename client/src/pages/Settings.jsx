import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import themes from '../config/themes';
import api from '../services/api';
import { StyledSelect } from '../components/StyledSelect';
import { DropdownMenu, DropdownItem, DropdownSeparator } from '../components/Dropdown';
import { showSuccess, showError } from '../utils/toast';
import { Copy, Trash2, Edit2, Wrench } from 'lucide-react';

function LoadingDots({ text = 'Loading' }) {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);
  
  return <span>{text}{dots}</span>;
}

function MCPServerSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mcpSettings, setMcpSettings] = useState({ authMode: 'optional', apiKey: '' });
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await api.get('/system/mcp');
      setMcpSettings({ ...res.data, apiKey: '' });
    } catch (err) {
      console.error('Failed to fetch MCP settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = { ...mcpSettings };
      if (mcpSettings.apiKey) {
        payload.apiKey = mcpSettings.apiKey;
      }
      await api.put('/system/mcp', { value: payload, description: 'MCP server authentication settings' });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div><LoadingDots text="" /></div>;
  }

  return (
    <div>
      <h2 className="card-title" style={{ marginBottom: '1rem' }}>MCP Server Authentication</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Configure who can access your MCP endpoint from AI assistants (like Claude, Cursor, etc.).</p>
      
      <div className="form-group">
        <label>Authentication Mode</label>
        <StyledSelect
          options={[
            { value: 'none', label: 'No Authentication (public access)' },
            { value: 'required', label: 'Require API Key' }
          ]}
          value={{ value: mcpSettings.authMode, label: mcpSettings.authMode === 'none' ? 'No Authentication (public access)' : 'Require API Key' }}
          onChange={(opt) => setMcpSettings({ ...mcpSettings, authMode: opt?.value || 'none' })}
          isSearchable={false}
        />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {mcpSettings.authMode === 'none' && 'No authentication - MCP endpoints are publicly accessible.'}
          {mcpSettings.authMode === 'required' && 'Require API key - AI assistants must provide the API key generated in "My API Access" tab.'}
        </p>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {message.text && (
        <div className={message.type === 'success' ? 'success-message' : 'error-message'} style={{ marginTop: '1rem' }}>
          {message.text}
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius)' }}>
        <h3 style={{ marginBottom: '1rem' }}>Quick Start Guide</h3>
        
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Step 1: Configure Connection</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Run this command in terminal to set up URL and API key:</p>
          <pre style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem' }}>
mcp-depot --login
          </pre>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            This will ask for your MCP server URL and API key, then save to config.json
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Step 2: Add to Your AI Assistant</h4>
          
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}><strong>Claude Code:</strong></p>
          <pre style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
claude mcp add mcp-depot -- mcp-depot
          </pre>
          
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}><strong>OpenCode:</strong></p>
          <pre style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
opencode mcp add mcp-depot -- mcp-depot
          </pre>
          
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}><strong>Cursor / Other MCP Clients:</strong></p>
          <pre style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem' }}>
mcp-depot
          </pre>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Troubleshooting</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            If you see "API key required" error, run: <code>mcp-depot --login</code> to configure
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Config file location: <code>C:\nvm4w\nodejs\node_modules\mcp-depot\config.json</code>
          </p>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const { user, logout } = useAuth();
  const { themeName, setThemeName, themes: availableThemes, customColors, previewColors, setPreviewColors, confirmColors, resetPreview, setCustomColors } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState('');
  const [generatedApiKey, setGeneratedApiKey] = useState(null);
  const [externalServers, setExternalServers] = useState([]);
  const [externalLoading, setExternalLoading] = useState(true);
  const [poolStatus, setPoolStatus] = useState([]);
  const [showServerModal, setShowServerModal] = useState(false);
  const [showTestToolModal, setShowTestToolModal] = useState(false);
  const [testingTool, setTestingTool] = useState(null);
  const [testParams, setTestParams] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [editingServer, setEditingServer] = useState(null);
  const [externalTab, setExternalTab] = useState('servers');
  const [installingPackage, setInstallingPackage] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [loadingServerTools, setLoadingServerTools] = useState(null);
  const [installRuntime, setInstallRuntime] = useState({ value: 'node', label: 'npm (Node.js)' });
  const [serverForm, setServerForm] = useState({
    name: '',
    transportType: 'http',
    runtime: 'node',
    url: '',
    command: '',
    args: '',
    env: '',
    envPairs: [{ key: '', value: '' }],
    authType: 'none',
    authToken: '',
    authHeader: ''
  });
  const [importPreview, setImportPreview] = useState(null);
  const [selectedForImport, setSelectedForImport] = useState({
    externalMcpServers: [],
    integrations: [],
    tools: [],
    workflows: []
  });
  const [features, setFeatures] = useState(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresSaving, setFeaturesSaving] = useState(false);

  const abortControllers = {};

  async function fetchFeatures() {
    setFeaturesLoading(true);
    try {
      const res = await api.get('/system/features');
      setFeatures(res.data.enabledFeatures);
    } catch (err) {
      console.error('Failed to fetch features:', err);
    } finally {
      setFeaturesLoading(false);
    }
  }

  async function saveFeatures(enabledFeatures) {
    setFeaturesSaving(true);
    try {
      await api.put('/system/features', { features: enabledFeatures });
      setFeatures(enabledFeatures);
      showSuccess('Features updated successfully');
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to update features');
    } finally {
      setFeaturesSaving(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'features') {
      fetchFeatures();
    }
  }, [activeTab]);

  async function fetchExternalServers() {
    setExternalLoading(true);
    try {
      const res = await api.get('/external-mcp');
      setExternalServers(res.data);
    } catch (err) {
      console.error('Failed to fetch external servers:', err);
    } finally {
      setExternalLoading(false);
    }
  }

  async function fetchPoolStatus() {
    try {
      const res = await api.get('/external-mcp/pool-status');
      setPoolStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch pool status:', err);
    }
  }

  useEffect(() => {
    if (activeTab === 'external-mcp' && externalTab === 'servers') {
      fetchPoolStatus();
      const interval = setInterval(fetchPoolStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, externalTab]);

  async function saveExternalServer() {
    try {
      const envJson = serverForm.envPairs
        .filter(p => p.key)
        .reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {});
      
      const payload = {
        name: serverForm.name,
        transportType: serverForm.transportType,
        runtime: serverForm.runtime,
        url: serverForm.url || null,
        command: serverForm.command || null,
        args: serverForm.args || null,
        env: Object.keys(envJson).length ? JSON.stringify(envJson) : null,
        authType: serverForm.authType,
        authToken: serverForm.authToken || null,
        authHeader: serverForm.authHeader || null
      };
      
      if (editingServer) {
        await api.put(`/external-mcp/${editingServer._id}`, payload);
      } else {
        await api.post('/external-mcp', payload);
      }
      
      setShowServerModal(false);
      fetchExternalServers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save external MCP server');
    }
  }

  async function deleteExternalServer(id) {
    if (!confirm('Are you sure you want to delete this external MCP server?')) return;
    try {
      await api.delete(`/external-mcp/${id}`);
      showSuccess('External MCP server deleted');
      fetchExternalServers();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete');
    }
  }

  async function toggleExternalServer(id, isActive) {
    try {
      await api.put(`/external-mcp/${id}`, { isActive });
      showSuccess(`External MCP server ${isActive ? 'enabled' : 'disabled'}`);
      fetchExternalServers();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to update');
    }
  }

  async function installNpmPackage(packageName, runtime = 'node') {
    if (!packageName || !packageName.trim()) {
      setInstallMessage('✗ Please enter a package name');
      return;
    }
    setInstallingPackage(true);
    setInstallMessage('Installing...');
    try {
      await api.post('/external-mcp/install', { packageName: packageName.trim(), runtime });
      setInstallMessage(`✓ Successfully installed ${packageName} (${runtime})`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      if (err.response?.status === 403) {
        setInstallMessage('✗ Admin access required to install packages');
      } else {
        setInstallMessage('✗ Error: ' + errorMsg);
      }
    } finally {
      setInstallingPackage(false);
    }
  }

  async function testExternalServer(id) {
    try {
      const res = await api.get(`/external-mcp/${id}/tools`);
      alert(`Success! Found ${res.data.tools?.length || 0} tools`);
    } catch (err) {
      alert('Failed to connect: ' + (err.response?.data?.error || err.message));
    }
  }

  const openToolTest = (tool) => {
    setTestingTool(tool);
    const initialParams = {};
    if (tool.inputSchema?.properties) {
      Object.keys(tool.inputSchema.properties).forEach(key => {
        initialParams[key] = '';
      });
    }
    setTestParams(initialParams);
    setTestResult(null);
    setShowTestToolModal(true);
  };

  const runToolTest = async () => {
    try {
      setTestResult({ loading: true });
      const res = await api.post('/mcp/execute', {
        toolId: testingTool._id,
        params: testParams
      });
      setTestResult({ success: true, data: res.data });
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setTestResult({ success: false, error: typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg });
    }
  };

  async function fetchServerTools(id) {
    if (abortControllers[id]) {
      abortControllers[id].abort();
    }
    const controller = new AbortController();
    abortControllers[id] = controller;
    
    setLoadingServerTools(id);
    try {
      const res = await api.get(`/external-mcp/${id}/tools`, { signal: controller.signal });
      const tools = (res.data.tools || []).map(tool => ({
        ...tool,
        _id: `external-${id}-${tool.name}`
      }));
      
      if (tools.length === 0) {
        alert('No tools found');
        return;
      }
      
      setTestingTool({ name: 'Multiple Tools', tools: tools, externalServerId: id });
      setShowTestToolModal(true);
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        return;
      }
      alert('Failed to fetch tools: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingServerTools(null);
      delete abortControllers[id];
    }
  }

  return (
    <div>
      <div className="container">
        <div className="page-header">
          <h1>Settings</h1>
          <p>Manage your account and preferences</p>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '250px 1fr' }}>
          <div className="card" style={{ padding: '0.5rem' }}>
            <div className="tabs" style={{ flexDirection: 'column', border: 'none', gap: '0.25rem' }}>
              <div className={`tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>Profile</div>
              <div className={`tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>Security</div>
              <div className={`tab ${activeTab === 'api' ? 'active' : ''}`} onClick={() => setActiveTab('api')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>My API Access</div>
              <div className={`tab ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>Preferences</div>
              <div className={`tab ${activeTab === 'external-mcp' ? 'active' : ''}`} onClick={() => { setActiveTab('external-mcp'); fetchExternalServers(); }} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>External MCP</div>
              <div className={`tab ${activeTab === 'oauth' ? 'active' : ''}`} onClick={() => setActiveTab('oauth')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>OAuth Providers</div>
              <div className={`tab ${activeTab === 'features' ? 'active' : ''}`} onClick={() => setActiveTab('features')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>Features</div>
              <div className={`tab ${activeTab === 'import-export' ? 'active' : ''}`} onClick={() => setActiveTab('import-export')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>Import / Export</div>
              <div className={`tab ${activeTab === 'mcp-server' ? 'active' : ''}`} onClick={() => setActiveTab('mcp-server')} style={{ borderRadius: 'var(--radius)', textAlign: 'left' }}>MCP Server (For AI Assistants)</div>
            </div>
          </div>

          <div className="card">
            {activeTab === 'profile' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>Profile Settings</h2>
                <div className="form-group"><label>Name</label><input type="text" value={user?.name || ''} disabled /></div>
                <div className="form-group"><label>Email</label><input type="email" value={user?.email || ''} disabled /></div>
                <div className="form-group"><label>Role</label><input type="text" value={user?.role || 'user'} disabled /></div>
                <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>Contact admin to update profile details.</p>
              </div>
            )}

            {activeTab === 'security' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>Security</h2>
                <div className="form-group"><label>Current Password</label><input type="password" placeholder="Enter current password" /></div>
                <div className="form-group"><label>New Password</label><input type="password" placeholder="Enter new password" /></div>
                <div className="form-group"><label>Confirm New Password</label><input type="password" placeholder="Confirm new password" /></div>
                <button className="btn btn-primary">Update Password</button>
              </div>
            )}

            {activeTab === 'api' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>My API Access</h2>
                <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>Generate an API key to access MCP Depot programmatically (for your own applications).</p>
                <div style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                  <code style={{ fontSize: '0.85rem' }}>POST /api/consume/trigger</code>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>Execute any API endpoint via MCP Depot</p>
                </div>
                <div style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius)' }}>
                  <code style={{ fontSize: '0.85rem' }}>POST /api/consume/tools/:toolId/execute</code>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>Execute a specific tool by ID</p>
                </div>
                <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1rem' }}>API Key Authentication</h3>
                  <p style={{ color: 'var(--text-light)', marginBottom: '1rem', fontSize: '0.9rem' }}>Generate an API key to authenticate external applications without JWT tokens. Use the header <code>X-API-Key</code> with your key.</p>
                  {generatedApiKey && (
                    <div className="success-message" style={{ marginBottom: '1rem' }}>
                      <strong>Your API Key:</strong>
                      <code style={{ display: 'block', marginTop: '0.5rem', wordBreak: 'break-all' }}>{generatedApiKey}</code>
                      <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Make sure to copy it - you won't see it again!</p>
                    </div>
                  )}
                  {apiKeyMessage && !generatedApiKey && (
                    <div className={apiKeyMessage.includes('removed') ? 'success-message' : 'error-message'} style={{ marginBottom: '1rem' }}>{apiKeyMessage}</div>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={async () => { setApiKeyLoading(true); setApiKeyMessage(''); try { const res = await api.post('/auth/api-key/generate'); setGeneratedApiKey(res.data.apiKey); setApiKeyMessage(res.data.message); } catch (err) { setApiKeyMessage(err.response?.data?.error || 'Failed to generate API key'); } finally { setApiKeyLoading(false); } }} disabled={apiKeyLoading}>{apiKeyLoading ? <LoadingDots text="Generating" /> : 'Generate New Key'}</button>
                    {user?.apiKeyEnabled && (<>                      <button className="btn btn-warning" onClick={async () => { if (!window.confirm('This will invalidate your current API key. Continue?')) return; setApiKeyLoading(true); setApiKeyMessage(''); setGeneratedApiKey(null); try { const res = await api.post('/auth/api-key/regenerate'); setGeneratedApiKey(res.data.apiKey); setApiKeyMessage(res.data.message); } catch (err) { setApiKeyMessage(err.response?.data?.error || 'Failed to regenerate API key'); } finally { setApiKeyLoading(false); } }} disabled={apiKeyLoading}>{apiKeyLoading ? <LoadingDots text="Regenerating" /> : 'Regenerate Key'}</button><button className="btn btn-danger" onClick={async () => { if (!window.confirm('This will disable and remove your API key. Continue?')) return; setApiKeyLoading(true); setApiKeyMessage(''); setGeneratedApiKey(null); try { await api.post('/auth/api-key/disable'); setApiKeyMessage('API key disabled and removed'); } catch (err) { setApiKeyMessage(err.response?.data?.error || 'Failed to disable API key'); } finally { setApiKeyLoading(false); } }} disabled={apiKeyLoading}>{apiKeyLoading ? <LoadingDots text="Disabling" /> : 'Disable Key'}</button></>)}
                  </div>
                  {user?.apiKeyEnabled && !generatedApiKey && <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--success)' }}>API key is active</p>}
                </div>
              </div>
            )}

            {activeTab === 'preferences' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>Preferences</h2>
                <div className="form-group">
                  <label>Theme</label>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {availableThemes.map(t => (
                      <div 
                        key={t}
                        onClick={() => { setThemeName(t); resetPreview(); }}
                        style={{ 
                          cursor: 'pointer',
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius)',
                          border: `2px solid ${themeName === t ? 'var(--primary)' : 'var(--border-light)'}`,
                          background: themeName === t ? 'var(--surface-hover)' : 'var(--surface)',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <div style={{ 
                          width: '20px', 
                          height: '20px', 
                          borderRadius: '50%', 
                          background: t === 'dark' ? '#0c0a09' : t === 'light' ? '#f9fafb' : t === 'ocean' ? '#0c1929' : '#0f120f',
                          border: '1px solid var(--border-light)'
                        }} />
                        <span style={{ fontSize: '0.9rem' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Custom Colors</label>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    Customize colors for this theme. Preview changes instantly, save or cancel.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    {[
                      { key: 'primary', label: 'Primary' },
                      { key: 'success', label: 'Success' },
                      { key: 'danger', label: 'Danger' },
                      { key: 'warning', label: 'Warning' },
                      { key: 'background', label: 'Background' },
                      { key: 'surface', label: 'Surface' },
                      { key: 'text', label: 'Text' },
                      { key: 'textSecondary', label: 'Text Secondary' }
                    ].map(({ key, label }) => {
                      const currentVal = (previewColors || customColors || themes[themeName])[key] || '';
                      return (
                        <div key={key}>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</label>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <input 
                              type="color" 
                              value={currentVal.startsWith('rgba') ? '#000000' : currentVal}
                              onChange={(e) => {
                                const newColors = { ...(previewColors || customColors || {}), [key]: e.target.value };
                                setPreviewColors(newColors);
                              }}
                              style={{ 
                                width: '40px', 
                                height: '32px', 
                                padding: 0, 
                                border: '1px solid var(--border-light)', 
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            />
                            <input 
                              type="text" 
                              value={currentVal}
                              onChange={(e) => {
                                const newColors = { ...(previewColors || customColors || {}), [key]: e.target.value };
                                setPreviewColors(newColors);
                              }}
                              style={{ 
                                flex: 1, 
                                padding: '0.4rem', 
                                fontSize: '0.8rem',
                                background: 'var(--surface)', 
                                border: '1px solid var(--border-light)', 
                                borderRadius: '4px',
                                color: 'var(--text)'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                    {previewColors && (
                      <>
                        <button 
                          className="btn btn-primary"
                          onClick={() => confirmColors(previewColors)}
                        >
                          Save Colors
                        </button>
                        <button 
                          className="btn btn-ghost"
                          onClick={resetPreview}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {(customColors && Object.keys(customColors).length > 0) && !previewColors && (
                      <button 
                        className="btn btn-ghost"
                        onClick={() => saveCustomColors({})}
                        style={{ color: 'var(--danger)' }}
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'external-mcp' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1rem' }}>External MCP</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Connect external MCP servers and install packages.</p>
                
                <div className="tabs" style={{ marginBottom: '1rem', gap: '0.5rem' }}>
                  <div 
                    className={`tab ${externalTab === 'install' ? 'active' : ''}`}
                    onClick={() => setExternalTab('install')}
                    style={{ flex: 1, textAlign: 'center', padding: '0.75rem' }}
                  >
                    📦 Install Packages
                  </div>
                  <div 
                    className={`tab ${externalTab === 'servers' ? 'active' : ''}`}
                    onClick={() => setExternalTab('servers')}
                    style={{ flex: 1, textAlign: 'center', padding: '0.75rem' }}
                  >
                    🔗 External Servers
                  </div>
                </div>

                {externalTab === 'install' && (
                  <div style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Install MCP servers as npm packages (Node.js) or Python packages. Installed packages will appear in the dropdown when adding a new server.
                    </p>
                    <div className="form-group" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                      <div style={{ width: '150px', flexShrink: 0 }}>
                        <StyledSelect
                          options={[
                            { value: 'node', label: 'npm (Node.js)' },
                            { value: 'python', label: 'pip (Python)' }
                          ]}
                          value={installRuntime}
                          onChange={setInstallRuntime}
                          placeholder="Select runtime"
                          isSearchable={false}
                        />
                      </div>
                      <input 
                        type="text" 
                        id="npmPackage"
                        placeholder="e.g., bitbucket-mcp" 
                        style={{ flex: 1 }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            installNpmPackage(document.getElementById('npmPackage').value, installRuntime.value);
                          }
                        }}
                      />
                      <button 
                        className="btn btn-primary" 
                        style={{ flexShrink: 0 }}
                        onClick={() => {
                          installNpmPackage(document.getElementById('npmPackage').value, installRuntime.value);
                        }}
                        disabled={installingPackage}
                      >
                        {installingPackage ? <LoadingDots text="Install" /> : 'Install'}
                      </button>
                    </div>
                    {installMessage && (
                      <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: installMessage.startsWith('Error') || installMessage.startsWith('✗') ? 'var(--danger)' : 'var(--success)' }}>
                        {installMessage}
                      </p>
                    )}
                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--surface)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <strong>Popular MCP Packages:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {['bitbucket-mcp', 'github-mcp', 'jira-mcp', 'filesystem', 'sqlite'].map(pkg => (
                          <span 
                            key={pkg}
                            style={{ cursor: 'pointer', background: 'var(--primary)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}
                            onClick={() => {
                              document.getElementById('npmPackage').value = pkg;
                              document.getElementById('installRuntime').value = 'node';
                              installNpmPackage(pkg, 'node');
                            }}
                          >
                            {pkg}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {externalTab === 'servers' && (
                  <div>
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <strong>💡 Quick Start:</strong> Click a template below to add a pre-configured MCP server.
                    </div>
                    <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {[
                        { name: 'Bitbucket', runtime: 'node', command: 'npx', args: '["bitbucket-mcp"]', env: [{ key: 'BITBUCKET_USERNAME', value: '' }, { key: 'BITBUCKET_PASSWORD', value: '' }] },
                        { name: 'GitHub', runtime: 'node', command: 'npx', args: '["github-mcp"]', env: [{ key: 'GITHUB_TOKEN', value: '' }] },
                        { name: 'Filesystem', runtime: 'python', command: 'uvx', args: '["mcp-server-filesystem"]', env: [{ key: 'MCP_DIR', value: '/data' }] },
                        { name: 'SQLite', runtime: 'python', command: 'uvx', args: '["mcp-server-sqlite"]', env: [{ key: 'DB_PATH', value: '/data/db.sqlite' }] }
                      ].map(template => (
                        <button
                          key={template.name}
                          className="btn btn-small"
                          onClick={() => {
                            setEditingServer(null);
                            setServerForm({
                              name: template.name + ' MCP',
                              transportType: 'stdio',
                              runtime: template.runtime,
                              url: '',
                              command: template.command,
                              args: template.args,
                              env: '',
                              envPairs: template.env.map(e => ({ key: e.key, value: e.value })),
                              authType: 'none',
                              authToken: '',
                              authHeader: ''
                            });
                            setShowServerModal(true);
                          }}
                          style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
                        >
                          + {template.name}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginBottom: '1rem' }}><button className="btn btn-primary" onClick={() => { setEditingServer(null); setServerForm({ name: '', transportType: 'http', runtime: 'node', url: '', command: 'npx', args: '', env: '', envPairs: [{ key: '', value: '' }], authType: 'none', authToken: '', authHeader: '' }); setShowServerModal(true); }}>+ Add External MCP Server</button></div>
                      {externalLoading ? <p><LoadingDots text="External servers" /></p> : externalServers.length === 0 ? <div className="empty-state"><p>No external MCP servers configured</p></div> : (
                      <div>
                        {externalServers.map(server => {
                          const entry = poolStatus.find(e => e.serverId === server._id);
                          return (
                          <div key={server._id} className="card" style={{ marginBottom: '0.5rem', padding: '1rem', borderLeft: server.lastFetchError ? '3px solid var(--danger)' : !server.isActive ? '3px solid var(--warning)' : server.lastFetchedAt ? '3px solid var(--success)' : '3px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    display: 'inline-block',
                                    background: entry?.state === 'connected' ? '#10b981' : entry?.state === 'connecting' ? '#f59e0b' : server.lastFetchError ? '#ef4444' : '#6b7280',
                                    animation: entry?.state === 'connected' ? 'pulse 2s infinite' : entry?.state === 'connecting' ? 'spin 1s linear infinite' : 'none'
                                  }} title={entry?.state === 'connected' ? `Connected · idle ${entry.idleSecs}s` : entry?.state === 'connecting' ? 'Connecting...' : server.lastFetchError ? 'Error' : 'Not connected'} />
                                  <strong>{server.name}</strong>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{server.transportType === 'stdio' ? `${server.command} ${server.args}` : server.url}</p>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span className={`badge ${server.isActive ? 'badge-success' : 'badge-warning'}`}>{server.isActive ? 'Active' : 'Disabled'}</span>
                                  <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{server.transportType || 'http'}</span>
                                  {server.lastFetchedAt && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                      Last sync: {new Date(server.lastFetchedAt).toLocaleString()}
                                    </span>
                                  )}
                                  {server.lastFetchError && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--danger)', background: 'var(--error-bg)', padding: '0.1rem 0.3rem', borderRadius: '3px' }} title={server.lastFetchError}>
                                      Error
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                <button className="btn btn-primary btn-small" onClick={() => fetchServerTools(server._id)} disabled={loadingServerTools === server._id}>
                                  {loadingServerTools === server._id ? <LoadingDots text="Tools" /> : <><Wrench size={14} /> Tools</>}
                                </button>
                                <DropdownMenu>
                                  <DropdownItem onClick={() => toggleExternalServer(server._id, !server.isActive)}>
                                    {server.isActive ? 'Disable' : 'Enable'}
                                  </DropdownItem>
                                  <DropdownItem onClick={() => {
                                    const config = {
                                      name: server.name,
                                      transportType: server.transportType,
                                      command: server.command,
                                      args: server.args ? JSON.parse(server.args) : [],
                                      env: server.env ? JSON.parse(server.env) : {}
                                    };
                                    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                                    showSuccess('Config copied to clipboard');
                                  }}>
                                    <Copy size={14} /> Copy Config
                                  </DropdownItem>
                                  <DropdownSeparator />
                                  <DropdownItem onClick={() => { setEditingServer(server); const envPairs = server.env ? Object.entries(JSON.parse(server.env)).map(([key, value]) => ({ key, value: String(value) })) : [{ key: '', value: '' }]; setServerForm({ name: server.name, transportType: server.transportType || 'http', runtime: server.runtime || 'node', url: server.url || '', command: server.command || 'npx', args: server.args || '', env: server.env || '', envPairs, authType: server.authType || 'none', authToken: '', authHeader: server.authHeader || '' }); setShowServerModal(true); }}>
                                    <Edit2 size={14} /> Edit
                                  </DropdownItem>
                                  <DropdownItem onClick={() => deleteExternalServer(server._id)} danger>
                                    <Trash2 size={14} /> Delete
                                  </DropdownItem>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'import-export' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1rem' }}>Import / Export</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Export your configuration to a JSON file for backup, or import configurations from other MCP Depot instances.
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>📤 Export</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Select what you want to export:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="exportExternalMcp" defaultChecked />
                        External MCP Servers
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="exportIntegrations" defaultChecked />
                        Integrations
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="exportTools" defaultChecked />
                        Tools
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="exportWorkflows" />
                        Workflows
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="exportSkills" defaultChecked />
                        Skills
                      </label>
                    </div>
                    <button className="btn btn-primary" onClick={async () => {
                      const data = {
                        externalMcp: document.getElementById('exportExternalMcp').checked,
                        integrations: document.getElementById('exportIntegrations').checked,
                        tools: document.getElementById('exportTools').checked,
                        workflows: document.getElementById('exportWorkflows').checked,
                        skills: document.getElementById('exportSkills').checked
                      };
                      try {
                        const res = await api.post('/system/export', data, { responseType: 'blob' });
                        const url = window.URL.createObjectURL(res.data);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `mcp-depot-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        alert('Export failed: ' + (err.response?.data?.error || err.message));
                      }
                    }}>
                      Export Selected
                    </button>
                  </div>
                  
                  <div className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>📥 Import</h3>
                    {!importPreview ? (
                      <>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Upload a JSON configuration file:</p>
                        <input type="file" accept=".json" id="importFile" style={{ marginBottom: '1rem' }} />
                        <button className="btn btn-primary" onClick={async () => {
                          const file = document.getElementById('importFile').files[0];
                          if (!file) {
                            alert('Please select a file first');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = async (e) => {
                            try {
                              const json = JSON.parse(e.target.result);
                              const res = await api.post('/system/import-preview', json);
                              setImportPreview(res.data);
                              setSelectedForImport({
                                externalMcpServers: (res.data.externalMcpServers || []).map((_, i) => i),
                                integrations: (res.data.integrations || []).map((_, i) => i),
                                tools: (res.data.tools || []).map((_, i) => i),
                                workflows: (res.data.workflows || []).map((_, i) => i),
                                skills: (res.data.skills || []).map((_, i) => i)
                              });
                            } catch (err) {
                              alert('Invalid JSON file: ' + (err.message || 'Failed to parse'));
                            }
                          };
                          reader.readAsText(file);
                        }}>
                          Preview Import
                        </button>
                      </>
                    ) : (
                      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                          <strong>External MCP Servers ({importPreview.externalMcpServers?.length || 0})</strong>
                          {importPreview.externalMcpServers?.length > 0 && (
                            <div style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}>
                              {importPreview.externalMcpServers.map((s, i) => (
                                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                  <input type="checkbox" checked={selectedForImport.externalMcpServers.includes(i)} onChange={(e) => {
                                    const arr = [...selectedForImport.externalMcpServers];
                                    if (e.target.checked) arr.push(i);
                                    else setSelectedForImport({ ...selectedForImport, externalMcpServers: arr.filter(x => x !== i) });
                                    setSelectedForImport({ ...selectedForImport, externalMcpServers: e.target.checked ? [...selectedForImport.externalMcpServers, i] : selectedForImport.externalMcpServers.filter(x => x !== i) });
                                  }} />
                                  {s.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({s.transportType})</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                          <strong>Integrations ({importPreview.integrations?.length || 0})</strong>
                          {importPreview.integrations?.length > 0 && (
                            <div style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}>
                              {importPreview.integrations.map((i, idx) => (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                  <input type="checkbox" checked={selectedForImport.integrations.includes(idx)} onChange={(e) => setSelectedForImport({ ...selectedForImport, integrations: e.target.checked ? [...selectedForImport.integrations, idx] : selectedForImport.integrations.filter(x => x !== idx) })} />
                                  {i.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({i.type})</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                          <strong>Tools ({importPreview.tools?.length || 0})</strong>
                          {importPreview.tools?.length > 0 && (
                            <div style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}>
                              {importPreview.tools.map((t, idx) => (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                  <input type="checkbox" checked={selectedForImport.tools.includes(idx)} onChange={(e) => setSelectedForImport({ ...selectedForImport, tools: e.target.checked ? [...selectedForImport.tools, idx] : selectedForImport.tools.filter(x => x !== idx) })} />
                                  {t.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({typeof t.endpoint === 'string' ? t.endpoint : t.endpoint?.path || 'N/A'}){t.integrationRef && <span style={{ color: 'var(--accent)', marginLeft: '0.25rem' }}>{t.integrationRef}</span>}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                          <strong>Workflows ({importPreview.workflows?.length || 0})</strong>
                          {importPreview.workflows?.length > 0 && (
                            <div style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}>
                              {importPreview.workflows.map((w, idx) => (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                  <input type="checkbox" checked={selectedForImport.workflows.includes(idx)} onChange={(e) => setSelectedForImport({ ...selectedForImport, workflows: e.target.checked ? [...selectedForImport.workflows, idx] : selectedForImport.workflows.filter(x => x !== idx) })} />
                                  {w.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({w.description})</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                          <strong>Skills ({importPreview.skills?.length || 0})</strong>
                          {importPreview.skills?.length > 0 && (
                            <div style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}>
                              {importPreview.skills.map((s, idx) => (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                  <input type="checkbox" checked={selectedForImport.skills.includes(idx)} onChange={(e) => setSelectedForImport({ ...selectedForImport, skills: e.target.checked ? [...selectedForImport.skills, idx] : selectedForImport.skills.filter(x => x !== idx) })} />
                                  {s.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({s.description})</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                          <button className="btn btn-secondary" onClick={() => { setImportPreview(null); setSelectedForImport({ externalMcpServers: [], integrations: [], tools: [], workflows: [], skills: [] }); }}>
                            Cancel
                          </button>
                          <button className="btn btn-primary" onClick={async () => {
                            try {
                              const payload = {
                                externalMcpServers: selectedForImport.externalMcpServers.map(i => importPreview.externalMcpServers[i]),
                                integrations: selectedForImport.integrations.map(i => importPreview.integrations[i]),
                                tools: selectedForImport.tools.map(i => importPreview.tools[i]),
                                workflows: selectedForImport.workflows.map(i => importPreview.workflows[i]),
                                skills: selectedForImport.skills.map(i => importPreview.skills[i])
                              };
                              const res = await api.post('/system/import', payload);
                              alert(`Import complete!\n\nImported:\n- External MCP: ${res.data.externalMcp || 0}\n- Integrations: ${res.data.integrations || 0}\n- Tools: ${res.data.tools || 0}\n- Workflows: ${res.data.workflows || 0}\n- Skills: ${res.data.skills || 0}`);
                              setImportPreview(null);
                              setSelectedForImport({ externalMcpServers: [], integrations: [], tools: [], workflows: [], skills: [] });
                            } catch (err) {
                              alert('Import failed: ' + (err.response?.data?.error || err.message));
                            }
                          }} disabled={selectedForImport.externalMcpServers.length === 0 && selectedForImport.integrations.length === 0 && selectedForImport.tools.length === 0 && selectedForImport.workflows.length === 0}>
                            Import Selected
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'oauth' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1rem' }}>OAuth Providers</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Configure OAuth providers for integrations. Users will be able to connect using OAuth when creating integrations.
                </p>
                <div className="card" style={{ padding: '1rem', background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    OAuth provider configuration is managed via environment variables.
                  </p>
                  <pre style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface)', borderRadius: '6px', fontSize: '0.8rem', overflow: 'auto' }}>
{`# Example environment variables for OAuth:
OAUTH_GITHUB_CLIENT_ID=your_github_client_id
OAUTH_GITHUB_CLIENT_SECRET=your_github_client_secret
OAUTH_GITHUB_REDIRECT_URI=https://your-domain.com/api/oauth/callback

OAUTH_GOOGLE_CLIENT_ID=your_google_client_id
OAUTH_GOOGLE_CLIENT_SECRET=your_google_client_secret  
OAUTH_GOOGLE_REDIRECT_URI=https://your-domain.com/api/oauth/callback

OAUTH_SLACK_CLIENT_ID=your_slack_client_id
OAUTH_SLACK_CLIENT_SECRET=your_slack_client_secret
OAUTH_SLACK_REDIRECT_URI=https://your-domain.com/api/oauth/callback`}
                  </pre>
                  <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', marginTop: '1rem' }}>
                    Configure these in your environment and restart the server to enable OAuth providers.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'features' && (
              <div>
                <h2 className="card-title" style={{ marginBottom: '1rem' }}>Feature Flags</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Enable or disable features in the application. Changes take effect immediately.
                </p>
                {user?.role !== 'admin' ? (
                  <div className="card" style={{ padding: '1rem', background: 'var(--surface-hover)' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>You need admin privileges to modify features.</p>
                  </div>
                ) : featuresLoading ? (
                  <div className="card" style={{ padding: '1rem' }}><LoadingDots text="Loading features" /></div>
                ) : (
                  <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                      {['integrations', 'tools', 'skills', 'sessions', 'channels', 'personas', 'users', 'monitoring', 'health'].map(feature => (
                        <label key={feature} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={features?.includes(feature) || false}
                            onChange={(e) => {
                              const newFeatures = e.target.checked
                                ? [...(features || []), feature]
                                : (features || []).filter(f => f !== feature);
                              saveFeatures(newFeatures);
                            }}
                            disabled={featuresSaving}
                          />
                          <span style={{ textTransform: 'capitalize' }}>{feature}</span>
                        </label>
                      ))}
                    </div>
                    {featuresSaving && <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Saving...</p>}
                  </div>
                )}
                {user?.role === 'admin' && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>Setup Wizard</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      Re-run the initial setup wizard to reconfigure features and deployment mode.
                    </p>
                    <button className="btn btn-secondary" onClick={async () => {
                      try {
                        await api.delete('/system/setup-complete');
                      } catch (e) {
                        await api.post('/system/setup-complete-reset').catch(() => {});
                      }
                      window.location.href = '/setup';
                    }}>
                      Re-run Setup Wizard
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'mcp-server' && (
              <MCPServerSettings />
            )}
          </div>
        </div>
      </div>

      {showServerModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingServer ? 'Edit' : 'Add'} External MCP Server</h2>
              <button className="modal-close" onClick={() => setShowServerModal(false)}>&times;</button>
            </div>
              <div className="modal-body">
              <div className="form-group"><label>Name</label><input type="text" value={serverForm.name} onChange={e => setServerForm({ ...serverForm, name: e.target.value })} placeholder="My External MCP" /></div>
              <div className="form-group">
                <label>Transport Type</label>
                <StyledSelect
                  options={[
                    { value: 'http', label: 'HTTP' },
                    { value: 'stdio', label: 'Stdio (process)' }
                  ]}
                  value={{ value: serverForm.transportType, label: serverForm.transportType === 'http' ? 'HTTP' : 'Stdio (process)' }}
                  onChange={(opt) => setServerForm({ ...serverForm, transportType: opt?.value || 'http' })}
                  isSearchable={false}
                />
              </div>
              {serverForm.transportType === 'http' ? (
                <div className="form-group"><label>URL</label><input type="text" value={serverForm.url} onChange={e => setServerForm({ ...serverForm, url: e.target.value })} placeholder="http://localhost:3001/api/mcp" /></div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Runtime</label>
                    <StyledSelect
                      options={[
                        { value: 'node', label: 'Node.js (npx, node)' },
                        { value: 'python', label: 'Python (uvx, python -m)' }
                      ]}
                      value={{ value: serverForm.runtime, label: serverForm.runtime === 'node' ? 'Node.js (npx, node)' : 'Python (uvx, python -m)' }}
                      onChange={(opt) => {
                        const newRuntime = opt?.value || 'node';
                        setServerForm({ 
                          ...serverForm, 
                          runtime: newRuntime,
                          command: newRuntime === 'python' ? 'uvx' : 'npx',
                          args: ''
                        });
                      }}
                      isSearchable={false}
                    />
                  </div>
                  <div className="form-group"><label>Command</label><input type="text" value={serverForm.command} onChange={e => setServerForm({ ...serverForm, command: e.target.value })} placeholder={serverForm.runtime === 'python' ? 'uvx' : 'npx'} /></div>
                  <div className="form-group"><label>Args (JSON array)</label><input type="text" value={serverForm.args} onChange={e => setServerForm({ ...serverForm, args: e.target.value })} placeholder={serverForm.runtime === 'python' ? '["mcp-server-myPackage"]' : '["bitbucket-mcp"]'} /></div>
                  <div className="form-group">
                    <label>Environment Variables (optional)</label>
                    {serverForm.envPairs.map((pair, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          value={pair.key}
                          onChange={e => {
                            const newPairs = [...serverForm.envPairs];
                            newPairs[idx].key = e.target.value;
                            setServerForm({ ...serverForm, envPairs: newPairs });
                          }}
                          placeholder="KEY"
                          style={{ flex: 1 }}
                        />
                        <input
                          type="text"
                          value={pair.value}
                          onChange={e => {
                            const newPairs = [...serverForm.envPairs];
                            newPairs[idx].value = e.target.value;
                            setServerForm({ ...serverForm, envPairs: newPairs });
                          }}
                          placeholder="value"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={() => {
                            const newPairs = serverForm.envPairs.filter((_, i) => i !== idx);
                            setServerForm({ ...serverForm, envPairs: newPairs.length ? newPairs : [{ key: '', value: '' }] });
                          }}
                        >×</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => setServerForm({ ...serverForm, envPairs: [...serverForm.envPairs, { key: '', value: '' }] })}
                      style={{ marginTop: '0.25rem' }}
                    >
                      + Add Variable
                    </button>
                    {serverForm.envPairs.some(p => p.key) && (
                      <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        JSON preview: {JSON.stringify(serverForm.envPairs.reduce((acc, p) => p.key ? { ...acc, [p.key]: p.value } : acc, {}))}
                      </p>
                    )}
                  </div>
                </>
              )}
              {serverForm.transportType === 'http' && (
                <div className="form-group">
                  <label>Auth Type</label>
                  <StyledSelect
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'bearer', label: 'Bearer Token' },
                      { value: 'apiKey', label: 'API Key (X-API-Key)' }
                    ]}
                    value={{ value: serverForm.authType, label: serverForm.authType === 'none' ? 'None' : serverForm.authType === 'bearer' ? 'Bearer Token' : 'API Key (X-API-Key)' }}
                    onChange={(opt) => setServerForm({ ...serverForm, authType: opt?.value || 'none' })}
                    isSearchable={false}
                  />
                </div>
              )}
              {serverForm.transportType === 'http' && serverForm.authType !== 'none' && (<>{serverForm.authType === 'apiKey' && <div className="form-group"><label>Auth Header Name</label><input type="text" value={serverForm.authHeader} onChange={e => setServerForm({ ...serverForm, authHeader: e.target.value })} placeholder="X-API-Key" /></div>}<div className="form-group"><label>{serverForm.authType === 'bearer' ? 'Token' : 'API Key'}</label><input type="password" value={serverForm.authToken} onChange={e => setServerForm({ ...serverForm, authToken: e.target.value })} placeholder={editingServer ? '(unchanged)' : 'Enter token'} /></div></>)}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowServerModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveExternalServer}>{editingServer ? 'Update' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {showTestToolModal && testingTool && (
        <div className="modal-overlay" onClick={() => setShowTestToolModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Test Tool</h2>
              <button className="modal-close" onClick={() => setShowTestToolModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {testingTool.tools ? (
                <>
                  <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Select a tool to test:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                    {testingTool.tools.map(tool => (
                      <button key={tool.name} className="btn btn-secondary" onClick={() => openToolTest(tool)} style={{ textAlign: 'left', justifyContent: 'flex-start' }}>{tool.name}</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '4px' }}>
                    <strong>{testingTool.name}</strong>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{testingTool.description}</p>
                  </div>
                  {testingTool.inputSchema?.properties && Object.keys(testingTool.inputSchema.properties).length > 0 ? (
                    <div>
                      <p style={{ marginBottom: '0.5rem', fontWeight: 500 }}>Parameters:</p>
                      {Object.entries(testingTool.inputSchema.properties).map(([key, details]) => (
                        <div key={key} className="form-group">
                          <label>{key} {testingTool.inputSchema.required?.includes(key) && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                          <input type="text" value={testParams[key] || ''} onChange={e => setTestParams({ ...testParams, [key]: e.target.value })} placeholder={details.description || `${details.type}`} />
                        </div>
                      ))}
                    </div>
                  ) : (<p style={{ color: 'var(--text-secondary)' }}>This tool doesn't require parameters.</p>)}
                  {testResult && (<div style={{ marginTop: '1rem', padding: '0.75rem', background: testResult.success ? 'var(--success-bg)' : 'var(--error-bg)', borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'ui-monospace, Consolas, Monaco, "Liberation Mono", "Lucida Console", monospace', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>{testResult.loading ? 'Running...' : testResult.success ? JSON.stringify(testResult.data, null, 2) : testResult.error}</div>)}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTestToolModal(false)}>Close</button>
              {testingTool.inputSchema?.properties && <button className="btn btn-primary" onClick={runToolTest} disabled={testResult?.loading}>{testResult?.loading ? 'Running...' : 'Run'}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
