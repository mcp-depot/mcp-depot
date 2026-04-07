import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getIntegrationIcon } from '../utils/integrationIcons';
import Navbar from '../components/Navbar';
import { StyledSelect } from '../components/StyledSelect';

function Tools({ all: isAllTools }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const id = params.id;
  const highlightedToolId = searchParams.get('highlighted');
  console.log('Highlighted tool ID:', highlightedToolId);
  const { user } = useAuth();
  const [allToolsData, setAllToolsData] = useState([]);
  const [integration, setIntegration] = useState(null);
  const [tools, setTools] = useState([]);
  const [externalTools, setExternalTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showExploreModal, setShowExploreModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [promptForm, setPromptForm] = useState({
    jiraTicket: '',
    confluenceSpace: '',
    confluenceTitle: '',
    jenkinsJob: 'PR-build',
    description: ''
  });
  const [selectedPromptTemplate, setSelectedPromptTemplate] = useState('full-cycle');
  const [showExternalToolsModal, setShowExternalToolsModal] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [testingTool, setTestingTool] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testParams, setTestParams] = useState({});
  const [currentToolForTest, setCurrentToolForTest] = useState(null);

  const [exploring, setExploring] = useState(false);
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);
  const [exploreError, setExploreError] = useState(null);
  const [endpointSearch, setEndpointSearch] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    method: 'GET',
    path: '',
    params: '{\n  "key": "value"\n}',
    headers: '{\n  "key": "value"\n}',
    body: ''
  });

  const [collapsedIntegrations, setCollapsedIntegrations] = useState({});

  const toggleIntegration = (id) => {
    setCollapsedIntegrations(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const allExpanded = {};
    allToolsData.forEach(({ integration }) => {
      allExpanded[integration._id] = false;
    });
    setCollapsedIntegrations(allExpanded);
  };

  const collapseAll = () => {
    const allCollapsed = {};
    allToolsData.forEach(({ integration }) => {
      allCollapsed[integration._id] = true;
    });
    setCollapsedIntegrations(allCollapsed);
  };

  useEffect(() => {
    if (isAllTools) {
      fetchAllTools();
      fetchExternalTools();
    } else if (id) {
      fetchData();
    }
  }, [id, isAllTools]);

  const fetchExternalTools = async () => {
    try {
      const res = await api.get('/mcp/tools');
      const allTools = res.data.tools || [];
      const external = allTools.filter(t => t.source === 'external');
      setExternalTools(external);
    } catch (err) {
      console.error('Failed to fetch external tools:', err);
    }
  };

  const fetchAllTools = async () => {
    try {
      const res = await api.get('/consume/integrations');
      const integrations = res.data;
      
      const toolsByIntegration = await Promise.all(
        integrations.map(async (int) => {
          try {
            const toolsRes = await api.get(`/integrations/${int._id}/tools`);
            return {
              integration: int,
              tools: toolsRes.data
            };
          } catch (e) {
            return { integration: int, tools: [] };
          }
        })
      );
      
      setAllToolsData(toolsByIntegration.filter(item => item.tools.length > 0));
    } catch (err) {
      console.error('Failed to fetch all tools:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [intRes, toolsRes] = await Promise.all([
        api.get(`/integrations/${id}`),
        api.get(`/integrations/${id}/tools`)
      ]);
      setIntegration(intRes.data);
      setTools(toolsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      alert('Failed to load: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let parsedParams, parsedHeaders, parsedBody;
      
      try {
        parsedParams = form.params ? JSON.parse(form.params) : {};
      } catch (err) {
        alert('Invalid JSON in Default Params: ' + err.message);
        return;
      }
      
      try {
        parsedHeaders = form.headers ? JSON.parse(form.headers) : {};
      } catch (err) {
        alert('Invalid JSON in Default Headers: ' + err.message);
        return;
      }
      
      try {
        const normalizedBody = (form.body || '').replace(/:\s*\{(\w+)\}/g, ': "{$1}"');
        parsedBody = normalizedBody ? JSON.parse(normalizedBody) : {};
      } catch (err) {
        alert('Invalid JSON in Request Body: ' + err.message);
        return;
      }
      
      const endpoint = {
        path: form.path,
        method: form.method,
        params: parsedParams,
        headers: parsedHeaders,
        body: parsedBody
      };

      const payload = { name: form.name, description: form.description, endpoint };

      if (editingTool) {
        const integrationId = id || editingTool.integrationId;
        await api.put(`/integrations/${integrationId}/tools/${editingTool._id}`, payload);
      } else {
        await api.post(`/integrations/${id}/tools`, payload);
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save tool');
    }
  };

  const handleEdit = (tool) => {
    const normalizedTool = { ...tool, _id: tool._id || tool.id };
    setEditingTool(normalizedTool);
    setForm({
      name: tool.name,
      description: tool.description || '',
      method: tool.endpoint.method,
      path: tool.endpoint.path,
      params: JSON.stringify(tool.endpoint.params, null, 2),
      headers: JSON.stringify(tool.endpoint.headers, null, 2),
      body: JSON.stringify(tool.endpoint.body, null, 2)
    });
    setShowModal(true);
  };

  const handleDelete = async (toolId) => {
    if (!confirm('Are you sure you want to delete this tool?')) return;
    try {
      console.log('Deleting tool:', toolId);
      await api.delete(`/integrations/${id}/tools/${toolId}`);
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete tool: ' + (err.response?.data?.error || err.message));
    }
  };

  const testTool = (tool) => {
    const toolData = tool;
    const inputSchema = toolData.inputSchema || {};
    let properties = inputSchema.properties || {};
    const required = inputSchema.required || [];
    
    if (Object.keys(properties).length === 0) {
      const pathMatch = toolData.endpoint?.path?.match(/\{([^}]+)\}/g) || [];
      const queryParams = toolData.endpoint?.params || {};
      
      properties = { ...properties };
      
      pathMatch.forEach(p => {
        const paramName = p.replace(/[{}]/g, '');
        properties[paramName] = { type: 'string', description: `Path parameter: ${paramName}` };
        if (!required.includes(paramName)) required.push(paramName);
      });
      
      Object.entries(queryParams).forEach(([key, val]) => {
        properties[key] = { type: val.type || 'string', description: val.description || key };
        if (val.required && !required.includes(key)) required.push(key);
      });
    }
    
    const initialParams = {};
    Object.keys(properties).forEach(key => {
      if (required.includes(key)) {
        initialParams[key] = '';
      }
    });
    
    setCurrentToolForTest(tool);
    setTestParams(initialParams);
    setTestResult(null);
    setShowTestModal(true);
  };

  const runTest = async () => {
    const toolId = currentToolForTest.id || currentToolForTest._id;
    
    let resolvedPath = currentToolForTest.endpoint.path;
    const pathParams = {};
    const queryParams = {};
    const bodyParams = {};
    
    let inputSchema = currentToolForTest.inputSchema || {};
    let properties = inputSchema.properties || {};
    
    if (Object.keys(properties).length === 0) {
      const pathMatch = currentToolForTest.endpoint?.path?.match(/\{([^}]+)\}/g) || [];
      const endpointParams = currentToolForTest.endpoint?.params || {};
      
      properties = { ...properties };
      
      pathMatch.forEach(p => {
        const paramName = p.replace(/[{}]/g, '');
        properties[paramName] = { type: 'string' };
      });
      
      Object.entries(endpointParams).forEach(([key, val]) => {
        properties[key] = { type: val.type || 'string' };
      });
    }
    
    for (const [key, value] of Object.entries(testParams)) {
      if (value === '') continue;
      
      if (resolvedPath.includes(`{${key}}`)) {
        pathParams[key] = value;
        resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(value));
      } else if (properties[key] && (currentToolForTest.endpoint.method === 'POST' || currentToolForTest.endpoint.method === 'PUT' || currentToolForTest.endpoint.method === 'PATCH')) {
        bodyParams[key] = value;
      } else {
        queryParams[key] = value;
      }
    }
    
    const fullUrl = (integration?.config?.baseUrl || '') + resolvedPath;
    
    const getAuthTypeLabel = (type) => {
      const labels = { none: 'None', basic: 'Basic Auth', bearer: 'Bearer Token', apiKey: 'API Key', oauth2: 'OAuth2' };
      return labels[type] || type;
    };

    const requestDetails = {
      method: currentToolForTest.endpoint.method,
      url: fullUrl,
      path: currentToolForTest.endpoint.path,
      pathParams,
      queryParams,
      bodyParams,
      headers: currentToolForTest.endpoint.headers || {},
      body: currentToolForTest.endpoint.body || null,
      auth: {
        type: getAuthTypeLabel(integration?.config?.auth?.type || 'none'),
        hasCredentials: !!(integration?.config?.auth?.credentials),
        credentialsKeys: integration?.config?.auth?.credentials ? Object.keys(integration.config.auth.credentials) : []
      }
    };
    
    setTestingTool(toolId);
    try {
      const res = await api.post(`/consume/tools/${toolId}/execute`, { params: testParams });
      setTestResult({ success: true, data: res.data, request: requestDetails });
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Tool execution failed';
      setTestResult({ success: false, error: typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, request: requestDetails });
    } finally {
      setTestingTool(null);
    }
  };

  const resetForm = () => {
    setEditingTool(null);
    setForm({ name: '', description: '', method: 'GET', path: '', params: '', headers: '', body: '' });
  };

  const handleExplore = async (e) => {
    e.preventDefault();
    setExploring(true);
    setExploreError(null);
    setDiscoveredEndpoints([]);
    setSelectedEndpoints([]);
    
    try {
      const formData = new FormData(e.target);
      const openApiPath = formData.get('openApiPath') || null;
      const specType = formData.get('specType') || 'auto';
      const specUrl = formData.get('specUrl') || null;
      
      const res = await api.post('/integrations/discover', {
        baseUrl: integration.config.baseUrl,
        openApiPath: openApiPath,
        specType: specType,
        specUrl: specUrl,
        auth: integration.config.auth
      });
      
      if (res.data.success && res.data.endpoints) {
        setDiscoveredEndpoints(res.data.endpoints);
      } else {
        setExploreError(res.data.error || 'No endpoints found');
      }
    } catch (err) {
      setExploreError(err.response?.data?.error || 'Failed to discover API');
    } finally {
      setExploring(false);
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
    const filteredEndpoints = endpointSearch 
      ? discoveredEndpoints.filter(ep => 
          ep.path.toLowerCase().includes(endpointSearch.toLowerCase()) || 
          ep.method.toLowerCase().includes(endpointSearch.toLowerCase()) ||
          (ep.operationId && ep.operationId.toLowerCase().includes(endpointSearch.toLowerCase()))
        )
      : discoveredEndpoints;
    
    if (selectedEndpoints.length === filteredEndpoints.length) {
      setSelectedEndpoints([]);
    } else {
      setSelectedEndpoints([...filteredEndpoints]);
    }
  };

  const handleImportEndpoints = async () => {
    if (selectedEndpoints.length === 0) return;
    
    try {
      await api.post(`/integrations/${id}/import-tools`, {
        endpoints: selectedEndpoints
      });
      
      setShowExploreModal(false);
      setDiscoveredEndpoints([]);
      setSelectedEndpoints([]);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import endpoints');
    }
  };

  if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;

  if (isAllTools) {
    return (
      <div>
        <Navbar />

        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h1>All Tools</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Browse tools grouped by integration</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={() => setShowPromptLibrary(true)}>
                Prompt Library
              </button>
              <button className="btn btn-secondary" onClick={() => setShowExternalToolsModal(true)}>
                External MCP {externalTools.length > 0 && `(${externalTools.length})`}
              </button>
              <button className="btn btn-secondary" onClick={expandAll}>Expand All</button>
              <button className="btn btn-secondary" onClick={collapseAll}>Collapse All</button>
            </div>
          </div>
          
          {allToolsData.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">-</div>
              <h3>No tools yet</h3>
              <p>Create tools in your integrations to get started</p>
              <Link to="/integrations" className="btn btn-primary">Go to Integrations</Link>
            </div>
          ) : (
            <div>
              {allToolsData.map(({ integration, tools }) => (
                <div key={integration._id} className="card" style={{ marginBottom: '1rem' }}>
                  <div 
                    className="card-header" 
                    onClick={() => toggleIntegration(integration._id)}
                    style={{ cursor: 'pointer', justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem', transform: collapsedIntegrations[integration._id] ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                      <span style={{ display: 'flex', alignItems: 'center' }}>{getIntegrationIcon(integration.type)}</span>
                      <h3>{integration.name}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="badge badge-primary">{tools.length} tools</span>
                    </div>
                  </div>
                  {!collapsedIntegrations[integration._id] && (
                    <div className="tool-list">
                      {tools.map(tool => (
                        <div 
                          key={tool._id} 
                          className="tool-item"
                          style={highlightedToolId === tool._id ? { 
                            background: 'var(--primary)', 
                            color: 'white',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            marginBottom: '0.5rem',
                            animation: 'pulse 1s ease-in-out 3'
                          } : {}}
                        >
                          <div style={{ flex: 1 }}>
                            <strong>{tool.name}</strong>
                            <span className={`tool-method ${tool.endpoint?.method?.toLowerCase()}`}>{tool.endpoint?.method}</span>
                            <span className="tool-path">{tool.endpoint?.path}</span>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{tool.description}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <Link to={`/integrations/${integration._id}/tools?highlighted=${tool._id}`} className="btn btn-icon">
                              View
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!integration) {
    return (
      <div>
        <Navbar />
        <div className="container">
          <p>Integration not found. ID: {id}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />

      <div className="container">
        <div className="page-header">
          <div className="breadcrumb">
            <Link to="/integrations">Integrations</Link>
            <span className="breadcrumb-separator">/</span>
            <span>{integration?.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1>{integration?.name} - Tools</h1>
              <p>{integration?.description}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowExploreModal(true)}>
                Explore API
              </button>
              <button className="btn btn-primary" onClick={() => setShowPromptLibrary(true)}>
                Prompt Library
              </button>
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                + Add Tool
              </button>
            </div>
          </div>
        </div>

        {tools.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">-</div>
            <h3>No tools yet</h3>
            <p>Create tools to define API endpoints for this integration</p>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Available Tools ({tools.length})</h3>
            </div>
            <div className="tool-list">
              {tools.map(tool => (
                <div key={tool._id} className="tool-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong>{tool.name}</strong>
                    </div>
                    <span className={`tool-method ${tool.endpoint.method.toLowerCase()}`}>{tool.endpoint.method}</span>
                    <span className="tool-path">{tool.endpoint.path}</span>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{tool.description}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <button className="btn btn-icon" onClick={() => testTool(tool)} title="Test tool" disabled={testingTool === (tool._id || tool.id)}>
                      Run
                    </button>
                    <button className="btn btn-icon" onClick={() => handleEdit(tool)} title="Edit tool">
                      Edit
                    </button>
                    <button className="btn btn-icon btn-danger" onClick={() => handleDelete(tool._id || tool.id)} title="Delete tool">
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {testResult && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">Test Result</h3>
              <button className="btn btn-ghost btn-small" onClick={() => setTestResult(null)}>Clear</button>
            </div>
            {testResult.request && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fff3cd', borderRadius: '4px', fontSize: '0.85rem' }}>
                <strong style={{ color: 'var(--warning)' }}>Request Details:</strong>
                <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Method:</strong> <span style={{ background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '3px' }}>{testResult.request.method}</span></div>
                  <div><strong>Full URL:</strong> <span style={{ wordBreak: 'break-all' }}>{testResult.request.url}</span></div>
                  <div><strong>Path Template:</strong> {testResult.request.path}</div>
                  {Object.keys(testResult.request.pathParams || {}).length > 0 && (
                    <div><strong>Path Params:</strong> {JSON.stringify(testResult.request.pathParams)}</div>
                  )}
                  {Object.keys(testResult.request.queryParams || {}).length > 0 && (
                    <div><strong>Query Params:</strong> {JSON.stringify(testResult.request.queryParams)}</div>
                  )}
                  {Object.keys(testResult.request.headers || {}).length > 0 && (
                    <div><strong>Headers:</strong> {JSON.stringify(testResult.request.headers)}</div>
                  )}
                  {testResult.request.body && (
                    <div><strong>Body:</strong> {typeof testResult.request.body === 'string' ? testResult.request.body : JSON.stringify(testResult.request.body)}</div>
                  )}
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#e8f4f8', borderRadius: '4px' }}>
                    <strong>Auth Config:</strong>
                    <div style={{ marginTop: '0.25rem' }}>Type: {testResult.request.auth?.type || 'None'}</div>
                    <div style={{ color: testResult.request.auth?.hasCredentials ? '#22c55e' : '#dc2626' }}>
                      {testResult.request.auth?.hasCredentials ? '✓ Credentials present' : '⚠ No credentials configured'}
                    </div>
                    {testResult.request.auth?.credentialsKeys?.length > 0 && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Stored keys: {testResult.request.auth.credentialsKeys.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {testResult.success ? (
              <div style={{ marginTop: '1rem' }}>
                <strong>Response:</strong>
                <pre style={{ marginTop: '0.5rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius)', overflow: 'auto', maxHeight: '300px', fontSize: '0.85rem' }}>
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="error-message" style={{ marginTop: '0.5rem' }}>{testResult.error}</div>
            )}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '650px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingTool ? 'Edit Tool' : 'Add Tool'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Tool Name</label>
                      <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Get Issues" required />
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does this tool do?" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Method</label>
                      <StyledSelect
                        options={[
                          { value: 'GET', label: 'GET' },
                          { value: 'POST', label: 'POST' },
                          { value: 'PUT', label: 'PUT' },
                          { value: 'PATCH', label: 'PATCH' },
                          { value: 'DELETE', label: 'DELETE' }
                        ]}
                        value={{ value: form.method, label: form.method }}
                        onChange={(opt) => setForm({ ...form, method: opt?.value || 'GET' })}
                        isSearchable={false}
                      />
                    </div>
                    <div className="form-group">
                      <label>Endpoint Path</label>
                      <input type="text" value={form.path} onChange={e => setForm({ ...form, path: e.target.value })} placeholder="/api/issues" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Default Params (JSON)
                      <span className="help-text" style={{fontWeight: 'normal', fontSize: '0.85em', marginLeft: 8, color: '#666'}}>
                        Schema format: {`{"jiraId": {"type": "string", "required": true, "description": "JIRA issue key"}}`}
                      </span>
                    </label>
                    <textarea value={form.params} onChange={e => setForm({ ...form, params: e.target.value })} placeholder='{"maxResults": {"type": "number", "required": false}}' />
                  </div>
                  <div className="form-group">
                    <label>Default Headers (JSON)</label>
                    <textarea value={form.headers} onChange={e => setForm({ ...form, headers: e.target.value })} placeholder='{"Accept": "application/json"}' />
                  </div>
                  {['POST', 'PUT', 'PATCH'].includes(form.method) && (
                    <div className="form-group">
                      <label>Request Body (JSON)
                        <span className="help-text" style={{fontWeight: 'normal', fontSize: '0.85em', marginLeft: 8, color: '#666'}}>
                          Use {`{paramName}`} for dynamic values. Example: {`{"transition": {"id": "{transitionId}"}}`}
                        </span>
                      </label>
                      <textarea 
                        value={form.body} 
                        onChange={e => {
                          const newBody = e.target.value;
                          const normalizedBody = newBody.replace(/:\s*\{(\w+)\}/g, ': "{$1}"');
                          const bodyVars = (normalizedBody.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1));

                          setForm(f => {
                            const next = { ...f, body: newBody };

                            if (bodyVars.length > 0) {
                              let parsedParams = {};
                              try {
                                parsedParams = f.params ? JSON.parse(f.params) : {};
                              } catch {
                                parsedParams = {};
                              }
                              let changed = false;
                              bodyVars.forEach(varName => {
                                if (!parsedParams[varName]) {
                                  parsedParams[varName] = { type: 'string', required: true, description: '' };
                                  changed = true;
                                }
                              });
                              if (changed) {
                                next.params = JSON.stringify(parsedParams, null, 2);
                              }
                            }

                            return next;
                          });
                        }} 
                        placeholder='{"transition": {"id": "{transitionId}"}}' 
                      />
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editingTool ? 'Update' : 'Create'} Tool</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Explore API Modal */}
        {showExploreModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Explore API Endpoints</h2>
                <button className="modal-close" onClick={() => setShowExploreModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                {discoveredEndpoints.length === 0 ? (
                  <form onSubmit={handleExplore}>
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '4px' }}>
                      <strong>Base URL:</strong> {integration?.config?.baseUrl}
                    </div>
                    <div className="form-group">
                      <label>Specification Type</label>
                      <select name="specType" defaultValue="auto">
                        <option value="auto">Auto-detect</option>
                        <option value="openapi">OpenAPI / Swagger</option>
                        <option value="wadl">WADL (Jira, etc.)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>External Spec URL (optional)</label>
                      <input 
                        type="url" 
                        name="specUrl"
                        placeholder="https://docs.atlassian.com/jira/REST/latest/jira-rest-plugin.wadl"
                      />
                      <small style={{ color: 'var(--text-secondary)' }}>Load spec from public docs instead of your server</small>
                    </div>
                    <div className="form-group">
                      <label>Or Spec Path (optional)</label>
                      <input 
                        type="text" 
                        name="openApiPath"
                        placeholder="/api/swagger.json or leave empty for auto-detect" 
                      />
                      <small style={{ color: 'var(--text-secondary)' }}>Relative path on your server</small>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={exploring} style={{ width: '100%' }}>
                      {exploring ? 'Discovering...' : 'Discover Endpoints'}
                    </button>
                    {exploreError && (
                      <div className="error-message" style={{ marginTop: '1rem' }}>{exploreError}</div>
                    )}
                  </form>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--success-bg, #e8f5e9)', borderRadius: '4px' }}>
                      <strong>Found {discoveredEndpoints.length} endpoints</strong>
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border)' }}>
                      <div style={{ padding: '0.5rem', background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={selectedEndpoints.length === discoveredEndpoints.length} onChange={toggleSelectAll} />
                          <strong>Select All</strong>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="text" 
                            placeholder="Search endpoints..." 
                            value={endpointSearch}
                            onChange={e => setEndpointSearch(e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', width: '180px' }}
                          />
                          <span>{selectedEndpoints.length} selected</span>
                        </div>
                      </div>
                      {(endpointSearch ? discoveredEndpoints.filter(ep => 
                        ep.path.toLowerCase().includes(endpointSearch.toLowerCase()) || 
                        ep.method.toLowerCase().includes(endpointSearch.toLowerCase()) ||
                        (ep.operationId && ep.operationId.toLowerCase().includes(endpointSearch.toLowerCase()))
                      ) : discoveredEndpoints).map((ep, idx) => (
                        <div key={idx} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {discoveredEndpoints.length > 0 && (
                  <button className="btn btn-secondary" onClick={() => { setDiscoveredEndpoints([]); setSelectedEndpoints([]); }}>
                    Back
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => { setShowExploreModal(false); setDiscoveredEndpoints([]); setSelectedEndpoints([]); setEndpointSearch(''); }}>
                  Cancel
                </button>
                {discoveredEndpoints.length > 0 && (
                  <button className="btn btn-primary" onClick={handleImportEndpoints} disabled={selectedEndpoints.length === 0}>
                    Import {selectedEndpoints.length} Tools
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Test Tool Modal */}
        {showTestModal && currentToolForTest && (
          <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Test: {currentToolForTest.name}</h2>
                <button className="modal-close" onClick={() => setShowTestModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '4px' }}>
                  <span className={`tool-method ${currentToolForTest.endpoint.method.toLowerCase()}`}>{currentToolForTest.endpoint.method}</span>
                  <span className="tool-path" style={{ marginLeft: '0.5rem', color: 'var(--text)' }}>{currentToolForTest.endpoint.path}</span>
                </div>
                {Object.keys(testParams).length > 0 ? (
                  <div>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
                      {['POST', 'PUT', 'PATCH'].includes(currentToolForTest.endpoint.method) 
                        ? 'Enter values for body parameters:' 
                        : 'Enter values for parameters:'}
                    </p>
                    {Object.keys(testParams).map(param => {
                      const inputSchema = currentToolForTest.inputSchema || {};
                      const properties = inputSchema.properties || {};
                      const required = inputSchema.required || [];
                      const isRequired = required.includes(param);
                      const paramInfo = properties[param] || {};
                      
                      return (
                        <div key={param} className="form-group">
                          <label>
                            {param}
                            {isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}
                            {paramInfo.description && <span style={{ color: 'var(--text-light)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{paramInfo.description}</span>}
                          </label>
                          <input
                            type="text"
                            value={testParams[param]}
                            onChange={e => setTestParams({ ...testParams, [param]: e.target.value })}
                            placeholder={`Enter ${param}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-light)' }}>This tool doesn't require any parameters.</p>
                )}

                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', borderLeft: '4px solid var(--success)' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>💡 How to use with AI</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                    Instead of testing manually, give this prompt to Claude:
                  </p>
                  <code style={{ display: 'block', padding: '0.5rem', background: 'var(--surface)', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text)' }} onClick={() => navigator.clipboard.writeText(`Use the ${currentToolForTest.name} tool to ${currentToolForTest.description?.toLowerCase()}`)}>
                    "Use the {currentToolForTest.name} tool to {currentToolForTest.description?.toLowerCase()}"
                  </code>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowTestModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={runTest} disabled={testingTool || Object.values(testParams).some(v => !v)} style={testingTool ? { background: 'var(--warning)', borderColor: 'var(--warning)' } : {}}>
                  {testingTool ? 'Running...' : 'Run Test'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* External Tools Modal */}
        {showExternalToolsModal && (
          <div className="modal-overlay" onClick={() => setShowExternalToolsModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
              <div className="modal-header">
                <h2>External MCP Tools</h2>
                <button className="modal-close" onClick={() => setShowExternalToolsModal(false)}>&times;</button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {externalTools.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No external MCP tools configured.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {externalTools.map((tool, idx) => (
                      <div key={idx} className="card" style={{ margin: 0 }}>
                        <div className="card-header" style={{ padding: '0.75rem 1rem' }}>
                          <div>
                            <span style={{ fontWeight: 600 }}>{tool.name}</span>
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              via {tool.externalServerName}
                            </span>
                          </div>
                        </div>
                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.9rem' }}>
                          <p style={{ marginBottom: '0.5rem' }}>{tool.description}</p>
                          {tool.inputSchema?.properties && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {Object.entries(tool.inputSchema.properties).map(([param, details]) => (
                                <span key={param} style={{ 
                                  background: '#e0e0e0', 
                                  padding: '0.2rem 0.5rem', 
                                  borderRadius: '4px',
                                  fontSize: '0.8rem'
                                }}>
                                  {param}: {details.type}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#e3f2fd', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>💡 Example Prompts for AI Assistants</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Copy these prompts and give to Claude/Cursor/OpenCode to automate tasks:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <code style={{ padding: '0.5rem', background: 'white', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText('Fetch JIRA issue PROJ-123 and show me the description')}>
                      "Fetch JIRA issue PROJ-123 and show me the description"
                    </code>
                    <code style={{ padding: '0.5rem', background: 'white', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText('Create a comment on JIRA PROJ-123 saying "Starting implementation"')}>
                      "Create a comment on JIRA PROJ-123 saying 'Starting implementation'"
                    </code>
                    <code style={{ padding: '0.5rem', background: 'white', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText('Trigger Jenkins job PR-build and wait for it to complete')}>
                      "Trigger Jenkins job PR-build and wait for it to complete"
                    </code>
                    <code style={{ padding: '0.5rem', background: 'white', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText('Implement JIRA PROJ-123, run tests, and if build is green update the ticket to Done')}>
                      "Implement JIRA PROJ-123, run tests, and if build is green update to Done"
                    </code>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowExternalToolsModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Prompt Library Modal */}
        {showPromptLibrary && (
          <div className="modal-overlay" onClick={() => setShowPromptLibrary(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
              <div className="modal-header">
                <h2>Prompt Library</h2>
                <button className="modal-close" onClick={() => setShowPromptLibrary(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                  Fill in the details below to generate a prompt you can copy and give to Claude/Cursor/OpenCode
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Select Workflow Template:</label>
                  <select 
                    value={selectedPromptTemplate} 
                    onChange={e => setSelectedPromptTemplate(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="full-cycle">Full Development Cycle (JIRA → Confluence → Jenkins → JIRA)</option>
                    <option value="jira-only">JIRA Only (fetch, comment, transition)</option>
                    <option value="jenkins-only">Jenkins Only (trigger, wait, check status)</option>
                    <option value="github-commit">GitHub Commit & Push</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gap: '1rem', padding: '1rem', background: '#f9f9f9', borderRadius: '8px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>JIRA Ticket ID *</label>
                    <input 
                      type="text" 
                      value={promptForm.jiraTicket}
                      onChange={e => setPromptForm({ ...promptForm, jiraTicket: e.target.value })}
                      placeholder="e.g., PROJ-123"
                    />
                  </div>

                  {(selectedPromptTemplate === 'full-cycle' || selectedPromptTemplate === 'jira-only') && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Initial Comment (optional)</label>
                        <input 
                          type="text" 
                          value={promptForm.description}
                          onChange={e => setPromptForm({ ...promptForm, description: e.target.value })}
                          placeholder="e.g., Starting implementation"
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Final Status (optional)</label>
                        <select 
                          value={promptForm.finalStatus}
                          onChange={e => setPromptForm({ ...promptForm, finalStatus: e.target.value })}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                        >
                          <option value="">Select status...</option>
                          <option value="Done">Done</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Code Review">Code Review</option>
                        </select>
                      </div>
                    </>
                  )}

                  {selectedPromptTemplate === 'full-cycle' && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Confluence Page URL (optional)</label>
                        <input 
                          type="text" 
                          value={promptForm.confluenceTitle}
                          onChange={e => setPromptForm({ ...promptForm, confluenceTitle: e.target.value })}
                          placeholder="https://company.atlassian.net/wiki/spaces/..."
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Jenkins Job Name</label>
                        <input 
                          type="text" 
                          value={promptForm.jenkinsJob}
                          onChange={e => setPromptForm({ ...promptForm, jenkinsJob: e.target.value })}
                          placeholder="PR-build"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Generated Prompt:</label>
                  <div style={{ position: 'relative' }}>
                    <textarea 
                      readOnly
                      value={(() => {
                        const t = promptForm.jiraTicket;
                        const j = promptForm.jenkinsJob;
                        const c = promptForm.confluenceTitle;
                        const d = promptForm.description;
                        const f = promptForm.finalStatus;
                        
                        switch (selectedPromptTemplate) {
                          case 'full-cycle':
                            return `Using MCPConnect tools, please:
1. Fetch JIRA ticket ${t || 'PROJ-123'} and show me the description
2. ${c ? `Fetch Confluence page: ${c}` : 'Skip Confluence (no page provided)'}
3. ${d ? `Add comment "${d}" to ${t || 'PROJ-123'}` : 'Start working on the implementation'}
4. After I implement the changes, trigger Jenkins job "${j || 'PR-build'}"
5. Wait for the build to complete
6. If build is SUCCESS: Post "✅ Build successful!" comment and transition to ${f || 'Done'}
7. If build is FAILURE: Get build logs, post "❌ Build failed" comment, and wait for me to fix and push again
8. Repeat steps 4-7 until build is successful (max 5 attempts)`;
                          case 'jira-only':
                            return `Using MCPConnect JIRA tools, please:
1. Fetch JIRA ticket ${t || 'PROJ-123'}
2. ${d ? `Add comment "${d}"` : 'Add a comment that work is starting'}
3. Transition to ${f || 'In Progress'}
4. After I complete the work, transition to ${f || 'Done'}`;
                          case 'jenkins-only':
                            return `Using MCPConnect Jenkins tools, please:
1. Trigger Jenkins job "${j || 'PR-build'}"
2. Poll for build status every 10 seconds
3. Report the final result (SUCCESS/FAILURE)
4. If FAILED, get the console output and report the error`;
                          case 'github-commit':
                            return `Using MCPConnect GitHub tools, please:
1. Show me the current git status
2. Stage all changes
3. Create a commit with message "Fix ${t || 'PROJ-123'}"
4. Push to remote`;
                          default:
                            return '';
                        }
                      })()}
                      style={{ width: '100%', minHeight: '200px', padding: '1rem', fontSize: '0.85rem', fontFamily: 'monospace', borderRadius: '8px', border: '1px solid #ddd' }}
                    />
                    <button 
                      className="btn btn-primary btn-small" 
                      style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
                      onClick={() => {
                        const t = promptForm.jiraTicket;
                        const j = promptForm.jenkinsJob;
                        const c = promptForm.confluenceTitle;
                        const d = promptForm.description;
                        const f = promptForm.finalStatus;
                        
                        let prompt = '';
                        switch (selectedPromptTemplate) {
                          case 'full-cycle':
                            prompt = `Using MCPConnect tools, please:
1. Fetch JIRA ticket ${t || 'PROJ-123'} and show me the description
2. ${c ? `Fetch Confluence page: ${c}` : 'Skip Confluence (no page provided)'}
3. ${d ? `Add comment "${d}" to ${t || 'PROJ-123'}` : 'Start working on the implementation'}
4. After I implement the changes, trigger Jenkins job "${j || 'PR-build'}"
5. Wait for the build to complete
6. If build is SUCCESS: Post "✅ Build successful!" comment and transition to ${f || 'Done'}
7. If build is FAILURE: Get build logs, post "❌ Build failed" comment, and wait for me to fix and push again
8. Repeat steps 4-7 until build is successful (max 5 attempts)`;
                            break;
                          case 'jira-only':
                            prompt = `Using MCPConnect JIRA tools, please:
1. Fetch JIRA ticket ${t || 'PROJ-123'}
2. ${d ? `Add comment "${d}"` : 'Add a comment that work is starting'}
3. Transition to ${f || 'In Progress'}
4. After I complete the work, transition to ${f || 'Done'}`;
                            break;
                          case 'jenkins-only':
                            prompt = `Using MCPConnect Jenkins tools, please:
1. Trigger Jenkins job "${j || 'PR-build'}"
2. Poll for build status every 10 seconds
3. Report the final result (SUCCESS/FAILURE)
4. If FAILED, get the console output and report the error`;
                            break;
                          case 'github-commit':
                            prompt = `Using MCPConnect GitHub tools, please:
1. Show me the current git status
2. Stage all changes
3. Create a commit with message "Fix ${t || 'PROJ-123'}"
4. Push to remote`;
                            break;
                        }
                        navigator.clipboard.writeText(prompt);
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowPromptLibrary(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Tools;
