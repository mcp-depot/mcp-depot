import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getIntegrationIcon, getIntegrationColor } from '../utils/integrationIcons';
import { StyledSelect } from '../components/StyledSelect';

function Integrations() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState([]);
  const [selectedForImport, setSelectedForImport] = useState([]);
  const [importData, setImportData] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const [discoverForm, setDiscoverForm] = useState({ baseUrl: '', openApiPath: '', authType: 'none', token: '' });
  const [discovering, setDiscovering] = useState(false);
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState({
    type: 'custom',
    name: '',
    description: '',
    baseUrl: '',
    authType: 'none',
    username: '',
    token: '',
    apiKey: '',
    apiKeyName: '',
    apiKeyIn: 'header',
    bearerToken: ''
  });

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const res = await api.get('/integrations');
      setIntegrations(res.data);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscover = async (e) => {
    e.preventDefault();
    setDiscovering(true);
    setDiscoveredEndpoints([]);
    setSelectedEndpoints([]);
    
    try {
      const authConfig = { type: discoverForm.authType };
      if (discoverForm.authType === 'bearer' && discoverForm.token) {
        authConfig.credentials = { token: discoverForm.token };
      }
      
      const res = await api.post('/integrations/discover', {
        baseUrl: discoverForm.baseUrl,
        openApiPath: discoverForm.openApiPath || null,
        auth: discoverForm.authType !== 'none' ? authConfig : null
      });
      
      setDiscoveredEndpoints(res.data.endpoints || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to discover API');
    } finally {
      setDiscovering(false);
    }
  };

  const toggleEndpoint = (endpoint) => {
    const idx = selectedEndpoints.findIndex(e => e.path === endpoint.path && e.method === endpoint.method);
    if (idx >= 0) {
      setSelectedEndpoints(selectedEndpoints.filter((_, i) => i !== idx));
    } else {
      setSelectedEndpoints([...selectedEndpoints, endpoint]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedEndpoints.length === discoveredEndpoints.length) {
      setSelectedEndpoints([]);
    } else {
      setSelectedEndpoints([...discoveredEndpoints]);
    }
  };

  const handleImportTools = async () => {
    if (!form.name || !form.baseUrl) {
      alert('Please enter a name and base URL for the integration');
      return;
    }
    
    setImporting(true);
    try {
      const config = {
        baseUrl: form.baseUrl,
        auth: {
          type: discoverForm.authType,
          credentials: discoverForm.authType === 'bearer' ? { token: discoverForm.token } : {}
        }
      };
      
      const payload = { type: 'custom', name: form.name, description: form.description || '', config };
      const res = await api.post('/integrations', payload);
      
      if (res.data._id && selectedEndpoints.length > 0) {
        await api.post(`/integrations/${res.data._id}/import-tools`, {
          endpoints: selectedEndpoints
        });
      }
      
      setShowDiscoverModal(false);
      setShowModal(false);
      resetForm();
      setDiscoverForm({ baseUrl: '', openApiPath: '', authType: 'none', token: '' });
      setDiscoveredEndpoints([]);
      setSelectedEndpoints([]);
      fetchIntegrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create integration');
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let payload;

      if (editingId) {
        payload = { name: form.name, description: form.description };
        
        const hasNewCredentials = (form.authType === 'basic' && (form.username || form.token)) ||
          (form.authType === 'bearer' && form.bearerToken) ||
          (form.authType === 'apiKey' && (form.apiKeyName || form.apiKey));
        
        if (hasNewCredentials) {
          const config = {
            baseUrl: form.baseUrl,
            auth: {
              type: form.authType,
              credentials: {}
            }
          };

          if (form.authType === 'basic') {
            config.auth.credentials = { username: form.username, token: form.token };
          } else if (form.authType === 'bearer') {
            config.auth.credentials = { token: form.bearerToken };
          } else if (form.authType === 'apiKey') {
            config.auth.credentials = { key: form.apiKeyName, value: form.apiKey, addTo: form.apiKeyIn };
          }
          
          payload.config = config;
        }
      } else {
        const config = {
          baseUrl: form.baseUrl,
          auth: {
            type: form.authType,
            credentials: {}
          }
        };

        if (form.authType === 'basic') {
          config.auth.credentials = { username: form.username, token: form.token };
        } else if (form.authType === 'bearer') {
          config.auth.credentials = { token: form.bearerToken };
        } else if (form.authType === 'apiKey') {
          config.auth.credentials = { key: form.apiKeyName, value: form.apiKey, addTo: form.apiKeyIn };
        }

        payload = { type: form.type, name: form.name, description: form.description, config };
      }

      if (editingId) {
        await api.put(`/integrations/${editingId}`, payload);
      } else {
        await api.post('/integrations', payload);
      }

      setShowModal(false);
      resetForm();
      fetchIntegrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save integration');
    }
  };

  const handleEdit = (integration) => {
    const credentials = integration.config?.auth?.credentials || {};
    setEditingId(integration._id);
    setForm({
      type: integration.type,
      name: integration.name,
      description: integration.description || '',
      baseUrl: integration.baseUrl,
      authType: integration.authType || 'none',
      username: credentials.username || '',
      token: credentials.token || '',
      apiKey: credentials.value || '',
      apiKeyName: credentials.key || '',
      apiKeyIn: credentials.addTo || 'header',
      bearerToken: credentials.token || ''
    });
    setShowModal(true);
  };

  const handleToggleActive = async (id, currentStatus) => {
    try {
      await api.put(`/integrations/${id}`, { isActive: !currentStatus });
      fetchIntegrations();
    } catch (err) {
      alert('Failed to update integration status');
    }
  };

  const handleDelete = async (id) => {
    const integration = integrations.find(i => i._id === id);
    const hasTools = integration?.metadata?.toolCount > 0;
    
    let confirmMessage = 'Are you sure you want to delete this integration?';
    if (hasTools) {
      confirmMessage = `This integration has ${integration.metadata.toolCount} tool(s). Deleting will also remove all tools. Are you sure you want to proceed?`;
    }
    
    if (!confirm(confirmMessage)) return;
    
    try {
      await api.delete(`/integrations/${id}`);
      fetchIntegrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete integration');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      type: 'custom', name: '', description: '', baseUrl: '', authType: 'none',
      username: '', token: '', apiKey: '', apiKeyName: '', apiKeyIn: 'header', bearerToken: ''
    });
  };

  const handleExport = async (includeTools) => {
    try {
      const res = await api.post('/integrations/export', { 
        includeTools,
        integrationIds: selectedForExport
      });
      
      if (!res.data?.integrations?.length) {
        alert('No integrations found to export');
        return;
      }
      
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mcpconnect-integrations-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err) {
      console.error('Export error:', err);
      alert(err.response?.data?.error || 'Export failed');
    }
  };

  const handleImportSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setImportData(data);
      setSelectedForImport(data.integrations.map((_, idx) => idx));
    } catch (err) {
      alert('Invalid file');
    }
  };

  const handleImport = async () => {
    try {
      const includeTools = window.confirm('Import tools as well?');
      const mode = window.confirm('Update existing integrations?') ? 'update' : 'skip';
      const selectedIntegrations = selectedForImport.map(idx => importData.integrations[idx]);
      const res = await api.post('/integrations/import', { 
        integrations: selectedIntegrations, 
        includeTools, 
        mode 
      });
      alert(`Imported: ${res.data.imported}, Skipped: ${res.data.skipped}`);
      setShowImportModal(false);
      setImportData(null);
      setSelectedForImport([]);
      fetchIntegrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Import failed');
    }
  };

  return (
    <div>
      <div className="container">
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1>Integrations</h1>
              <p>Connect to any third-party API</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => { setShowDiscoverModal(true); }}>
                Discover API
              </button>
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                + Add Integration
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner"></div></div>
        ) : integrations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">-</div>
            <h3>No integrations yet</h3>
            <p>Add your first integration or discover an API</p>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
