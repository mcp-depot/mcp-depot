import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getIntegrationIcon, getIntegrationColor } from '../utils/integrationIcons';
import { StyledSelect } from '../components/StyledSelect';
import { IntegrationCardSkeleton } from '../components/Skeleton';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { Eye, EyeOff, Upload, Search, X, LayoutGrid, PanelLeft, List } from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';
import { Drawer } from '../components/Drawer';
import { ViewToggle } from '../components/ViewToggle';
function Integrations() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAllUrls, setShowAllUrls] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState([]);
  const [selectedForImport, setSelectedForImport] = useState([]);
  const [importData, setImportData] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const [filter, setFilter] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('integrations-view') ?? 'card'
  );
  const filterInputRef = useRef(null);
  
  const allTags = [...new Set(integrations.flatMap(i => i.tags || []).filter(Boolean))].sort();
  
  const filteredIntegrations = integrations.filter(i => 
    (!filter || 
      i.name.toLowerCase().includes(filter.toLowerCase()) || 
      i.description?.toLowerCase().includes(filter.toLowerCase()) || 
      i.type.toLowerCase().includes(filter.toLowerCase())
    ) &&
    (!selectedTag || (i.tags && i.tags.includes(selectedTag)))
  );

  // Postman Import State
  const [showPostmanImport, setShowPostmanImport] = useState(false);
  const [postmanStep, setPostmanStep] = useState(1);
  const [postmanCollection, setPostmanCollection] = useState(null);
  const [postmanEnvironment, setPostmanEnvironment] = useState(null);
  const [postmanConfig, setPostmanConfig] = useState({
    baseUrl: '', authType: 'none', token: '', username: '', password: ''
  });
  const [postmanVariables, setPostmanVariables] = useState({});
  const [postmanRequests, setPostmanRequests] = useState([]);
  const [postmanSelected, setPostmanSelected] = useState(new Set());
  const [postmanImporting, setPostmanImporting] = useState(false);

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
    bearerToken: '',
    tags: []
  });

  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    fetchIntegrations();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        filterInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
        payload = { name: form.name, description: form.description, tags: form.tags };
        
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
          } else if (form.authType === 'bearer' || form.authType === 'token' || form.authType === 'custom') {
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
        } else if (form.authType === 'bearer' || form.authType === 'token' || form.authType === 'custom') {
          config.auth.credentials = { token: form.bearerToken };
        } else if (form.authType === 'apiKey') {
          config.auth.credentials = { key: form.apiKeyName, value: form.apiKey, addTo: form.apiKeyIn };
        }

        payload = { type: form.type, name: form.name, description: form.description, config, tags: form.tags };
      }

      if (editingId) {
        await api.put(`/integrations/${editingId}`, payload);
        showSuccess('Integration updated successfully');
      } else {
        await api.post('/integrations', payload);
        showSuccess('Integration created successfully');
      }

      setShowModal(false);
      resetForm();
      fetchIntegrations();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to save integration');
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
      bearerToken: credentials.token || '',
      tags: integration.tags || []
    });
    setShowModal(true);
  };

  const isBuiltIn = (integration) => integration.metadata?.source === 'built-in';

  const handleToggleActive = async (id, currentStatus) => {
    try {
      await api.put(`/integrations/${id}`, { isActive: !currentStatus });
      fetchIntegrations();
    } catch (err) {
      console.error('Failed to toggle integration:', err);
    }
  };

  const handleToggleVisibility = async (id, currentVisibility) => {
    try {
      const newVisibility = currentVisibility === 'shared' ? 'private' : 'shared';
      await api.patch(`/integrations/${id}/visibility`, { visibility: newVisibility });
      fetchIntegrations();
    } catch (err) {
      alert('Failed to update visibility');
    }
  };

  const handleConnectShared = async (integration) => {
    const authType = integration.authType || 'none';
    
    let credentials = {};
    
    if (authType === 'basic') {
      const username = prompt('Enter username:');
      if (!username) return;
      const password = prompt('Enter password:');
      if (!password) return;
      credentials = { username, token: password };
    } else if (authType === 'bearer') {
      const token = prompt('Enter bearer token:');
      if (!token) return;
      credentials = { token };
    } else if (authType === 'apiKey') {
      const key = prompt('Enter API key name (e.g., X-API-Key):');
      if (!key) return;
      const value = prompt('Enter API key value:');
      if (!value) return;
      credentials = { key, value, addTo: 'header' };
    } else if (authType === 'oauth2') {
      alert('OAuth2 connection requires the admin to configure OAuth first.');
      return;
    }
    
    try {
      await api.patch(`/integrations/${integration._id}/credentials`, { credentials });
      fetchIntegrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save credentials');
    }
  };

  const handleDisconnectShared = async (id) => {
    if (!confirm('Are you sure you want to disconnect? Your credentials will be removed.')) return;
    
    try {
      await api.delete(`/integrations/${id}/credentials`);
      fetchIntegrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to disconnect');
    }
  };

  const handleDelete = (id) => {
    const integration = integrations.find(i => i._id === id);
    const hasTools = integration?.metadata?.toolCount > 0;
    
    let confirmMessage = 'Are you sure you want to delete this integration?';
    if (hasTools) {
      confirmMessage = `This integration has ${integration.metadata.toolCount} tool(s). Deleting will also remove all tools. Are you sure you want to proceed?`;
    }
    
    if (!confirm(confirmMessage)) return;
    
    api.delete(`/integrations/${id}`).then(() => {
      showSuccess('Integration deleted successfully');
      fetchIntegrations();
    }).catch(err => {
      showError(err.response?.data?.error || 'Failed to delete integration');
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      type: 'custom', name: '', description: '', baseUrl: '', authType: 'none',
      username: '', token: '', apiKey: '', apiKeyName: '', apiKeyIn: 'header', bearerToken: '', tags: []
    });
  };

  const addTag = (tag) => {
    if (tag && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...form.tags, tag] });
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove) => {
    setForm({ ...form, tags: form.tags.filter(t => t !== tagToRemove) });
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
      a.download = `mcp-depot-integrations-${Date.now()}.json`;
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

  // Postman Import Handlers
  const parsePostmanCollection = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      let baseUrl = '';
      let variables = {};
      
      if (data.variable) {
        for (const v of data.variable) {
          const key = v.key || v.id;
          const value = v.value || v.initialValue || '';
          if (key === 'baseUrl' || key === 'url' || key === 'host' || key === 'URL') {
            baseUrl = value || '';
          } else if (key) {
            variables[key] = value || '';
          }
        }
      }
      
      if (data.info?.server && typeof data.info.server === 'string') {
        baseUrl = data.info.server;
      }
      
      if (data.item) {
        const scanUrls = (items) => {
          for (const item of items) {
            if (item.request?.url?.raw) {
              const url = item.request.url.raw;
              const matches = url.match(/\{\{(\w+)\}\}/g);
              if (matches) {
                matches.forEach(m => {
                  const varName = m.replace(/[{}]/g, '');
                  if (!variables[varName] && varName !== 'baseUrl' && varName !== 'url') {
                    variables[varName] = '';
                  }
                });
              }
            }
            if (item.item) scanUrls(item.item);
          };
        };
        scanUrls(data.item);
      }
      
      setPostmanCollection(data);
      setPostmanConfig({ ...postmanConfig, baseUrl });
      setPostmanVariables(variables);
      
      const requests = [];
      const extractRequests = (item, path = '') => {
        if (item.request) {
          const method = item.request.method || 'GET';
          const url = item.request.url?.raw || item.request.url || '';
          requests.push({
            name: item.name,
            method,
            url,
            path: path + item.name,
            description: item.request.description || ''
          });
        }
        if (item.item) {
          for (const child of item.item) {
            extractRequests(child, path + (item.name ? item.name + ' > ' : ''));
          }
        }
      };
      
      if (data.item) {
        for (const item of data.item) {
          extractRequests(item);
        }
      }
      
      setPostmanRequests(requests);
      setPostmanSelected(new Set(requests.map((_, i) => i)));
      setPostmanStep(2);
    } catch (err) {
      alert('Invalid Postman collection file');
    }
  };

  const parsePostmanEnvironment = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const variables = { ...postmanVariables };
      if (data.values) {
        for (const v of data.values) {
          variables[v.key] = v.value;
        }
      }
      setPostmanVariables(variables);
    } catch (err) {
      alert('Invalid environment file');
    }
  };

  const resetPostmanImport = () => {
    setShowPostmanImport(false);
    setPostmanStep(1);
    setPostmanCollection(null);
    setPostmanEnvironment(null);
    setPostmanConfig({ baseUrl: '', authType: 'none', token: '', username: '', password: '' });
    setPostmanVariables({});
    setPostmanRequests([]);
    setPostmanSelected(new Set());
  };

  const substituteVariables = (text) => {
    if (!text) return text;
    let result = text;
    for (const [key, value] of Object.entries(postmanVariables)) {
      if (value) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    }
    if (postmanConfig.baseUrl) {
      result = result.replace(/\{\{baseUrl\}\}/g, postmanConfig.baseUrl);
      result = result.replace(/\{\{url\}\}/g, postmanConfig.baseUrl);
    }
    return result;
  };

  const handlePostmanImport = async () => {
    if (postmanSelected.size === 0) {
      alert('Select at least one request');
      return;
    }
    
    setPostmanImporting(true);
    try {
      const tools = postmanRequests
        .filter((_, i) => postmanSelected.has(i))
        .map(req => {
          const resolvedUrl = substituteVariables(req.url);
          return {
            name: req.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'unnamed',
            description: req.description || `${req.method} ${req.path}`,
            method: req.method,
            path: resolvedUrl,
            params: extractParamsFromUrl(resolvedUrl)
          };
        });
      
      await api.post('/integrations/postman-import', {
        name: postmanConfig.baseUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Postman Import',
        baseUrl: postmanConfig.baseUrl,
        auth: postmanConfig.authType !== 'none' ? {
          type: postmanConfig.authType,
          credentials: postmanConfig.authType === 'basic' 
            ? { username: postmanConfig.username, token: postmanConfig.password }
            : { token: postmanConfig.token }
        } : null,
        tools
      });
      
      resetPostmanImport();
      fetchIntegrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Import failed');
    } finally {
      setPostmanImporting(false);
    }
  };

  const extractParamsFromUrl = (url) => {
    const params = {};
    const match = url.match(/\{(\w+)\}/g);
    if (match) {
      match.forEach(p => {
        const name = p.replace(/[{}]/g, '');
        params[name] = { type: 'string', required: false, description: 'Path parameter' };
      });
    }
    return params;
  };

  const togglePostmanRequest = (idx) => {
    const selected = new Set(postmanSelected);
    if (selected.has(idx)) {
      selected.delete(idx);
    } else {
      selected.add(idx);
    }
    setPostmanSelected(selected);
  };

  return (
    <div>
      <div className="container">
        <div className="page-header">
          <div>
            <h1>Integrations</h1>
            <p>Connect to any third-party API</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <ViewToggle value={viewMode} onChange={(m) => {
              setViewMode(m);
              localStorage.setItem('integrations-view', m);
            }} />
            <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.25rem' }}></div>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowAllUrls(!showAllUrls)}
              title={showAllUrls ? 'Hide all URLs' : 'Show all URLs'}
            >
              {showAllUrls ? <EyeOff size={16} /> : <Eye size={16} />}
              <span style={{ marginLeft: '0.25rem' }}>{showAllUrls ? 'Hide URLs' : 'Show URLs'}</span>
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowDiscoverModal(true); }}>
              Discover API
            </button>
            <button className="btn btn-secondary" onClick={() => setShowPostmanImport(true)}>
              Import Postman
            </button>
            <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
              + Add Integration
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div className="search-input-wrap" style={{ width: '300px' }}>
            <Search size={14} className="search-icon" style={{ color: 'var(--text-dim)', position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              ref={filterInputRef}
              className="search-input"
              placeholder="Filter integrations... (\u2318K)"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
          {allTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Tags:</span>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  style={{
                    background: selectedTag === tag ? 'var(--primary)' : 'var(--bg-tertiary)',
                    color: selectedTag === tag ? 'white' : 'var(--text)',
                    border: 'none',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {tag}
                </button>
              ))}
              {selectedTag && <button onClick={() => setSelectedTag(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>}
            </div>
          )}
        </div>

        {loading ? (
          viewMode === 'compact' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-card" style={{ padding: '0.75rem' }}>
                  <div className="skeleton skeleton-title" style={{ width: '60%' }}></div>
                  <div className="skeleton skeleton-text short" style={{ marginTop: '0.5rem' }}></div>
                </div>
              ))}
            </div>
          ) : viewMode === 'list' ? (
            <div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: '1rem', padding: '0.75rem 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                  <div className="skeleton" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                  <div className="skeleton" style={{ flex: 2, height: '14px' }}></div>
                  <div className="skeleton" style={{ flex: 1, height: '14px' }}></div>
                  <div className="skeleton" style={{ flex: 1, height: '14px' }}></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <IntegrationCardSkeleton key={i} />
              ))}
            </div>
          )
        ) : filteredIntegrations.length === 0 ? (
          <EmptyState
            icon="-"
            title="No integrations found"
            description={filter ? 'Try adjusting your search filter' : 'Add your first integration or discover an API'}
            actionLabel={!filter ? 'Add Integration' : undefined}
            onAction={!filter ? () => setShowModal(true) : undefined}
          />
        ) : viewMode === 'list' ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 120px 100px 80px 80px', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--surface-hover)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              <span></span>
              <span>Name</span>
              <span>Type</span>
              <span>Status</span>
              <span>Tools</span>
              <span></span>
            </div>
            {filteredIntegrations.map((integration, i) => (
              <div key={integration._id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 120px 100px 80px 80px', gap: '0.75rem', padding: '0.5rem 0.75rem', alignItems: 'center', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>{getIntegrationIcon(integration.type)}</span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{integration.name}</span>
                  {integration.description && <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>{integration.description}</span>}
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{integration.type}</span>
                <StatusBadge status={integration.isActive ? 'active' : 'inactive'} />
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{integration.metadata?.toolCount || 0}</span>
                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                  <Link to={`/integrations/${integration._id}/tools`} className="btn btn-sm">Tools</Link>
                  {integration.isOwner && (
                    <button className="btn btn-icon" onClick={() => handleEdit(integration)} title="Edit" style={{ padding: '4px 6px', fontSize: '0.75rem' }}>Edit</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'compact' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
            {filteredIntegrations.map(integration => (
              <Link
                key={integration._id}
                to={`/integrations/${integration._id}/tools`}
                style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}>{getIntegrationIcon(integration.type)}</span>
                  <span style={{ fontWeight: 500, fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{integration.name}</span>
                  <StatusBadge status={integration.isActive ? 'active' : 'inactive'} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  <span>{integration.type}</span>
                  {integration.metadata?.toolCount > 0 && <span>{integration.metadata.toolCount} tools</span>}
                  {integration.requiresCredentials && !integration.canUse && <span style={{ color: 'var(--warning)', fontWeight: 600 }}>!</span>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid">
            {filteredIntegrations.map(integration => (
              <div key={integration._id} className="integration-card">
                <div className="integration-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center' }}>{getIntegrationIcon(integration.type)}</span>
                    <span className="integration-name">{integration.name}</span>
                    {isBuiltIn(integration) && (
                      <StatusBadge status="system" label="SYSTEM" />
                    )}
                    {integration.requiresCredentials && !integration.canUse && (
                      <span 
                        className="badge badge-warning" 
                        title={integration.isOwner ? 'Configure credentials to use this integration' : 'Connect with your credentials to use this integration'}
                        style={{ cursor: integration.isOwner ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        onClick={() => integration.isOwner ? window.location.href = `/integrations/${integration._id}/tools` : handleConnectShared(integration)}
                      >
                        {integration.isOwner ? '\u26A0\uFE0F Credentials needed' : '\u26A0\uFE0F Connect required'}
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
                    <StatusBadge status={integration.isActive ? 'active' : 'inactive'} />
                  </div>
                  {integration.visibility === 'shared' && (
                    <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>
                      {integration.sharedByName ? `Shared by ${integration.sharedByName}` : 'Shared'}
                    </span>
                  )}
                </div>
                <p className="integration-description">{integration.description}</p>
                <p className="integration-url" style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {showAllUrls ? integration.baseUrl : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                </p>
                <span className="integration-type">{integration.type}</span>
                {integration.metadata?.toolCount > 0 && (<StatusBadge status="info" label={`${integration.metadata.toolCount} tools`} />)}
                {integration.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                    {integration.tags.slice(0, 3).map(tag => (
                      <span key={tag} style={{ background: 'var(--primary)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem' }}>{tag}</span>
                    ))}
                    {integration.tags.length > 3 && <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>+{integration.tags.length - 3}</span>}
                  </div>
                )}
                <div className="integration-actions">
                  <Link to={`/integrations/${integration._id}/tools`} className="btn btn-primary btn-small">
                    Tools
                  </Link>
                  {!integration.isOwner && integration.requiresCredentials && !integration.hasUserCredentials && (
                    <button 
                      className="btn btn-secondary btn-small"
                      onClick={() => handleConnectShared(integration)}
                      title="Connect with your credentials"
                    >
                      Connect
                    </button>
                  )}
                  {!integration.isOwner && integration.requiresCredentials && integration.hasUserCredentials && (
                    <button 
                      className="btn btn-icon"
                      onClick={() => handleDisconnectShared(integration._id)}
                      title="Disconnect - remove your credentials"
                    >
                      Disconnect
                    </button>
                  )}
                  {user?.role === 'admin' && (
                    <button 
                      className={`btn btn-icon ${integration.visibility === 'shared' ? 'btn-info' : ''}`}
                      onClick={() => handleToggleVisibility(integration._id, integration.visibility)}
                      title={integration.visibility === 'shared' ? 'Make private' : 'Share with users'}
                    >
                      {integration.visibility === 'shared' ? 'Shared' : 'Share'}
                    </button>
                  )}
                  {integration.isOwner && (
                    <>
                      <button className="btn btn-icon" onClick={() => handleEdit(integration)} title="Edit integration">
                        Edit
                      </button>
                      {isBuiltIn(integration) ? (
                        <span 
                          className="btn btn-icon" 
                          title="Built-in integrations cannot be deleted \u2014 use the toggle above to disable"
                          style={{ opacity: 0.5, cursor: 'not-allowed', color: 'var(--text-dim)' }}
                        >
                          Del
                        </span>
                      ) : (
                        <button 
                          className="btn btn-icon btn-danger" 
                          onClick={() => handleDelete(integration._id)} 
                          title="Delete integration"
                        >
                          Del
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Discover API Modal */}
        {showDiscoverModal && (
          <Modal title="Discover API Endpoints" size="lg" onClose={() => { setShowDiscoverModal(false); setDiscoveredEndpoints([]); setSelectedEndpoints([]); }}
            footer={
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
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
            }
          >
            {discoveredEndpoints.length === 0 ? (
              <form onSubmit={handleDiscover}>
                <div className="form-group">
                  <label>API Base URL</label>
                  <input type="url" value={discoverForm.baseUrl} onChange={e => setDiscoverForm({ ...discoverForm, baseUrl: e.target.value })} placeholder="https://api.github.com" required />
                </div>
                <div className="form-group">
                  <label>OpenAPI Spec Path (optional)</label>
                  <input type="text" value={discoverForm.openApiPath} onChange={e => setDiscoverForm({ ...discoverForm, openApiPath: e.target.value })} placeholder="/openapi.json or leave empty for auto-detect" />
                </div>
                <div className="form-group">
                  <label>Authentication (if needed)</label>
                  <StyledSelect
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'basic', label: 'Basic Auth' },
                      { value: 'bearer', label: 'Bearer Token' },
                      { value: 'token', label: 'Token' },
                      { value: 'custom', label: 'Custom' },
                      { value: 'apiKey', label: 'API Key' },
                      { value: 'oauth2', label: 'OAuth 2.0' }
                    ]}
                    value={{ value: discoverForm.authType, label: discoverForm.authType === 'none' ? 'None' : discoverForm.authType === 'basic' ? 'Basic Auth' : discoverForm.authType === 'bearer' ? 'Bearer Token' : discoverForm.authType === 'token' ? 'Token' : discoverForm.authType === 'custom' ? 'Custom' : discoverForm.authType === 'apiKey' ? 'API Key' : discoverForm.authType }}
                    onChange={(opt) => setDiscoverForm({ ...discoverForm, authType: opt?.value || 'none' })}
                    isSearchable={false}
                  />
                </div>
                {discoverForm.authType === 'bearer' && (
                  <div className="form-group">
                    <label>Token</label>
                    <input type="password" value={discoverForm.token} onChange={e => setDiscoverForm({ ...discoverForm, token: e.target.value })} placeholder="Enter your API token or infisical://dev/SECRET_NAME" />
                  </div>
                )}
                {discoverForm.authType === 'token' && (
                  <div className="form-group">
                    <label>Token Value</label>
                    <input type="text" value={discoverForm.token} onChange={e => setDiscoverForm({ ...discoverForm, token: e.target.value })} placeholder="e.g., wlu_0hf8VaR9H00t63t0hK3EmWDj04Dmh0kzBt2V" />
                  </div>
                )}
                {discoverForm.authType === 'custom' && (
                  <div className="form-group">
                    <label>Authorization Header Value</label>
                    <input type="text" value={discoverForm.token} onChange={e => setDiscoverForm({ ...discoverForm, token: e.target.value })} placeholder="e.g., Token wlu_0hf8VaR9H00t63t0hK3EmWDj04Dmh0kzBt2V" />
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
                      <input type="checkbox" checked={selectedEndpoints.some(e => e.path === ep.path && e.method === ep.method)} onChange={() => toggleEndpoint(ep)} />
                      <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: ep.method === 'GET' ? '#28a745' : ep.method === 'POST' ? '#007bff' : ep.method === 'PUT' ? '#ffc107' : ep.method === 'DELETE' ? '#dc3545' : '#6c757d' }}>{ep.method}</span>
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
          </Modal>
        )}

        <Drawer
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingId ? 'Edit Integration' : 'Add Integration'}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" form="integration-form" className="btn btn-primary">{editingId ? 'Update' : 'Create'} Integration</button>
            </>
          }
        >
          <form id="integration-form" onSubmit={handleSubmit}>
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
                    { value: 'token', label: 'Token' },
                    { value: 'custom', label: 'Custom' },
                    { value: 'apiKey', label: 'API Key' },
                    { value: 'oauth2', label: 'OAuth 2.0' }
                  ]}
                  value={{ value: form.authType, label: form.authType === 'none' ? 'None' : form.authType === 'basic' ? 'Basic Auth' : form.authType === 'bearer' ? 'Bearer Token' : form.authType === 'token' ? 'Token' : form.authType === 'custom' ? 'Custom' : form.authType === 'apiKey' ? 'API Key' : form.authType }}
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
              {form.authType === 'token' && (
                <div className="auth-section">
                  <div className="form-group">
                    <label>Token Value</label>
                    <input type="text" value={form.bearerToken} onChange={e => setForm({ ...form, bearerToken: e.target.value })} placeholder="e.g., wlu_0hf8VaR9H00t63t0hK3EmWDj04Dmh0kzBt2V" />
                  </div>
                </div>
              )}
              {form.authType === 'custom' && (
                <div className="auth-section">
                  <div className="form-group">
                    <label>Authorization Header Value</label>
                    <input type="text" value={form.bearerToken} onChange={e => setForm({ ...form, bearerToken: e.target.value })} placeholder="e.g., Token wlu_0hf8VaR9H00t63t0hK3EmWDj04Dmh0kzBt2V" />
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
            <div className="form-group">
              <label>Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {form.tags.map(tag => (
                  <span key={tag} style={{ background: 'var(--primary)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {tag}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeTag(tag)} />
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add tag..." style={{ flex: 1 }} 
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput.trim()); } }} />
                <button type="button" className="btn btn-secondary" onClick={() => addTag(tagInput.trim())}>Add</button>
              </div>
            </div>
          </form>
        </Drawer>

        {/* Import Modal */}
        {showImportModal && (
          <Modal title="Import Integrations" onClose={() => { setShowImportModal(false); setImportData(null); setSelectedForImport([]); }}
            footer={importData ? (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setImportData(null); setSelectedForImport([]); }}>Change File</button>
                <button className="btn btn-primary" onClick={handleImport} disabled={selectedForImport.length === 0}>
                  Import {selectedForImport.length} Integration{selectedForImport.length !== 1 ? 's' : ''}
                </button>
              </div>
            ) : null}
          >
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
          </Modal>
        )}

        {/* Export Modal */}
        {showExportModal && (
          <Modal title="Export Integrations" onClose={() => { setShowExportModal(false); setSelectedForExport([]); }}
            footer={
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setShowExportModal(false); setSelectedForExport([]); }}>Cancel</button>
                <button className="btn btn-primary" onClick={() => handleExport(true)} disabled={selectedForExport.length === 0}>
                  Export {selectedForExport.length} with Tools
                </button>
                <button className="btn btn-secondary" onClick={() => handleExport(false)} disabled={selectedForExport.length === 0}>
                  Export {selectedForExport.length} without Tools
                </button>
              </div>
            }
          >
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
          </Modal>
        )}

        {/* Postman Import Modal */}
        {showPostmanImport && (
          <Modal title="Import Postman Collection" size="xl" onClose={resetPostmanImport}
            footer={
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={resetPostmanImport}>Cancel</button>
                {postmanStep > 1 && (
                  <button className="btn btn-secondary" onClick={() => setPostmanStep(postmanStep - 1)}>Back</button>
                )}
                {postmanStep < 3 && (
                  <button className="btn btn-primary" onClick={() => setPostmanStep(postmanStep + 1)} disabled={postmanStep === 1 && !postmanCollection}>
                    Next
                  </button>
                )}
                {postmanStep === 3 && (
                  <button className="btn btn-primary" onClick={handlePostmanImport} disabled={postmanSelected.size === 0 || postmanImporting}>
                    {postmanImporting ? 'Importing...' : `Import ${postmanSelected.size} Tools`}
                  </button>
                )}
              </div>
            }
          >
            {/* Steps indicator */}
            <div style={{ display: 'flex', gap: '1rem', padding: '1rem', borderBottom: '1px solid var(--border)', justifyContent: 'center' }}>
              {[1, 2, 3].map(step => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: postmanStep >= step ? 'var(--primary)' : 'var(--text-dim)' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: postmanStep >= step ? 'var(--primary)' : 'var(--surface-hover)', color: postmanStep >= step ? '#fff' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600 }}>{step}</div>
                  <span>{step === 1 ? 'Upload' : step === 2 ? 'Configure' : 'Select'}</span>
                </div>
              ))}
            </div>

            {/* Step 1: Upload */}
            {postmanStep === 1 && (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <Upload size={16} />
                    Choose Postman Collection
                    <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && parsePostmanCollection(e.target.files[0])} style={{ display: 'none' }} />
                  </label>
                </div>
                <div style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>or</div>
                <div>
                  <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <Upload size={16} />
                    Choose Environment (optional)
                    <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && parsePostmanEnvironment(e.target.files[0])} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            )}

            {/* Step 2: Configure */}
            {postmanStep === 2 && (
              <div style={{ padding: '1rem' }}>
                {Object.keys(postmanVariables).length > 0 && (
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-light)' }}>
                      Variables (from collection/environment)
                    </div>
                    {Object.entries(postmanVariables).map(([key, value]) => (
                      <div key={key} className="form-group">
                        <label>{key}</label>
                        <input type="text" value={value} onChange={(e) => setPostmanVariables({ ...postmanVariables, [key]: e.target.value })} placeholder={`Value for ${key}`} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="form-group">
                  <label>Base URL {Object.keys(postmanVariables).includes('baseUrl') && <span style={{ color: 'var(--text-dim)' }}> (overrides {{baseUrl}} variable)</span>}</label>
                  <input type="url" value={postmanConfig.baseUrl} onChange={(e) => setPostmanConfig({ ...postmanConfig, baseUrl: e.target.value })} placeholder="https://api.example.com" />
                </div>
                <div className="form-group">
                  <label>Authentication</label>
                  <StyledSelect
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'basic', label: 'Basic Auth' },
                      { value: 'bearer', label: 'Bearer Token' },
                      { value: 'token', label: 'Token (Token xyz)' },
                      { value: 'custom', label: 'Custom' },
                      { value: 'apiKey', label: 'API Key' }
                    ]}
                    value={{ value: postmanConfig.authType, label: postmanConfig.authType === 'none' ? 'None' : postmanConfig.authType }}
                    onChange={(opt) => setPostmanConfig({ ...postmanConfig, authType: opt?.value || 'none' })}
                    isSearchable={false}
                  />
                </div>
                {postmanConfig.authType === 'basic' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Username</label>
                        <input type="text" value={postmanConfig.username} onChange={(e) => setPostmanConfig({ ...postmanConfig, username: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>Password/Token</label>
                        <input type="password" value={postmanConfig.password} onChange={(e) => setPostmanConfig({ ...postmanConfig, password: e.target.value })} />
                      </div>
                    </div>
                  </>
                )}
                {['bearer', 'token', 'custom'].includes(postmanConfig.authType) && (
                  <div className="form-group">
                    <label>Token</label>
                    <input type={postmanConfig.authType === 'bearer' ? 'password' : 'text'} value={postmanConfig.token} onChange={(e) => setPostmanConfig({ ...postmanConfig, token: e.target.value })} placeholder={postmanConfig.authType === 'token' ? 'e.g., wlu_xxx' : postmanConfig.authType === 'custom' ? 'e.g., Token wlu_xxx' : 'Enter token'} />
                  </div>
                )}
                {postmanConfig.authType === 'apiKey' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Key Name</label>
                      <input type="text" value={postmanConfig.username} onChange={(e) => setPostmanConfig({ ...postmanConfig, username: e.target.value })} placeholder="X-API-Key" />
                    </div>
                    <div className="form-group">
                      <label>Key Value</label>
                      <input type="password" value={postmanConfig.password} onChange={(e) => setPostmanConfig({ ...postmanConfig, password: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Select Requests */}
            {postmanStep === 3 && (
              <div>
                <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{postmanRequests.length} requests found</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-small btn-secondary" onClick={() => setPostmanSelected(new Set(postmanRequests.map((_, i) => i)))}>Select All</button>
                    <button className="btn btn-small btn-secondary" onClick={() => setPostmanSelected(new Set())}>Select None</button>
                  </div>
                </div>
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px' }}>
                  {postmanRequests.map((req, idx) => (
                    <div key={idx} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: postmanSelected.has(idx) ? 'var(--surface-hover)' : 'transparent' }}>
                      <input type="checkbox" checked={postmanSelected.has(idx)} onChange={() => togglePostmanRequest(idx)} />
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: '60px', color: req.method === 'GET' ? 'var(--success)' : req.method === 'POST' ? 'var(--warning)' : req.method === 'DELETE' ? 'var(--danger)' : 'var(--primary)' }}>{req.method}</span>
                      <span style={{ fontSize: '0.85rem', flex: 1 }}>{req.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{req.url}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Modal>
        )}
      </div>
    </div>
  );
}

export default Integrations;
