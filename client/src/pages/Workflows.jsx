import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

function Workflows() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [executingId, setExecutingId] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailWorkflow, setDetailWorkflow] = useState(null);
  const [showInputModal, setShowInputModal] = useState(false);
  const [showCanvasModal, setShowCanvasModal] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    actions: [{ integrationId: '', action: '', endpoint: '', method: 'POST', params: '', body: '' }]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [wfRes, intRes] = await Promise.all([
        api.get('/workflows'),
        api.get('/integrations')
      ]);
      setWorkflows(wfRes.data);
      setIntegrations(intRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        description: form.description,
        actions: form.actions.map(a => ({
          integrationId: a.integrationId,
          action: a.action,
          endpoint: a.endpoint,
          method: a.method,
          params: a.params ? JSON.parse(a.params) : {},
          body: a.body ? JSON.parse(a.body) : {}
        }))
      };

      await api.post('/workflows', payload);
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create workflow');
    }
  };

  const addAction = () => {
    setForm({
      ...form,
      actions: [...form.actions, { integrationId: '', action: '', endpoint: '', method: 'POST', params: '', body: '' }]
    });
  };

  const removeAction = (index) => {
    setForm({
      ...form,
      actions: form.actions.filter((_, i) => i !== index)
    });
  };

  const updateAction = (index, field, value) => {
    const newActions = [...form.actions];
    newActions[index] = { ...newActions[index], [field]: value };
    setForm({ ...form, actions: newActions });
  };

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await api.get('/workflows/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleCreateFromTemplate = async (template) => {
    try {
      await api.post('/workflows/from-template', {
        templateId: template.id,
        name: template.name,
        description: template.description
      });
      setShowTemplatesModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create workflow from template');
    }
  };

  const handleExecute = async (id, inputs = null) => {
    setExecutingId(id);
    setExecutionResult(null);
    setShowInputModal(false);
    try {
      const res = await api.post(`/workflows/${id}/execute`, { inputs: inputs || {} });
      setExecutionResult(res.data);
    } catch (err) {
      setExecutionResult({ error: err.response?.data?.error || 'Execution failed' });
    } finally {
      setExecutingId(null);
    }
  };

  const runWithInputs = () => {
    handleExecute(detailWorkflow.id, inputForm);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await api.delete(`/workflows/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete workflow');
    }
  };

  const openDetail = (wf) => {
    setDetailWorkflow(wf);
    setShowDetailModal(true);
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      actions: [{ integrationId: '', action: '', endpoint: '', method: 'POST', params: '', body: '' }]
    });
  };

  return (
    <div>
      <div className="navbar">
        <Link to="/" className="navbar-brand" style={{ textDecoration: 'none' }}>MCP Depot</Link>
        <div className="navbar-menu">
          <Link to="/">Dashboard</Link>
          <Link to="/integrations">Integrations</Link>
          <Link to="/tools">Tools</Link>
          <Link to="/workflows">Workflows</Link>
          <Link to="/monitoring">Monitoring</Link>
          <Link to="/settings">Settings</Link>
          <label className="toggle" style={{ marginLeft: '0.5rem', marginRight: '0.5rem' }}>
            <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
            <span className="toggle-slider"></span>
          </label>
          <div className="user-avatar">{user?.name?.charAt(0)}</div>
        </div>
      </div>

      <div className="container">
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1>Workflows</h1>
              <p>Automate actions across multiple integrations</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => { setShowTemplatesModal(true); fetchTemplates(); }}>
                From Template
              </button>
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                + Create Workflow
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner"></div></div>
        ) : workflows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">-</div>
            <h3>No workflows yet</h3>
            <p>Create your first workflow to automate actions</p>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                Create Workflow
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowTemplatesModal(true); fetchTemplates(); }}>
                From Template
              </button>
            </div>
          </div>
        ) : (
          <div className="grid">
            {workflows.map(wf => (
              <div key={wf.id} className="card">
                <div className="card-header">
                  <h3 className="card-title">{wf.name}</h3>
                  <span className={`badge ${wf.isActive ? 'badge-success' : 'badge-warning'}`}>
                    {wf.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>{wf.description}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
                  {wf.actions?.length || 0} actions
                </p>
                {wf.lastExecutedAt && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
                    Last run: {new Date(wf.lastExecutedAt).toLocaleString()}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button 
                    className="btn btn-secondary btn-small" 
                    onClick={() => { setDetailWorkflow(wf); setShowCanvasModal(true); }}
                  >
                    View
                  </button>
                  <button 
                    className="btn btn-primary btn-small" 
                    onClick={() => { setDetailWorkflow(wf); setShowInputModal(true); }}
                  >
                    How it works
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => handleDelete(wf.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {executionResult && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h3>Execution Result</h3>
            {executionResult.error ? (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--error-bg)', borderRadius: 'var(--radius)', color: 'var(--danger)' }}>
                {executionResult.error}
              </div>
            ) : (
              <pre style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius)', overflow: 'auto', maxHeight: '400px' }}>
                {JSON.stringify(executionResult, null, 2)}
              </pre>
            )}
            {executionResult.results && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Action Results:</h4>
                {executionResult.results.map((r, i) => (
                  <div key={i} style={{ padding: '0.5rem', marginBottom: '0.5rem', background: r.success ? 'var(--success-bg)' : 'var(--error-bg)', borderRadius: '4px' }}>
                    <strong>Action {i + 1}:</strong> {r.success ? '✅ Success' : '❌ Failed'}
                    {r.error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{r.error}</div>}
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost btn-small" style={{ marginTop: '1rem' }} onClick={() => setExecutionResult(null)}>
              Close
            </button>
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create Workflow</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Workflow Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="Deploy & Notify"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="What does this workflow do?"
                    />
                  </div>

                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <label style={{ fontWeight: 600 }}>Actions</label>
                      <button type="button" className="btn btn-secondary btn-small" onClick={addAction}>
                        + Add Action
                      </button>
                    </div>

                    {form.actions.map((action, index) => (
                      <div key={index} style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <span style={{ fontWeight: 500 }}>Action {index + 1}</span>
                          {form.actions.length > 1 && (
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => removeAction(index)}>Remove</button>
                          )}
                        </div>
                        <div className="form-group">
                          <label>Integration</label>
                          <select value={action.integrationId} onChange={e => updateAction(index, 'integrationId', e.target.value)} required>
                            <option value="">Select integration</option>
                            {integrations.map(int => (
                              <option key={int._id} value={int._id}>{int.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Method</label>
                            <select value={action.method} onChange={e => updateAction(index, 'method', e.target.value)}>
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                              <option value="PATCH">PATCH</option>
                              <option value="DELETE">DELETE</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Endpoint</label>
                            <input
                              type="text"
                              value={action.endpoint}
                              onChange={e => updateAction(index, 'endpoint', e.target.value)}
                              placeholder="/api/endpoint"
                              required
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Params (JSON)</label>
                          <textarea
                            value={action.params}
                            onChange={e => updateAction(index, 'params', e.target.value)}
                            placeholder='{"key": "value"}'
                            style={{ minHeight: '60px' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create Workflow</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showTemplatesModal && (
          <div className="modal-overlay" onClick={() => setShowTemplatesModal(false)}>
            <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Workflow Templates</h2>
                <button className="modal-close" onClick={() => setShowTemplatesModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                {templatesLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>Loading templates...</div>
                ) : templates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                    No templates available. Fetch templates first.
                    <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={fetchTemplates}>
                      Load Templates
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {templates.map(template => (
                      <div key={template.id} style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius)', cursor: 'pointer' }} onClick={() => handleCreateFromTemplate(template)}>
                        <h3 style={{ margin: 0 }}>{template.name}</h3>
                        <p style={{ color: 'var(--text-light)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{template.description}</p>
                        <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{template.actions?.length || 0} actions</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={fetchTemplates}>Refresh Templates</button>
                <button className="btn btn-secondary" onClick={() => setShowTemplatesModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && detailWorkflow && (
          <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
            <div className="modal" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{detailWorkflow.name}</h2>
                <button className="modal-close" onClick={() => setShowDetailModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <p style={{ color: 'var(--text-light)', marginBottom: '1.5rem' }}>{detailWorkflow.description}</p>
                
                <div style={{ marginBottom: '1.5rem' }}>
                  <span className={`badge ${detailWorkflow.isActive ? 'badge-success' : 'badge-warning'}`}>
                    {detailWorkflow.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div>
                  <h4 style={{ marginBottom: '1rem' }}>Actions ({detailWorkflow.actions?.length || 0})</h4>
                  {detailWorkflow.actions?.map((action, index) => (
                    <div key={index} style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ background: 'var(--primary)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {index + 1}
                        </span>
                        <strong>{action.name || action.action}</strong>
                        <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>({action.type || 'integration'})</span>
                      </div>
                      {action.inputMapping && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-light)' }}>
                          <strong>Input Mapping:</strong>
                          <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--background)', borderRadius: '4px', fontSize: '0.8rem' }}>
                            {JSON.stringify(action.inputMapping, null, 2)}
                          </pre>
                        </div>
                      )}
                      {action.condition && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-light)' }}>
                          <strong>Condition:</strong> <code>{action.condition}</code>
                        </div>
                      )}
                      {action.onSuccess && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                          <strong>On Success:</strong> {action.onSuccess.length} actions
                        </div>
                      )}
                      {action.onFailure && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                          <strong>On Failure:</strong> {action.onFailure.length} actions
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {detailWorkflow.trigger && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h4>Trigger</h4>
                    <div style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius)' }}>
                      <p style={{ margin: 0 }}><strong>Type:</strong> {detailWorkflow.trigger.type}</p>
                      {detailWorkflow.trigger.inputs && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Inputs:</strong>
                          <ul style={{ margin: '0.25rem 0 0 1rem', fontSize: '0.85rem' }}>
                            {detailWorkflow.trigger.inputs.map((inp, i) => (
                              <li key={i}>{inp.label || inp.name} ({inp.type}){inp.required && ' - required'}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {detailWorkflow.lastExecutedAt && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
                      Last executed: {new Date(detailWorkflow.lastExecutedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {showInputModal && detailWorkflow && (
          <div className="modal-overlay" onClick={() => setShowInputModal(false)}>
            <div className="modal" style={{ maxWidth: '700px', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>How Claude will call tools</h2>
                <button className="modal-close" onClick={() => setShowInputModal(false)}>&times;</button>
              </div>
              <div className="modal-body" style={{ overflowY: 'auto' }}>
                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius)' }}>
                  <p style={{ margin: 0, color: 'var(--text-light)' }}>
                    <strong>Prompt:</strong> "Implement {detailWorkflow.trigger?.inputs?.[0]?.placeholder || 'JIRA-123'}, run tests, if Jenkins green update JIRA"
                  </p>
                </div>

                <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
                  When you ask Claude to handle <strong>{detailWorkflow.trigger?.inputs?.[0]?.label || 'a JIRA ticket'}</strong>, 
                  it will call these tools in sequence:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {detailWorkflow.actions?.map((action, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: '0.75rem',
                      padding: '0.75rem',
                      background: action.type === 'jira' ? '#e3f2fd' : action.type === 'jenkins' ? '#fff3e0' : action.type === 'confluence' ? '#e8f5e9' : 'var(--surface-hover)',
                      borderRadius: 'var(--radius)',
                      borderLeft: `4px solid ${action.type === 'jira' ? '#2196f3' : action.type === 'jenkins' ? '#ff9800' : action.type === 'confluence' ? '#4caf50' : '#9e9e9e'}`
                    }}>
                      <span style={{ 
                        background: 'var(--primary)', 
                        color: 'white', 
                        width: '24px', 
                        height: '24px', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <strong>{action.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                          {action.type}.{action.action}({action.inputMapping ? JSON.stringify(action.inputMapping) : ''})
                        </div>
                        {action.condition && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.25rem' }}>
                            ↳ if {action.condition}
                          </div>
                        )}
                        {action.onSuccess && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '0.25rem' }}>
                            ↳ on success: {action.onSuccess.length} more actions
                          </div>
                        )}
                        {action.onFailure && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem' }}>
                            ↳ on failure: {action.onFailure.length} more actions
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--success-bg)', borderRadius: 'var(--radius)' }}>
                  <strong>💡 To execute:</strong> Ask Claude to implement the JIRA ticket, it will automatically call these tools.
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowInputModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {showCanvasModal && detailWorkflow && (
          <div className="modal-overlay" onClick={() => { setShowCanvasModal(false); setSelectedNode(null); }}>
            <div className="modal" style={{ maxWidth: '1200px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{detailWorkflow.name}</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-ghost btn-small" onClick={() => setCanvasOffset({ x: 0, y: 0 })}>Reset View</button>
                  <button className="modal-close" onClick={() => { setShowCanvasModal(false); setSelectedNode(null); }}>&times;</button>
                </div>
              </div>
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <div 
                  style={{ flex: 1, position: 'relative', background: 'linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%)', minHeight: '500px', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y }); }}
                  onMouseMove={(e) => { if (isDragging) setCanvasOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                >
                  <div style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`, transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}>
                    <svg width="800" height={Math.max(600, (detailWorkflow.actions?.length || 0) * 120 + 100)} style={{ margin: '20px' }}>
                      {detailWorkflow.actions?.map((action, idx) => {
                        const y = 60 + (idx * 120);
                        const color = action.type === 'jira' ? '#0052cc' : action.type === 'jenkins' ? '#d33833' : action.type === 'confluence' ? '#0065ff' : action.type === 'github' ? '#24292e' : action.type === 'wait' ? '#ff9800' : '#666';
                        const isSelected = selectedNode?.index === idx;
                        const isHovered = hoveredNode === idx;
                        return (
                          <g key={idx} 
                            style={{ pointerEvents: 'all', cursor: 'pointer' }} 
                            onClick={(e) => { e.stopPropagation(); setSelectedNode({ ...action, index: idx }); }}
                            onMouseEnter={() => setHoveredNode(idx)}
                            onMouseLeave={() => setHoveredNode(null)}
                          >
                            {idx > 0 && (
                              <path 
                                d={`M 180 ${50 + ((idx - 1) * 120) + 70} Q 180 ${50 + ((idx - 1) * 120) + 95} 180 ${y}`}
                                stroke={action.condition ? "#ff9800" : "#444"} 
                                strokeWidth={isSelected ? "3" : "2"}
                                fill="none"
                                strokeDasharray={action.condition ? "8,4" : "none"}
                                opacity={isSelected ? 1 : 0.7}
                              />
                            )}
                            <circle cx="180" cy={y} r="30" fill={color} opacity={isSelected || isHovered ? 1 : 0.8} filter={isSelected ? `drop-shadow(0 0 15px ${color})` : isHovered ? `drop-shadow(0 0 8px ${color})` : 'none'} style={{ transition: 'all 0.2s' }} />
                            <text x="180" y={y + 5} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">
                              {idx + 1}
                            </text>
                            <rect x="225" y={y - 35} width="320" height="70" rx="12" fill="#16213e" stroke={color} strokeWidth={isSelected ? "3" : "2"} filter={isSelected ? `drop-shadow(0 0 15px ${color})` : 'none'} style={{ transition: 'all 0.2s' }} />
                            <text x="385" y={y - 10} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">
                              {action.name}
                            </text>
                            <text x="385" y={y + 15} textAnchor="middle" fill="#aaa" fontSize="11">
                              {action.type}.{action.action}
                            </text>
                            {action.condition && (
                              <g>
                                <text x="180" y={y + 55} textAnchor="middle" fill="#ff9800" fontSize="10" fontWeight="600">
                                  ⚡ if {action.condition.replace('$.', '')}
                                </text>
                              </g>
                            )}
                            {action.onSuccess && action.onSuccess.length > 0 && (
                              <g>
                                <path d={`M 545 ${y} Q 600 ${y} 620 ${y - 60}`} stroke="#4caf50" strokeWidth="2" fill="none" />
                                <polygon points="620,-68 635,-55 620,-60 635,-68" fill="#4caf50" />
                                <rect x="620" y={y - 80} width="100" height="40" rx="6" fill="#1b5e20" stroke="#4caf50" strokeWidth="2" />
                                <text x="670" y={y - 55} textAnchor="middle" fill="#4caf50" fontSize="10" fontWeight="bold">✓ {action.onSuccess.length}</text>
                              </g>
                            )}
                            {action.onFailure && action.onFailure.length > 0 && (
                              <g>
                                <path d={`M 545 ${y} Q 600 ${y} 620 ${y + 60}`} stroke="#f44336" strokeWidth="2" fill="none" />
                                <polygon points="620,68 635,55 620,60 635,68" fill="#f44336" />
                                <rect x="620" y={y + 40} width="100" height="40" rx="6" fill="#b71c1c" stroke="#f44336" strokeWidth="2" />
                                <text x="670" y={y + 65} textAnchor="middle" fill="#f44336" fontSize="10" fontWeight="bold">✗ {action.onFailure.length}</text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(0,0,0,0.7)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    🖱️ Drag to pan • Click node for details • Scroll to zoom
                  </div>
                </div>
                  {selectedNode && (
                  <div style={{ width: '350px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: '1.5rem', overflow: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ 
                        width: 40, height: 40, borderRadius: '50%', 
                        background: selectedNode?.type === 'jira' ? '#0052cc' : selectedNode?.type === 'jenkins' ? '#d33833' : selectedNode?.type === 'confluence' ? '#0065ff' : selectedNode?.type === 'github' ? '#24292e' : selectedNode?.type === 'loop' ? '#9c27b0' : '#ff9800',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold'
                      }}>
                        {selectedNode?.index + 1}
                      </div>
                      <div>
                        <h3 style={{ margin: 0 }}>{selectedNode?.name}</h3>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{selectedNode?.type}.{selectedNode?.action}</span>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tool Call</h4>
                      <code style={{ display: 'block', padding: '0.75rem', background: 'var(--background)', borderRadius: '6px', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                        {selectedNode?.type}.{selectedNode?.action}({selectedNode?.inputMapping ? JSON.stringify(selectedNode.inputMapping, null, 2) : ''})
                      </code>
                    </div>

                    {selectedNode?.inputMapping && Object.keys(selectedNode.inputMapping).length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parameters</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {Object.entries(selectedNode.inputMapping).map(([key, value]) => (
                            <div key={key} style={{ padding: '0.5rem', background: 'var(--surface-hover)', borderRadius: '6px' }}>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{key}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', fontFamily: 'monospace' }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedNode?.condition && (
                      <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'var(--warning-bg)', borderRadius: '6px', borderLeft: '3px solid var(--warning)' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--warning)' }}>Condition</div>
                        <code style={{ fontSize: '0.85rem' }}>{selectedNode.condition}</code>
                      </div>
                    )}

                    {selectedNode?.onSuccess && selectedNode.onSuccess.length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>On Success ({selectedNode.onSuccess.length})</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {selectedNode.onSuccess.map((a, i) => (
                            <div key={i} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', background: 'var(--success-bg)', borderRadius: '4px' }}>
                              {i + 1}. {a.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedNode?.onFailure && selectedNode.onFailure.length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>On Failure ({selectedNode.onFailure.length})</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {selectedNode.onFailure.map((a, i) => (
                            <div key={i} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', background: 'var(--error-bg)', borderRadius: '4px' }}>
                              {i + 1}. {a.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#0052cc' }}></div>
                    <span style={{ fontSize: '0.75rem' }}>JIRA</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#d33833' }}></div>
                    <span style={{ fontSize: '0.75rem' }}>Jenkins</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#0065ff' }}></div>
                    <span style={{ fontSize: '0.75rem' }}>Confluence</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff9800' }}></div>
                    <span style={{ fontSize: '0.75rem' }}>Wait</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', margin: 0 }}>
                  Click any node to see details →
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowCanvasModal(false); setSelectedNode(null); }}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Workflows;