<button className="btn btn-secondary" onClick={() => setShowDiscoverModal(true)}>
                Discover API
              </button>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                Add Integration
              </button>
            </div>
          </div>
        ) : (
          <div className="grid">
            {integrations.map(integration => (
              <div key={integration._id} className="integration-card">
                <div className="integration-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center' }}>{getIntegrationIcon(integration.type)}</span>
                    <span className="integration-name">{integration.name}</span>
                    {integration.requiresCredentials && !integration.canUse && (
                      <span 
                        className="badge badge-warning" 
                        title="Credentials required - click to configure"
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        onClick={() => window.location.href = `/integrations/${integration._id}/tools`}
                      >
                        ⚠️ Credentials needed
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={integration.isActive} 
                        onChange={() => handleToggleActive(integration._id, integration.isActive)}
                        disabled={integration.requiresCredentials && !integration.canUse}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className={`badge ${integration.isActive ? 'badge-success' : 'badge-warning'}`}>
                      {integration.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <p className="integration-description">{integration.description}</p>
                <p className="integration-url">{integration.baseUrl}</p>
                <span className="integration-type">{integration.type}</span>
                <div className="integration-actions">
                  <Link to={`/integrations/${integration._id}/tools`} className="btn btn-primary btn-small">
                    Tools
                  </Link>
                  <button className="btn btn-icon" onClick={() => handleEdit(integration)} title="Edit integration">
                    Edit
                  </button>
                  <button 
                    className="btn btn-icon btn-danger" 
                    onClick={() => handleDelete(integration._id)} 
                    title={integration.name === 'MCPConnect' ? 'Cannot delete default integration' : 'Delete integration'}
                    disabled={integration.name === 'MCPConnect'}
                    style={{ opacity: integration.name === 'MCPConnect' ? 0.5 : 1, cursor: integration.name === 'MCPConnect' ? 'not-allowed' : 'pointer' }}
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Discover API Modal */}
        {showDiscoverModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Discover API Endpoints</h2>
                <button className="modal-close" onClick={() => setShowDiscoverModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                {discoveredEndpoints.length === 0 ? (
                  <form onSubmit={handleDiscover}>
                    <div className="form-group">
                      <label>API Base URL</label>
                      <input 
                        type="url" 
                        value={discoverForm.baseUrl} 
                        onChange={e => setDiscoverForm({ ...discoverForm, baseUrl: e.target.value })} 
                        placeholder="https://api.github.com" 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>OpenAPI Spec Path (optional)</label>
                      <input 
                        type="text" 
                        value={discoverForm.openApiPath} 
                        onChange={e => setDiscoverForm({ ...discoverForm, openApiPath: e.target.value })} 
                        placeholder="/openapi.json or leave empty for auto-detect"
                      />
                    </div>
                    <div className="form-group">
                      <label>Authentication (if needed)</label>
                      <StyledSelect
                        options={[
                          { value: 'none', label: 'None' },
                          { value: 'bearer', label: 'Bearer Token' },
                          { value: 'oauth2', label: 'OAuth 2.0' }
                        ]}
                        value={{ value: discoverForm.authType, label: discoverForm.authType === 'none' ? 'None' : 'Bearer Token' }}
                        onChange={(opt) => setDiscoverForm({ ...discoverForm, authType: opt?.value || 'none' })}
                        isSearchable={false}
                      />
                    </div>
                    {discoverForm.authType === 'bearer' && (
                      <div className="form-group">
                        <label>Token</label>
                        <input 
                          type="password" 
                          value={discoverForm.token} 
                          onChange={e => setDiscoverForm({ ...discoverForm, token: e.target.value })} 
                          placeholder="Enter your API token or infisical://dev/SECRET_NAME"
                        />
                      </div>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={discovering} style={{ width: '100%' }}>
                      {discovering ? 'Discovering...' : 'Discover Endpoints'}
                    </button>
                  </form>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--success-bg)', borderRadius: '4px' }}>
                      <strong>Found {discoveredEndpoints.length} endpoints</strong>
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border-light)' }}>
                      <div style={{ padding: '0.5rem', background: 'var(--surface-hover)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={selectedEndpoints.length === discoveredEndpoints.length} onChange={toggleSelectAll} />
                          <strong>Select All</strong>
                        </label>
                        <span>{selectedEndpoints.length} selected</span>
                      </div>
                      {discoveredEndpoints.map((ep, idx) => (
                        <div key={idx} style={{ padding: '0.5rem', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedEndpoints.some(e => e.path === ep.path && e.method === ep.method)}
                            onChange={() => toggleEndpoint(ep)}
                          />
                          <span style={{ 
                            fontFamily: 'monospace', 
                            fontWeight: 'bold',
                            color: ep.method === 'GET' ? '#28a745' : ep.method === 'POST' ? '#007bff' : ep.method === 'PUT' ? '#ffc107' : ep.method === 'DELETE' ? '#dc3545' : '#6c757d'
                          }}>{ep.method}</span>
                          <span style={{ fontFamily: 'monospace', flex: 1 }}>{ep.path}</span>
                          {ep.operationId && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{ep.operationId}</span>}
                        </div>
                      ))}
                    </div>
                    
                    <div style={{ borderTop: '1px solid #ddd', paddingTop: '1rem', marginTop: '1rem' }}>
                      <h4>Save as Integration</h4>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Name</label>
                          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My API" />
                        </div>
                        <div className="form-group">
                          <label>Description</label>
                          <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
                        </div>
                      </div>
                      <input type="hidden" value={discoverForm.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {discoveredEndpoints.length > 0 && (
                  <button className="btn btn-secondary" onClick={() => { setDiscoveredEndpoints([]); setSelectedEndpoints([]); }}>
                    Back
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => { setShowDiscoverModal(false); setDiscoveredEndpoints([]); setSelectedEndpoints([]); }}>
                  Cancel
                </button>
                {discoveredEndpoints.length > 0 && (
                  <button className="btn btn-primary" onClick={handleImportTools} disabled={importing || selectedEndpoints.length === 0}>
                    {importing ? 'Importing...' : `Import ${selectedEndpoints.length} Tools`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Integration Modal */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingId ? 'Edit Integration' : 'Add Integration'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Integration Type</label>
                    <StyledSelect
                      options={[
                        { value: 'custom', label: 'Custom API' },
                        { value: 'jira', label: 'Jira' },
                        { value: 'github', label: 'GitHub' },
                        { value: 'gitlab', label: 'GitLab' },
                        { value: 'bitbucket', label: 'Bitbucket' },
                        { value: 'jenkins', label: 'Jenkins' },
                        { value: 'confluence', label: 'Confluence' }
                      ]}
                      value={{ value: form.type, label: form.type.charAt(0).toUpperCase() + form.type.slice(1) }}
                      onChange={(opt) => setForm({ ...form, type: opt?.value || 'custom' })}
                      isSearchable={false}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name</label>
                      <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My API" required />
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Base URL</label>
                    <input type="url" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com" required />
                  </div>
                  <div className="form-group">
                    <label>Authentication</label>
                      <StyledSelect
                        options={[
                          { value: 'none', label: 'None' },
                          { value: 'basic', label: 'Basic Auth' },
                          { value: 'bearer', label: 'Bearer Token' },
                          { value: 'apiKey', label: 'API Key' },
                          { value: 'oauth2', label: 'OAuth 2.0' }
                        ]}
                        value={{ value: form.authType, label: form.authType === 'none' ? 'None' : form.authType === 'basic' ? 'Basic Auth' : form.authType === 'bearer' ? 'Bearer Token' : 'API Key' }}
                        onChange={(opt) => setForm({ ...form, authType: opt?.value || 'none' })}
                        isSearchable={false}
                      />
                    </div>
                    {form.authType === 'basic' && (
                      <div className="auth-section">
                        <div className="form-row">
                          <div className="form-group">
                            <label>Username</label>
                            <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label>Password/Token</label>
                            <input type="password" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} placeholder="password or infisical://dev/SECRET_NAME" />
                          </div>
                        </div>
                      </div>
                    )}
                  {form.authType === 'bearer' && (
                    <div className="auth-section">
                      <div className="form-group">
                        <label>Bearer Token</label>
                        <input type="password" value={form.bearerToken} onChange={e => setForm({ ...form, bearerToken: e.target.value })} placeholder="Enter token or infisical://dev/SECRET_NAME" />
                      </div>
                    </div>
)}
                    {form.authType === 'apiKey' && (
                      <div className="auth-section">
                        <div className="form-row">
                          <div className="form-group">
                            <label>Key Name</label>
                            <input type="text" value={form.apiKeyName} onChange={e => setForm({ ...form, apiKeyName: e.target.value })} placeholder="X-API-Key" />
                          </div>
                          <div className="form-group">
                            <label>Key Value</label>
                            <input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder="Enter key or infisical://dev/SECRET_NAME" />
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Add To</label>
                          <StyledSelect
                            options={[
                              { value: 'header', label: 'HTTP Header' },
                              { value: 'query', label: 'Query Parameter' }
                            ]}
                            value={{ value: form.apiKeyIn, label: form.apiKeyIn === 'header' ? 'HTTP Header' : 'Query Parameter' }}
                            onChange={(opt) => setForm({ ...form, apiKeyIn: opt?.value || 'header' })}
                            isSearchable={false}
                          />
                        </div>
                      </div>
                    )}
                    {form.authType === 'oauth2' && (
                      <div className="auth-section">
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                          OAuth 2.0 authentication. Configure OAuth provider in Settings first, then connect your account.
                        </p>
                        <button className="btn btn-primary" type="button">
                          Connect OAuth Account
                        </button>
                      </div>
                    )}
                  </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Create'} Integration</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showImportModal && (
          <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Import Integrations</h2>
                <button className="modal-close" onClick={() => { setShowImportModal(false); setImportData(null); setSelectedForImport([]); }}>&times;</button>
              </div>
              <div className="modal-body">
                {!importData ? (
                  <>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
                      Select a previously exported JSON file to import integrations.
                    </p>
                    <div className="form-group">
                      <label>Choose File</label>
                      <input type="file" accept=".json" onChange={handleImportSelect} />
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
                      Select integrations to import ({importData.integrations.length} available):
                    </p>
                    <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem' }}>
                      {importData.integrations.map((int, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedForImport.includes(idx)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedForImport([...selectedForImport, idx]);
                              } else {
                                setSelectedForImport(selectedForImport.filter(i => i !== idx));
                              }
                            }}
                          />
                          <span style={{ fontWeight: 500 }}>{int.name}</span>
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>({int.type})</span>
                          {int.tools && <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{int.tools.length} tools</span>}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-small" onClick={() => setSelectedForImport(importData.integrations.map((_, idx) => idx))}>Select All</button>
                      <button className="btn btn-secondary btn-small" onClick={() => setSelectedForImport([])}>Select None</button>
                    </div>
                  </>
                )}
              </div>
              {importData && (
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => { setImportData(null); setSelectedForImport([]); }}>Change File</button>
                  <button className="btn btn-primary" onClick={handleImport} disabled={selectedForImport.length === 0}>
                    Import {selectedForImport.length} Integration{selectedForImport.length !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showExportModal && (
          <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Export Integrations</h2>
                <button className="modal-close" onClick={() => { setShowExportModal(false); setSelectedForExport([]); }}>&times;</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
                  Select integrations to export:
                </p>
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem' }}>
                  {integrations.map(int => (
                    <div key={int._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedForExport.includes(int._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedForExport([...selectedForExport, int._id]);
                          } else {
                            setSelectedForExport(selectedForExport.filter(id => id !== int._id));
                          }
                        }}
                      />
                      <span style={{ fontWeight: 500 }}>{int.name}</span>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>({int.type})</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary btn-small" onClick={() => setSelectedForExport(integrations.map(i => i._id))}>Select All</button>
                  <button className="btn btn-secondary btn-small" onClick={() => setSelectedForExport([])}>Select None</button>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowExportModal(false); setSelectedForExport([]); }}>Cancel</button>
                <button className="btn btn-primary" onClick={() => handleExport(true)} disabled={selectedForExport.length === 0}>
                  Export {selectedForExport.length} with Tools
                </button>
                <button className="btn btn-secondary" onClick={() => handleExport(false)} disabled={selectedForExport.length === 0}>
                  Export {selectedForExport.length} without Tools
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Integrations;