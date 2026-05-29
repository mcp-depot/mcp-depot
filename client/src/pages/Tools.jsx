import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getIntegrationIcon } from '../utils/integrationIcons';
import { StyledSelect } from '../components/StyledSelect';
import { JsonTree } from '../components/JsonTree';
import { Zap, Search, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, PanelLeft, List, Save, X } from 'lucide-react';
import { ViewToggle } from '../components/ViewToggle';

const CREDENTIAL_PATTERN = /(?:api[_-]?key|token|secret|password|bearer|auth)["\s]*[:=]["\s]*[a-zA-Z0-9_\-\.]{16,}/i;

function hasHardcodedCredential(text) {
  if (!text) return false;
  return CREDENTIAL_PATTERN.test(text);
}

const isBuiltIn = (integration) => integration?.metadata?.source === 'built-in';

function Tools({ all: isAllTools }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = params.id;
  const highlightedToolId = searchParams.get('highlighted');
  const showResponse = searchParams.get('response');
  const { user } = useAuth();
  const [allToolsData, setAllToolsData] = useState([]);
  const [integration, setIntegration] = useState(null);
  const [tools, setTools] = useState([]);
  const [compositeTools, setCompositeTools] = useState([]);
  const [externalTools, setExternalTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('tools-view') ?? 'card'
  );
  const filterInputRef = useRef(null);
  const filteredToolsData = allToolsData
    .filter(({ integration, tools }) => {
      if (filter === '') return true;
      const lowerFilter = filter.toLowerCase();
      if (integration.name.toLowerCase().includes(lowerFilter)) return true;
      return tools.some(t => t.name.toLowerCase().includes(lowerFilter) || t.description?.toLowerCase().includes(lowerFilter));
    })
    .map(({ integration, tools }) => ({
      integration,
      tools: [...tools].sort((a, b) => {
        let aVal = sortBy === 'name' ? a.name : a.createdAt || '';
        let bVal = sortBy === 'name' ? b.name : b.createdAt || '';
        if (sortOrder === 'asc') {
          return String(aVal).localeCompare(String(bVal));
        }
        return String(bVal).localeCompare(String(aVal));
      })
    }));
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
  const [selectedResponseFields, setSelectedResponseFields] = useState(new Set());
  const [savingFields, setSavingFields] = useState(false);

  const [exploring, setExploring] = useState(false);
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);
  const [exploreError, setExploreError] = useState(null);
  const [endpointSearch, setEndpointSearch] = useState('');
  const [selectedTools, setSelectedTools] = useState(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    method: 'GET',
    path: '',
    params: '{\n  "key": "value"\n}',
    headers: '{\n  "key": "value"\n}',
    body: '',
    responseTransformer: '',
    responseFields: ''
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
      setTools(toolsRes.data.filter(t => t.type !== 'composite'));
      
      const compositeRes = await api.get(`/integrations/composite`, {
        params: { integrationId: id }
      }).catch(() => ({ data: [] }));
      setCompositeTools(compositeRes.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      alert('Failed to load: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchCompositeTools = async () => {
    try {
      const toolsRes = await api.get(`/integrations/${id}/tools`);
      setCompositeTools(toolsRes.data.filter(t => t.type === 'composite'));
    } catch (err) {
      console.error('Failed to fetch composite tools:', err);
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

      let parsedResponseFields = null;
      if (form.responseFields && form.responseFields.trim()) {
        try {
          parsedResponseFields = JSON.parse(form.responseFields);
          if (!Array.isArray(parsedResponseFields)) throw new Error('Must be an array');
        } catch (err) {
          parsedResponseFields = form.responseFields.split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      const payload = {
        name: form.name,
        description: form.description,
        endpoint,
        responseTransformer: form.responseTransformer || null,
        responseFields: parsedResponseFields
      };

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
      body: JSON.stringify(tool.endpoint.body, null, 2),
      responseTransformer: tool.endpoint.responseTransformer || tool.responseTransformer || '',
      responseFields: tool.responseFields ? JSON.stringify(tool.responseFields, null, 2) : ''
    });
    setShowModal(true);
  };

  const handleDelete = async (toolId) => {
    if (!confirm('Are you sure you want to delete this tool?')) return;
    try {
      await api.delete(`/integrations/${id}/tools/${toolId}`);
      fetchData();
    } catch (err) {
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
    setSelectedResponseFields(new Set(tool.responseFields || []));
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
    
    const existingFields = currentToolForTest.responseFields || [];
    setSelectedResponseFields(new Set(existingFields));

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
      const res = await api.post(`/consume/tools/${toolId}/execute`, { params: testParams }, { headers: { 'X-Caller': 'ui' } });
      setTestResult({ success: true, data: res.data, request: requestDetails });
      setShowTestModal(false);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Tool execution failed';
      setTestResult({ success: false, error: typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, request: requestDetails });
      setShowTestModal(false);
    } finally {
      setTestingTool(null);
    }
  };

  const saveResponseFields = async () => {
    if (!currentToolForTest || selectedResponseFields.size === 0) return;
    const toolId = currentToolForTest.id || currentToolForTest._id;
    const integrationId = id || currentToolForTest.integrationId;
    setSavingFields(true);
    try {
      const fields = [...selectedResponseFields];
      await api.put(`/integrations/${integrationId}/tools/${toolId}`, { responseFields: fields });
      if (currentToolForTest.responseFields) {
        currentToolForTest.responseFields = fields;
      } else {
        currentToolForTest.responseFields = fields;
      }
    } catch (err) {
      alert('Failed to save response fields: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingFields(false);
    }
  };

  const resetForm = () => {
    setEditingTool(null);
    setForm({ name: '', description: '', method: 'GET', path: '', params: '', headers: '', body: '', responseTransformer: '', responseFields: '' });
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

  const toggleToolSelect = (toolId) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const toggleAllToolsSelect = (tools) => {
    if (selectedTools.size === tools.length) {
      setSelectedTools(new Set());
    } else {
      setSelectedTools(new Set(tools.map(t => t._id || t.id)));
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedTools.size === 0) return;
    if (!confirm(`Are you sure you want to ${action} ${selectedTools.size} tool(s)?`)) return;
    
    try {
      await api.patch(`/integrations/${id}/tools/bulk`, { ids: [...selectedTools], action });
      setSelectedTools(new Set());
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${action} tools`);
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

  if (isAllTools) {
    return (
      <div>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h1>All Tools</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Browse tools grouped by integration</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <ViewToggle value={viewMode} onChange={(m) => {
                setViewMode(m);
                localStorage.setItem('tools-view', m);
              }} />
              <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.25rem' }}></div>
              <button className="btn btn-primary" disabled={loading} onClick={() => setShowPromptLibrary(true)}>
                Prompt Library
              </button>
              <button className="btn btn-secondary" disabled={loading} onClick={() => setShowExternalToolsModal(true)}>
                External MCP {externalTools.length > 0 && `(${externalTools.length})`}
              </button>
              <button className="btn btn-secondary" disabled={loading} onClick={expandAll}>Expand All</button>
              <button className="btn btn-secondary" disabled={loading} onClick={collapseAll}>Collapse All</button>
            </div>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <div className="search-input-wrap" style={{ maxWidth: '400px' }}>
              <Search size={14} className="search-icon" style={{ color: 'var(--text-dim)', position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                ref={filterInputRef}
                className="search-input"
                placeholder="Filter tools... (⌘K)"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                disabled={loading}
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center', marginRight: '0.5rem' }}>Sort by:</span>
              <button
                className={`btn btn-small ${sortBy === 'name' ? 'btn-primary' : ''}`}
                onClick={() => { setSortBy('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                disabled={loading}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              >
                Name {sortBy === 'name' ? (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}
              </button>
            </div>
          </div>

          {loading ? (
            viewMode === 'compact' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton-card" style={{ padding: '0.75rem' }}>
                    <div className="skeleton skeleton-title" style={{ width: '60%' }}></div>
                    <div className="skeleton skeleton-text short"></div>
                  </div>
                ))}
              </div>
            ) : viewMode === 'list' ? (
              <div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: '1rem', padding: '0.75rem 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                    <div className="skeleton" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                    <div className="skeleton" style={{ flex: 2, height: '14px' }}></div>
                    <div className="skeleton" style={{ flex: 1, height: '14px' }}></div>
                    <div className="skeleton" style={{ flex: 1, height: '14px' }}></div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                    <div className="skeleton skeleton-title"></div>
                    <div className="skeleton skeleton-text"></div>
                    <div className="skeleton skeleton-text short"></div>
                  </div>
                ))}
              </div>
            )
          ) : allToolsData.length === 0 ? (
            <div className="empty-state-dashed">
              <div className="empty-icon" style={{ fontSize: '48px' }}>-</div>
              <h3>No tools yet</h3>
              <p>Create tools in your integrations to get started</p>
              <Link to="/integrations" className="btn btn-primary">Go to Integrations</Link>
            </div>
          ) : filteredToolsData.length === 0 ? (
            <div className="empty-state-dashed">
              <div className="empty-icon" style={{ fontSize: '48px' }}>🔍</div>
              <h3>No tools match your filter</h3>
              <p>Try adjusting your search query</p>
            </div>
          ) : viewMode === 'list' ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 100px 1fr 80px', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--surface-hover)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                <span>Name</span>
                <span>Integration</span>
                <span>Method</span>
                <span>Path</span>
                <span></span>
              </div>
              {filteredToolsData.flatMap(({ integration, tools }) =>
                tools.map(tool => (
                  <div key={tool._id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 100px 1fr 80px', gap: '0.75rem', padding: '0.5rem 0.75rem', alignItems: 'center', borderTop: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span style={{ flexShrink: 0 }}>{getIntegrationIcon(integration.type)}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{integration.name}</span>
                    </span>
                    <span className={`tool-method ${tool.endpoint?.method?.toLowerCase()}`} style={{ fontSize: '0.75rem', justifySelf: 'start' }}>{tool.endpoint?.method}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.endpoint?.path}</span>
                    <Link to={`/integrations/${integration._id}/tools?highlighted=${tool._id}`} className="btn btn-icon" style={{ justifySelf: 'end', padding: '4px 8px', fontSize: '0.75rem' }}>View</Link>
                  </div>
                ))
              )}
            </div>
          ) : viewMode === 'compact' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
              {filteredToolsData.map(({ integration, tools }) => (
                <div key={integration._id} className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header" style={{ padding: '0.6rem 0.75rem', cursor: 'pointer' }} onClick={() => toggleIntegration(integration._id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem', transform: collapsedIntegrations[integration._id] ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                      <span style={{ display: 'flex', alignItems: 'center' }}>{getIntegrationIcon(integration.type)}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{integration.name}</span>
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{tools.length}</span>
                    </div>
                  </div>
                  {!collapsedIntegrations[integration._id] && (
                    <div style={{ padding: '0 0.75rem 0.75rem' }}>
                      {tools.slice(0, 5).map(tool => (
                        <div key={tool._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.name}</span>
                            <span className={`tool-method ${tool.endpoint?.method?.toLowerCase()}`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>{tool.endpoint?.method}</span>
                          </div>
                          <Link to={`/integrations/${integration._id}/tools?highlighted=${tool._id}`} className="btn btn-icon" style={{ padding: '2px 6px', fontSize: '0.75rem', flexShrink: 0 }}>View</Link>
                        </div>
                      ))}
                      {tools.length > 5 && (
                        <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                          +{tools.length - 5} more tools
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>
              {filteredToolsData.map(({ integration, tools }) => (
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
                      {showBulkActions && (
                        <input 
                          type="checkbox" 
                          checked={selectedTools.size === tools.length && tools.length > 0}
                          onChange={() => toggleAllToolsSelect(tools)}
                          title="Select all"
                        />
                      )}
                      <button 
                        className="btn btn-sm" 
                        onClick={() => setShowBulkActions(!showBulkActions)}
                        title="Bulk actions"
                      >
                        ☑ {selectedTools.size > 0 ? `(${selectedTools.size})` : ''}
                      </button>
                      <span className="badge badge-primary">{tools.length} tools</span>
                    </div>
                  </div>
                  {!collapsedIntegrations[integration._id] && (
                    <div className="tool-list">
                      {showBulkActions && selectedTools.size > 0 && (
                        <div className="bulk-action-bar" style={{ padding: '0.75rem', marginBottom: '0.5rem', background: 'var(--primary)', borderRadius: '8px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ color: 'white' }}>{selectedTools.size} selected</span>
                          <button className="btn btn-sm" style={{ background: '#28a745' }} onClick={() => handleBulkAction('enable')}>Enable</button>
                          <button className="btn btn-sm" style={{ background: '#ffc107', color: 'black' }} onClick={() => handleBulkAction('disable')}>Disable</button>
                          <button className="btn btn-sm" style={{ background: '#dc3545' }} onClick={() => handleBulkAction('delete')}>Delete</button>
                        </div>
                      )}
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
                          {showBulkActions && (
                            <input 
                              type="checkbox" 
                              checked={selectedTools.has(tool._id)} 
                              onChange={() => toggleToolSelect(tool._id)}
                              style={{ marginRight: '0.5rem' }}
                            />
                          )}
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

  if (loading) {
    return (
      <div>
        <div className="container">
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
              <Link to="/integrations" style={{ color: 'var(--primary)' }}>Integrations</Link>
              <span>/</span>
              <span>...</span>
              <span>/</span>
              <span style={{ color: 'var(--text)' }}>Tools</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <p>Loading integration...</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn btn-secondary" disabled>Explore API</button>
                <button className="btn btn-primary" disabled>Prompt Library</button>
                <button className="btn btn-primary" disabled>+ Add Tool</button>
              </div>
            </div>
          </div>
          <div className="card">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ padding: '1rem', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <div className="skeleton skeleton-title"></div>
                <div className="skeleton skeleton-text" style={{ marginTop: '0.5rem' }}></div>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="skeleton skeleton-title"></div>
            <div className="skeleton skeleton-text" style={{ marginTop: '0.5rem' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (!integration) {
    return (
      <div>
        <div className="container">
          <p>Integration not found. ID: {id}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="container">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
            <Link to="/integrations" style={{ color: 'var(--primary)' }}>Integrations</Link>
            <span>/</span>
            <span>{integration?.name}</span>
            <span>/</span>
            <span style={{ color: 'var(--text)' }}>Tools</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p>{integration?.description}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setShowExploreModal(true)}>
                Explore API
              </button>
              <button className="btn btn-primary" onClick={() => setShowPromptLibrary(true)}>
                Prompt Library
              </button>
              {isBuiltIn(integration) ? (
                <span
                  className="btn btn-primary"
                  title="Built-in tools are managed by MCP Depot and cannot be edited"
                  style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }}
                >
                  + Add Tool
                </span>
              ) : (
                <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                  + Add Tool
                </button>
              )}
            </div>
          </div>
        </div>

        {isBuiltIn(integration) && (
          <div className="card" style={{ marginBottom: '1rem', background: 'var(--surface-hover)', border: '1px solid var(--border-light)' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Built-in tools are managed by MCP Depot and cannot be edited.
              To add your own tools,{' '}
              <Link to="/integrations" style={{ color: 'var(--primary)', fontWeight: 500 }}>
                Create a new integration →
              </Link>
            </p>
          </div>
        )}

        {tools.length === 0 ? (
          <div className="empty-state-dashed">
            <div className="empty-icon" style={{ fontSize: '48px' }}>-</div>
            <h3>No tools yet</h3>
            <p>Create tools to define API endpoints for this integration</p>
          </div>
        ) : (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title">Available Tools ({tools.length})</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {showBulkActions && (
                  <input 
                    type="checkbox" 
                    checked={selectedTools.size === tools.length && tools.length > 0}
                    onChange={() => toggleAllToolsSelect(tools)}
                    title="Select all"
                  />
                )}
                <button 
                  className="btn btn-sm" 
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  title="Bulk actions"
                >
                  ☑ {selectedTools.size > 0 ? `(${selectedTools.size})` : ''}
                </button>
              </div>
            </div>
            {showBulkActions && selectedTools.size > 0 && (
              <div style={{ padding: '0.75rem', marginBottom: '0.5rem', background: 'var(--primary)', borderRadius: '8px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: 'white' }}>{selectedTools.size} selected</span>
                <button className="btn btn-sm" style={{ background: '#28a745' }} onClick={() => handleBulkAction('enable')}>Enable</button>
                <button className="btn btn-sm" style={{ background: '#ffc107', color: 'black' }} onClick={() => handleBulkAction('disable')}>Disable</button>
                <button className="btn btn-sm" style={{ background: '#dc3545' }} onClick={() => handleBulkAction('delete')}>Delete</button>
              </div>
            )}
            <div className="tool-list">
              {tools.map(tool => (
                <div key={tool._id} className="tool-item" style={{ display: 'flex', alignItems: 'center' }}>
                  {showBulkActions && (
                    <input 
                      type="checkbox" 
                      checked={selectedTools.has(tool._id)} 
                      onChange={() => toggleToolSelect(tool._id)}
                      style={{ marginRight: '0.5rem' }}
                    />
                  )}
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

        <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Zap size={18} style={{ color: 'var(--primary)' }} />
                Composite Tools ({compositeTools.length})
              </h3>
              <Link to={`/composite-tool/new?integrationId=${id}`} className="btn btn-primary">
                + New Composite Tool
              </Link>
            </div>
            {compositeTools.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                <Zap size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                <p>No composite tools yet</p>
                <p style={{ fontSize: '0.85rem' }}>Chain multiple tools together for complex operations</p>
              </div>
            ) : (
              <div className="tool-list">
                {compositeTools.map(tool => (
                  <div key={tool._id || tool.id} className="tool-item" style={{ display: 'flex', alignItems: 'center' }}>
                    <Zap size={18} style={{ color: 'var(--primary)', marginRight: '0.75rem' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <strong>{tool.name}</strong>
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          padding: '2px 6px', 
                          background: 'var(--primary)', 
                          color: 'white', 
                          borderRadius: '4px', 
                          fontSize: '0.7rem' 
                        }}>
                          {tool.steps?.length || 0} steps
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{tool.description}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <Link to={`/composite-tool/${tool._id || tool.id}`} className="btn btn-icon">
                        Edit
                      </Link>
                      <button className="btn btn-icon btn-danger" onClick={async () => {
                        if (!confirm('Delete this composite tool?')) return;
                        try {
                          await api.delete(`/integrations/composite/${tool._id || tool.id}`);
                          fetchCompositeTools();
                        } catch (err) {
                          alert('Failed to delete: ' + (err.response?.data?.error || err.message));
                        }
                      }}>
                        Del
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        {testResult && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">Test Result</h3>
              <button className="btn btn-ghost btn-small" onClick={() => { setTestResult(null); navigate('?'); }}>Clear</button>
            </div>
            {testResult.request && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--warning-bg)', borderRadius: '4px', fontSize: '0.85rem' }}>
                <strong style={{ color: 'var(--warning)' }}>Request Details:</strong>
                <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Method:</strong> <span style={{ background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '3px' }}>{testResult.request.method}</span></div>
                  <div><strong>URL:</strong> <span style={{ wordBreak: 'break-all' }}>{testResult.request.path}</span></div>
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
                </div>
              </div>
            )}
            {testResult.success ? (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <strong>Response:</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    (click leaf values to add to response fields)
                  </span>
                </div>
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius)', overflow: 'auto', maxHeight: '350px', fontSize: '0.85rem' }}>
                  <JsonTree
                    data={testResult.data}
                    selectedFields={selectedResponseFields}
                    onFieldSelect={(path) => setSelectedResponseFields(prev => new Set([...prev, path]))}
                    onFieldDeselect={(path) => {
                      const next = new Set(selectedResponseFields);
                      next.delete(path);
                      setSelectedResponseFields(next);
                    }}
                  />
                </div>
                {selectedResponseFields.size > 0 && (
                  <div className="response-fields-area">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                      {[...selectedResponseFields].sort().map(field => (
                        <span key={field} className="response-field-chip">
                          {field}
                          <button
                            className="remove-field"
                            onClick={() => {
                              const next = new Set(selectedResponseFields);
                              next.delete(field);
                              setSelectedResponseFields(next);
                            }}
                          >&times;</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary btn-small" onClick={saveResponseFields} disabled={savingFields}>
                        <Save size={14} style={{ marginRight: '0.3rem' }} />
                        {savingFields ? 'Saving...' : 'Save Response Fields'}
                      </button>
                      <button className="btn btn-ghost btn-small" onClick={() => setSelectedResponseFields(new Set())}>
                        Clear All
                      </button>
                    </div>
                  </div>
                )}
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
                    {hasHardcodedCredential(form.params) && (
                      <div style={{ color: '#dc3545', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        ⚠ This field appears to contain a credential. Values in Default Params are visible to the AI. Use Integration auth settings to store credentials securely.
                      </div>
                    )}
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
                      {hasHardcodedCredential(form.body) && (
                        <div style={{ color: '#dc3545', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          ⚠ This field appears to contain a credential. Values in the body template are visible to the AI. Use Integration auth settings to store credentials securely.
                        </div>
                      )}
                    </div>
                  )}
                  <div className="form-group">
                    <label>Response Transformer
                      <span className="help-text" style={{fontWeight: 'normal', fontSize: '0.85em', marginLeft: 8, color: '#666'}}>
                        Post-processing applied after field filtering
                      </span>
                    </label>
                    <StyledSelect
                      options={[
                        { value: '', label: 'None' },
                        { value: 'stripNulls', label: 'stripNulls — Remove all null/undefined values' },
                        { value: 'flattenSingle', label: 'flattenSingle — Unwrap single-key objects' },
                        { value: 'snakeToTitle', label: 'snakeToTitle — Convert keys to Title Case' },
                        { value: 'truncateStrings', label: 'truncateStrings — Truncate long strings (500 chars)' },
                        { value: 'addTimestamp', label: 'addTimestamp — Prepend _fetchedAt to response' }
                      ]}
                      value={{ value: form.responseTransformer || '', label: form.responseTransformer ? form.responseTransformer : 'None' }}
                      onChange={(opt) => setForm({ ...form, responseTransformer: opt?.value || '' })}
                      isSearchable={false}
                    />
                  </div>
                  <div className="form-group">
                    <label>Response Fields
                      <span className="help-text" style={{fontWeight: 'normal', fontSize: '0.85em', marginLeft: 8, color: '#666'}}>
                        JSON array of dot-notation paths or comma-separated (e.g. issues.fields.summary)
                      </span>
                    </label>
                    <textarea
                      value={form.responseFields}
                      onChange={e => setForm({ ...form, responseFields: e.target.value })}
                      placeholder='["issues.fields.summary", "meta.total"]'
                      style={{ minHeight: '60px' }}
                    />
                  </div>
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
                                  background: 'var(--surface-hover)', 
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
                
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--primary-bg)', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
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

                <div style={{ display: 'grid', gap: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px' }}>
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
                            return `Using MCP Depot tools, please:
1. Fetch JIRA ticket ${t || 'PROJ-123'} and show me the description
2. ${c ? `Fetch Confluence page: ${c}` : 'Skip Confluence (no page provided)'}
3. ${d ? `Add comment "${d}" to ${t || 'PROJ-123'}` : 'Start working on the implementation'}
4. After I implement the changes, trigger Jenkins job "${j || 'PR-build'}"
5. Wait for the build to complete
6. If build is SUCCESS: Post "✅ Build successful!" comment and transition to ${f || 'Done'}
7. If build is FAILURE: Get build logs, post "❌ Build failed" comment, and wait for me to fix and push again
8. Repeat steps 4-7 until build is successful (max 5 attempts)`;
                          case 'jira-only':
                            return `Using MCP Depot JIRA tools, please:
1. Fetch JIRA ticket ${t || 'PROJ-123'}
2. ${d ? `Add comment "${d}"` : 'Add a comment that work is starting'}
3. Transition to ${f || 'In Progress'}
4. After I complete the work, transition to ${f || 'Done'}`;
                          case 'jenkins-only':
                            return `Using MCP Depot Jenkins tools, please:
1. Trigger Jenkins job "${j || 'PR-build'}"
2. Poll for build status every 10 seconds
3. Report the final result (SUCCESS/FAILURE)
4. If FAILED, get the console output and report the error`;
                          case 'github-commit':
                            return `Using MCP Depot GitHub tools, please:
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
                            prompt = `Using MCP Depot tools, please:
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
                            prompt = `Using MCP Depot JIRA tools, please:
1. Fetch JIRA ticket ${t || 'PROJ-123'}
2. ${d ? `Add comment "${d}"` : 'Add a comment that work is starting'}
3. Transition to ${f || 'In Progress'}
4. After I complete the work, transition to ${f || 'Done'}`;
                            break;
                          case 'jenkins-only':
                            prompt = `Using MCP Depot Jenkins tools, please:
1. Trigger Jenkins job "${j || 'PR-build'}"
2. Poll for build status every 10 seconds
3. Report the final result (SUCCESS/FAILURE)
4. If FAILED, get the console output and report the error`;
                            break;
                          case 'github-commit':
                            prompt = `Using MCP Depot GitHub tools, please:
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
