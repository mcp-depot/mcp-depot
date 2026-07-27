import { useState, useEffect, useId } from 'react';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { StyledSelect } from '../components/StyledSelect';
import { Modal } from '../components/Modal';
import { showSuccess } from '../utils/toast';
import { useModalA11y } from '../hooks/useModalA11y';

function Monitoring() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [limit, setLimit] = useState({ value: 15, label: '15' });
  const [filters, setFilters] = useState({ success: '', callerType: '' });
  const [endpoints, setEndpoints] = useState(null);
  const [endpointsLoading, setEndpointsLoading] = useState(false);
  const [showEndpoints, setShowEndpoints] = useState(false);
  const [expandedCall, setExpandedCall] = useState(null);
  const [replaying, setReplaying] = useState(null);
  const [liveMode, setLiveMode] = useState(false);
  const [testerModal, setTesterModal] = useState({ open: false, call: null, params: {}, result: null, testing: false });
  const [replayResult, setReplayResult] = useState(null);
  const testerTitleId = useId();
  const closeTesterModal = () => setTesterModal({ open: false, call: null, params: {}, result: null, testing: false });
  const testerModalRef = useModalA11y(closeTesterModal, testerModal.open);

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [pagination.page, filters, limit]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/monitoring/stats');
      setStats(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        window.location.href = '/login';
        return;
      }
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('limit', limit.value);
      if (filters.success) params.append('success', filters.success);
      if (filters.callerType) params.append('callerType', filters.callerType);
      
      const res = await api.get(`/monitoring/history?${params}`);
      setHistory(res.data.calls);
      setPagination(res.data.pagination);
    } catch (err) {
      if (err.response?.status === 401) {
        window.location.href = '/login';
        return;
      }
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPagination({ ...pagination, page: 1 });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatTime = (ms) => {
    if (!ms) return '-';
    return `${ms}ms`;
  };

  const handleReplay = async (callId) => {
    setReplaying(callId);
    try {
      const res = await api.post(`/monitoring/replay/${callId}`);
      setReplayResult({ data: res.data, error: null });
    } catch (err) {
      setReplayResult({ data: null, error: err.response?.data?.error || err.message });
    } finally {
      setReplaying(null);
    }
  };

  const openTester = (call) => {
    const params = {};
    if (call.queryParams) {
      Object.entries(call.queryParams).forEach(([k, v]) => { params[k] = typeof v === 'object' ? JSON.stringify(v) : String(v); });
    }
    if (call.requestBody) {
      Object.entries(call.requestBody).forEach(([k, v]) => { params[k] = typeof v === 'object' ? JSON.stringify(v) : String(v); });
    }
    setTesterModal({ open: true, call, params, result: null, testing: false });
  };

  const runTest = async () => {
    setTesterModal(m => ({ ...m, testing: true, result: null }));
    try {
      let parsedParams = {};
      Object.entries(testerModal.params).forEach(([k, v]) => {
        try { parsedParams[k] = JSON.parse(v); } catch { parsedParams[k] = v; }
      });
      const res = await api.post(`/mcp/execute`, {
        toolName: testerModal.call.toolName,
        params: parsedParams
      });
      setTesterModal(m => ({ ...m, testing: false, result: res.data }));
    } catch (err) {
      setTesterModal(m => ({ ...m, testing: false, result: { error: err.response?.data?.error || err.message } }));
    }
  };

  const fetchEndpoints = async () => {
    if (endpoints) return;
    setEndpointsLoading(true);
    try {
      const res = await api.get('/mcp/endpoints');
      setEndpoints(res.data);
    } catch (err) {
      console.error('Failed to fetch endpoints:', err);
    } finally {
      setEndpointsLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard!');
  };

  return (
    <div>
      <div className="container" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Monitoring</h1>
          {activeTab === 'overview' && (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!showEndpoints) {
                  fetchEndpoints();
                }
                setShowEndpoints(!showEndpoints);
              }}
            >
              {showEndpoints ? 'Hide' : 'Show'} API Endpoints
            </button>
          )}
        </div>

        <div className="tabs" style={{ marginBottom: '1.5rem', gap: '0.5rem' }}>
          <div className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
            Overview
          </div>
          <div className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
            Audit Log
          </div>
        </div>

        {activeTab === 'audit' && <AuditLogTab />}

        {activeTab === 'overview' && (<>
        {showEndpoints && endpoints && endpoints.endpoints && (
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>{String(endpoints.name)} v{String(endpoints.version)}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{String(endpoints.description)}</p>
            
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface)', borderRadius: '6px' }}>
              <strong>Base URL:</strong> <code style={{ background: 'var(--surface-hover)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{String(endpoints.baseUrl)}</code>
              <button 
                className="btn btn-small" 
                style={{ marginLeft: '0.5rem' }}
                onClick={() => copyToClipboard(String(endpoints.baseUrl))}
              >
                Copy
              </button>
            </div>
            
            <h4 style={{ marginBottom: '1rem' }}>Available Endpoints:</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Method</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Path</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Description</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Auth</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.endpoints.map((ep, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ 
                        padding: '0.125rem 0.375rem', 
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: ep.method === 'GET' ? '#dbeafe' : '#dcfce7',
                        color: ep.method === 'GET' ? '#1d4ed8' : '#166534'
                      }}>
                        {String(ep.method)}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{String(ep.path)}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{String(ep.description)}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{String(ep.auth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Usage Examples:</h4>
            <div style={{ background: 'var(--surface)', color: 'var(--text)', padding: '1rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
              <div style={{ marginBottom: '0.5rem' }}># List tools</div>
              <div style={{ marginBottom: '1rem', color: '#9cdcfe' }}>{`curl -H "X-API-Key: mcp_xxx" ${endpoints.baseUrl}/tools`}</div>
              <div style={{ marginBottom: '0.5rem' }}># Execute tool</div>
              <div style={{ color: '#9cdcfe' }}>{`curl -X POST -H "X-API-Key: mcp_xxx" -H "Content-Type: application/json" -d '{\\"toolName\\":\\"hello\\"}' ${endpoints.baseUrl}/execute`}</div>
            </div>
          </div>
        )}
        
        {loading ? (
          <div className="loading-overlay"><div className="spinner"></div></div>
        ) : stats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="card">
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.overview.totalCalls}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Total Calls</div>
              </div>
              <div className="card">
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.overview.todayCalls}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Today</div>
              </div>
              <div className="card">
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.overview.last7Days}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Last 7 Days</div>
              </div>
              <div className="card">
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: stats.overview.successRate >= 90 ? '#22c55e' : '#ef4444' }}>
                  {stats.overview.successRate}%
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>Success Rate</div>
              </div>
              <div className="card">
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.overview.avgResponseTime}ms</div>
                <div style={{ color: 'var(--text-secondary)' }}>Avg Response Time</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>Top Tools</h3>
                {stats.topTools.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)' }}>No tool calls yet</div>
                ) : (
                  <div>
                    {stats.topTools.map((t, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                        <span>{t.toolName}</span>
                        <span style={{ fontWeight: 'bold' }}>{t.callCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>Top Integrations</h3>
                {stats.topIntegrations.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)' }}>No integration calls yet</div>
                ) : (
                  <div>
                    {stats.topIntegrations.map((i, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                        <span>{i.integrationName}</span>
                        <span style={{ fontWeight: 'bold' }}>{i.callCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3>Call History</h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ width: '130px' }}>
                    <StyledSelect
                      options={[
                        { value: 'true', label: 'Success' },
                        { value: 'false', label: 'Failed' }
                      ]}
                      value={filters.success ? { value: filters.success, label: filters.success === 'true' ? 'Success' : 'Failed' } : { value: '', label: 'All Results' }}
                      onChange={(opt) => setFilters({ ...filters, success: opt?.value || '' })}
                      placeholder="All Results"
                      isClearable
                      isSearchable={false}
                    />
                  </div>
                  <div style={{ width: '130px' }}>
                    <StyledSelect
                      options={[
                        { value: 'mcp', label: 'MCP' },
                        { value: 'rest', label: 'REST' },
                        { value: 'api_key', label: 'API Key' }
                      ]}
                      value={filters.callerType ? { value: filters.callerType, label: filters.callerType } : { value: '', label: 'All Types' }}
                      onChange={(opt) => setFilters({ ...filters, callerType: opt?.value || '' })}
                      placeholder="All Types"
                      isClearable
                      isSearchable={false}
                    />
                  </div>
                  <div style={{ width: '80px' }}>
                    <StyledSelect
                      options={[
                        { value: 15, label: '15' },
                        { value: 25, label: '25' },
                        { value: 50, label: '50' },
                        { value: 100, label: '100' }
                      ]}
                      value={limit}
                      onChange={handleLimitChange}
                      isSearchable={false}
                    />
                  </div>
                </div>
              </div>

              {history.length === 0 && historyLoading ? (
                <div className="loading-overlay"><div className="spinner"></div></div>
              ) : history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No calls recorded yet</div>
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem', width: '30px' }}></th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Time</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Tool</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Integration</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Method</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Caller</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Time</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(call => (
                        <><tr key={call.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: expandedCall === call.id ? 'var(--surface-hover)' : 'transparent' }} onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}>
                          <td style={{ padding: '0.5rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{expandedCall === call.id ? '▼' : '▶'}</span>
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{formatDate(call.createdAt)}</td>
                          <td style={{ padding: '0.5rem' }}>{call.toolName}</td>
                          <td style={{ padding: '0.5rem' }}>{call.integrationName}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span style={{ 
                              padding: '0.125rem 0.375rem', 
                              borderRadius: '3px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              background: call.method === 'GET' ? 'rgba(59, 130, 246, 0.15)' : call.method === 'POST' ? 'rgba(16, 185, 129, 0.15)' : call.method === 'PUT' ? 'rgba(245, 158, 11, 0.15)' : call.method === 'DELETE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                              color: call.method === 'GET' ? '#3b82f6' : call.method === 'POST' ? '#10b981' : call.method === 'PUT' ? '#f59e0b' : call.method === 'DELETE' ? '#ef4444' : '#6b7280'
                            }}>
                              {call.method}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{call.callerType}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span style={{ 
                              padding: '0.125rem 0.375rem', 
                              borderRadius: '3px',
                              fontSize: '0.75rem',
                              background: call.success ? 'var(--success-bg)' : 'var(--error-bg)',
                              color: call.success ? 'var(--success)' : 'var(--danger)'
                            }}>
                              {call.responseStatus || (call.success ? 'OK' : 'Error')}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{formatTime(call.responseTime)}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <button 
                              className="btn btn-small"
                              onClick={(e) => { e.stopPropagation(); handleReplay(call.id); }}
                              disabled={replaying === call.id}
                              title="Replay with same params"
                            >
                              {replaying === call.id ? '...' : 'Replay'}
                            </button>
                            <button 
                              className="btn btn-small"
                              style={{ marginLeft: '0.25rem' }}
                              onClick={(e) => { e.stopPropagation(); openTester(call); }}
                              title="Test with modified params"
                            >
                              Test
                            </button>
                          </td>
                        </tr>
                        {expandedCall === call.id && (
                          <tr key={`${call.id}-expanded`}>
                            <td colSpan={9} style={{ padding: '1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', height: '250px' }}>
                                <div 
                                  tabIndex={0} 
                                  onClick={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                  style={{ overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.5rem', cursor: 'pointer' }}
                                >
                                  <h4 style={{ marginBottom: '0.5rem' }}>Request</h4>
                                  {call.fullUrl && <div style={{ marginBottom: '0.5rem', wordBreak: 'break-word', fontSize: '0.8rem', color: 'var(--text-light)' }}><strong>URL:</strong> <code>{call.method} {call.fullUrl}</code></div>}
                                  <div style={{ marginBottom: '0.5rem', wordBreak: 'break-word' }}><strong>Path:</strong> <code>{call.path}</code></div>
                                  {call.queryParams && Object.keys(call.queryParams).length > 0 && (
                                    <div style={{ marginBottom: '0.5rem' }}><strong>Query:</strong> <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--surface)', borderRadius: '4px', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(call.queryParams, null, 2)}</pre></div>
                                  )}
                                  {call.requestBody && Object.keys(call.requestBody).length > 0 && (
                                    <div><strong>Body:</strong> <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--surface)', borderRadius: '4px', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(call.requestBody, null, 2)}</pre></div>
                                  )}
                                  {(!call.requestBody || Object.keys(call.requestBody).length === 0) && (!call.queryParams || Object.keys(call.queryParams).length === 0) && (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No request body</span>
                                  )}
                                </div>
                                <div 
                                  tabIndex={0} 
                                  onClick={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                  style={{ overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.5rem', cursor: 'pointer' }}
                                >
                                  <h4 style={{ marginBottom: '0.5rem' }}>Response</h4>
                                  {call.errorMessage && (
                                    <div style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}><strong>Error:</strong> {call.errorMessage}</div>
                                  )}
                                  {call.responseBody && (
                                    <pre style={{ margin: 0, padding: '0.5rem', background: 'var(--surface)', borderRadius: '4px', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{typeof call.responseBody === 'string' ? call.responseBody : JSON.stringify(call.responseBody, null, 2)}</pre>
                                  )}
                                  {!call.responseBody && !call.errorMessage && <span style={{ color: 'var(--text-secondary)' }}>No response body recorded</span>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}</>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                    <button 
                      onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                      disabled={pagination.page <= 1}
                      className="btn"
                      style={{ padding: '0.25rem 0.75rem' }}
                    >
                      Previous
                    </button>
                    <span style={{ padding: '0.25rem 0.75rem' }}>
                      Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                    </span>
                    <button 
                      onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                      disabled={pagination.page >= pagination.pages}
                      className="btn"
                      style={{ padding: '0.25rem 0.75rem' }}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Unable to load monitoring data
          </div>
        )}
        </>)}

        {testerModal.open && (
          <div className="modal-overlay" onClick={closeTesterModal}>
            <div ref={testerModalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={testerTitleId} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
              <div className="modal-header">
                <h2 id={testerTitleId}>Test Tool: {testerModal.call?.toolId}</h2>
                <button className="modal-close" aria-label="Close" onClick={closeTesterModal}>&times;</button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '6px' }}>
                  <strong>Method:</strong> {testerModal.call?.method} {testerModal.call?.path}
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ marginBottom: '0.5rem' }}>Parameters (modify and test)</h4>
                  {Object.keys(testerModal.params).length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No parameters in original request</p>
                  ) : (
                    Object.keys(testerModal.params).map(key => (
                      <div key={key} style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{key}</label>
                        <input 
                          type="text"
                          value={testerModal.params[key]}
                          onChange={e => setTesterModal(m => ({ ...m, params: { ...m.params, [key]: e.target.value } }))}
                          style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                        />
                      </div>
                    ))
                  )}
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={runTest}
                  disabled={testerModal.testing}
                >
                  {testerModal.testing ? 'Testing...' : 'Execute'}
                </button>
                {testerModal.result && (
                  <div style={{ marginTop: '1rem' }}>
                    <h4>Result</h4>
                    <pre style={{ margin: '0.5rem 0', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '6px', fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto' }}>
                      {typeof testerModal.result === 'string' ? testerModal.result : JSON.stringify(testerModal.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {replayResult && (
          <Modal title="Replay Result" onClose={() => setReplayResult(null)} size="lg">
            {replayResult.error ? (
              <p style={{ color: 'var(--danger)' }}>{replayResult.error}</p>
            ) : (
              <pre style={{ margin: 0, padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '6px', fontSize: '0.8rem', maxHeight: '60vh', overflow: 'auto' }}>
                {JSON.stringify(replayResult.data, null, 2)}
              </pre>
            )}
          </Modal>
        )}
      </div>
    </div>
  );
}

function AuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [limit, setLimit] = useState({ value: 25, label: '25' });
  const [filters, setFilters] = useState({ action: '', integrationType: '', status: '' });

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, filters, limit]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('limit', limit.value);
      if (filters.action) params.append('action', filters.action);
      if (filters.integrationType) params.append('integrationType', filters.integrationType);
      if (filters.status) params.append('status', filters.status);

      const res = await api.get(`/monitoring/audit-log?${params}`);
      setLogs(res.data.logs);
      setPagination(res.data.pagination);
    } catch (err) {
      if (err.response?.status === 401) {
        window.location.href = '/login';
        return;
      }
      console.error('Failed to fetch audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPagination(p => ({ ...p, page: 1 }));
  };

  const handleFilterChange = (patch) => {
    setFilters(f => ({ ...f, ...patch }));
    setPagination(p => ({ ...p, page: 1 }));
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleString();

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3>Audit Log</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Filter by action..."
            value={filters.action}
            onChange={(e) => handleFilterChange({ action: e.target.value })}
            style={{ padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', width: '160px' }}
          />
          <input
            type="text"
            placeholder="Integration type..."
            value={filters.integrationType}
            onChange={(e) => handleFilterChange({ integrationType: e.target.value })}
            style={{ padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', width: '160px' }}
          />
          <div style={{ width: '140px' }}>
            <StyledSelect
              options={[
                { value: 'success', label: 'Success' },
                { value: 'failure', label: 'Failure' },
                { value: 'pending', label: 'Pending' }
              ]}
              value={filters.status ? { value: filters.status, label: filters.status } : { value: '', label: 'All Statuses' }}
              onChange={(opt) => handleFilterChange({ status: opt?.value || '' })}
              placeholder="All Statuses"
              isClearable
              isSearchable={false}
            />
          </div>
          <div style={{ width: '80px' }}>
            <StyledSelect
              options={[
                { value: 25, label: '25' },
                { value: 50, label: '50' },
                { value: 100, label: '100' }
              ]}
              value={limit}
              onChange={handleLimitChange}
              isSearchable={false}
            />
          </div>
        </div>
      </div>

      {logs.length === 0 && loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No audit log entries yet</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Integration Type</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(entry => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.timestamp)}</td>
                  <td>{entry.user?.email || entry.userId || '-'}</td>
                  <td>{entry.action}</td>
                  <td>{entry.integrationType || '-'}</td>
                  <td>
                    <span className={`badge ${entry.status === 'success' ? 'badge-success' : entry.status === 'failure' ? 'badge-danger' : 'badge-warning'}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td
                    style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={entry.errorMessage || (entry.details && Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : '')}
                  >
                    {entry.errorMessage || (entry.details && Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : '-')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
              disabled={pagination.page <= 1}
              className="btn"
              style={{ padding: '0.25rem 0.75rem' }}
            >
              Previous
            </button>
            <span style={{ padding: '0.25rem 0.75rem' }}>
              Page {pagination.page} of {pagination.pages} ({pagination.total} total)
            </span>
            <button
              onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
              disabled={pagination.page >= pagination.pages}
              className="btn"
              style={{ padding: '0.25rem 0.75rem' }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Monitoring;