import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, ChevronDown, ChevronRight, Zap, HelpCircle } from 'lucide-react';

function getMappingSource(mapping) {
  if (!mapping) return 'input';
  if (mapping.source === 'literal') return 'literal';
  if (mapping.source === 'step') return 'previous';
  return 'input';
}

function CompositeToolBuilder() {
  const { id }              = useParams();
  const [searchParams]      = useSearchParams();
  const integrationIdParam  = searchParams.get('integrationId') || '';
  const navigate            = useNavigate();
  const isEditing           = Boolean(id);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    inputSchema: { type: 'object', properties: {}, required: [] },
    steps: [],
    integrationId: integrationIdParam
  });

  const [availableTools,      setAvailableTools]      = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [saving,              setSaving]              = useState(false);
  const [testing,             setTesting]             = useState(false);
  const [testResult,          setTestResult]          = useState(null);
  const [error,               setError]              = useState(null);
  const [selectedStep,        setSelectedStep]        = useState(null);
  const [selectedIntegration, setSelectedIntegration] = useState(integrationIdParam);
  const [integrations,        setIntegrations]        = useState([]);
  const [showDocs,          setShowDocs]           = useState(false);
  const [toolsExpanded,     setToolsExpanded]       = useState({});

  const loadToolsForIntegration = async (intId) => {
    if (!intId) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res   = await fetch(`/api/integrations/${intId}/tools`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data  = await res.json();
      const tools = Array.isArray(data) ? data : [];
      setAvailableTools(tools.filter(t => t.type !== 'composite'));
    } catch (err) {
      console.error('Failed to load tools:', err);
    }
  };

  const loadData = async () => {
    try {
      const token   = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };

      const intRes  = await fetch('/api/integrations', { headers });
      const intData = await intRes.json();
      setIntegrations(Array.isArray(intData) ? intData : []);

      if (isEditing) {
        const toolRes = await fetch(`/api/integrations/composite/${id}`, { headers });
        const tool    = await toolRes.json();
        setFormData({
          name:          tool.name          || '',
          description:   tool.description   || '',
          inputSchema:   tool.inputSchema   || { type: 'object', properties: {}, required: [] },
          steps:         tool.steps         || [],
          integrationId: tool.integrationId || ''
        });
        setSelectedIntegration(tool.integrationId || '');
        await loadToolsForIntegration(tool.integrationId);
      } else if (integrationIdParam) {
        setSelectedIntegration(integrationIdParam);
        await loadToolsForIntegration(integrationIdParam);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id]);

  const handleIntegrationChange = async (intId) => {
    setSelectedIntegration(intId);
    setFormData(prev => ({ ...prev, integrationId: intId, steps: [] }));
    setSelectedStep(null);
    setAvailableTools([]);
    await loadToolsForIntegration(intId);
  };

  const toggleToolsExpand = (toolId) => {
    setToolsExpanded(prev => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleAddTool = (tool) => {
    const newStep = {
      id:            `step_${Date.now()}`,
      label:         tool.name,
      toolId:        tool.id || tool._id,
      inputMappings: {},
      extractors:    []
    };
    setFormData(prev => ({ 
      ...prev, 
      steps: [...prev.steps, newStep]
    }));
    setSelectedStep(newStep.id);
  };

  const handleRemoveStep = (stepId) => {
    setFormData(prev => ({ ...prev, steps: prev.steps.filter(s => s.id !== stepId) }));
    if (selectedStep === stepId) setSelectedStep(null);
  };

  const handleStepMove = (stepId, direction) => {
    setFormData(prev => {
      const idx = prev.steps.findIndex(s => s.id === stepId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.steps.length) return prev;
      const newSteps = [...prev.steps];
      [newSteps[idx], newSteps[newIdx]] = [newSteps[newIdx], newSteps[idx]];
      return { ...prev, steps: newSteps };
    });
  };

  const handleMappingChange = (stepId, paramKey, type, value) => {
    let newMapping;
    if (type === 'input') {
      newMapping = { source: 'input', key: value || paramKey };
    } else if (type === 'literal') {
      newMapping = { source: 'literal', value: value || '' };
    } else {
      newMapping = { source: 'input', key: paramKey };
    }
    
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.map(s => {
        if (s.id !== stepId) return s;
        return { 
          ...s, 
          inputMappings: { ...s.inputMappings, [paramKey]: newMapping }
        };
      })
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Please enter a name for the composite tool');
      return;
    }
    if (formData.steps.length === 0) {
      alert('Please add at least one step');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const url = isEditing 
        ? `/api/integrations/composite/${id}`
        : `/api/integrations/composite`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          inputSchema: formData.inputSchema,
          steps: formData.steps.map(s => ({
            id: s.id,
            label: s.label,
            toolId: s.toolId,
            inputMappings: s.inputMappings,
            extractors: s.extractors || []
          }))
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      navigate(-1);
    } catch (err) {
      setError(err.message);
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="composite-builder">
      {/* Header */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
            {isEditing ? 'Edit Composite Tool' : 'Create Composite Tool'}
          </h2>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={() => setShowDocs(!showDocs)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <HelpCircle size={16} /> Help
        </button>
        <button 
          className="btn btn-primary" 
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Help Panel */}
      {showDocs && (
        <div style={{ padding: '1rem 1.5rem', background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ marginTop: 0 }}>How Composite Tools Work</h3>
            <p>A composite tool chains multiple API calls together. When Claude calls this tool, it will:</p>
            <ol style={{ lineHeight: 1.8 }}>
              <li>Execute each step in order</li>
              <li>Pass the result from one step to the next</li>
              <li>Return the final result</li>
            </ol>
            
            <h4>Creating a Composite Tool:</h4>
            <ol style={{ lineHeight: 1.8 }}>
              <li><strong>Name & Description:</strong> Give it a clear name and describe what it does</li>
              <li><strong>Add Steps:</strong> Select tools from your integration to chain together</li>
              <li><strong>Define Inputs:</strong> What parameters should Claude pass in?</li>
            </ol>

            <h4>Input Mappings:</h4>
            <p>Each tool parameter can come from:</p>
            <ul style={{ lineHeight: 1.8 }}>
              <li><strong>Claude Input:</strong> Parameter comes from what Claude passes in</li>
              <li><strong>Previous Step:</strong> Use result from an earlier step</li>
              <li><strong>Literal:</strong> Fixed value you specify</li>
            </ul>

            <h4>Example: "Get Jira Issue with Comments"</h4>
            <p>This composite tool could:</p>
            <ol style={{ lineHeight: 1.8 }}>
              <li>Step 1: Get issue details (takes issue key from Claude)</li>
              <li>Step 2: Get comments (uses issue ID from step 1)</li>
            </ol>
            <p>Claude only needs to pass the issue key, and both API calls happen automatically.</p>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem 1.5rem', background: 'var(--danger)', color: 'white' }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Available Tools */}
        <div style={{ width: '320px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Integration</label>
            <select 
              value={selectedIntegration} 
              onChange={e => handleIntegrationChange(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
            >
              <option value="">Select integration...</option>
              {integrations.map(int => (
                <option key={int._id} value={int._id}>{int.name}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                Click a tool to add it as a step
              </p>
            </div>
            
            {availableTools.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                {selectedIntegration ? 'No tools available' : 'Select an integration first'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {availableTools.map(tool => (
                  <div 
                    key={tool._id || tool.id}
                    style={{ 
                      border: '1px solid var(--border)', 
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}
                  >
                    <div 
                      style={{ 
                        padding: '0.75rem', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: formData.steps.some(s => s.toolId === (tool._id || tool.id)) 
                          ? 'var(--primary)' 
                          : 'var(--surface)'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: formData.steps.some(s => s.toolId === (tool._id || tool.id)) ? 'white' : 'var(--text)' }}>
                          {tool.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: formData.steps.some(s => s.toolId === (tool._id || tool.id)) ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)' }}>
                          {tool.endpoint?.method} {tool.endpoint?.path}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button 
                          className="btn btn-sm"
                          onClick={(e) => { e.stopPropagation(); toggleToolsExpand(tool._id || tool.id); }}
                          style={{ 
                            background: formData.steps.some(s => s.toolId === (tool._id || tool.id)) ? 'rgba(255,255,255,0.2)' : 'var(--surface-hover)',
                            color: formData.steps.some(s => s.toolId === (tool._id || tool.id)) ? 'white' : 'var(--text)'
                          }}
                        >
                          {toolsExpanded[tool._id || tool.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <button 
                          className="btn btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleAddTool(tool); }}
                          style={{ 
                            background: formData.steps.some(s => s.toolId === (tool._id || tool.id)) ? 'rgba(255,255,255,0.2)' : 'var(--primary)',
                            color: 'white'
                          }}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {toolsExpanded[tool._id || tool.id] && (
                      <div style={{ padding: '0.75rem', background: 'var(--background)', borderTop: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
                          {tool.description || 'No description'}
                        </p>
                        {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                          <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: 500, margin: '0 0 0.25rem 0' }}>Parameters:</p>
                            {Object.entries(tool.inputSchema.properties).map(([key, val]) => (
                              <div key={key} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                <code>{key}</code>: {val.type || 'string'} {val.description ? `- ${val.description}` : ''}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Steps & Config */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Basic Info */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Tool Name *</label>
                <input 
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Get Jira Issue with Comments"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Description</label>
                <input 
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What does this tool do?"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
            </div>
          </div>

          {/* Steps List */}
          <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={18} style={{ color: 'var(--primary)' }} />
              Steps ({formData.steps.length})
            </h3>

            {formData.steps.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem', 
                background: 'var(--surface-hover)', 
                borderRadius: '8px',
                border: '2px dashed var(--border)'
              }}>
                <Zap size={48} style={{ color: 'var(--text-dim)', marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                  Click tools on the left to add steps
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {formData.steps.map((step, index) => {
                  const tool = availableTools.find(t => (t._id || t.id) === step.toolId);
                  return (
                    <div 
                      key={step.id}
                      style={{ 
                        border: selectedStep === step.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}
                    >
                      <div 
                        style={{ 
                          padding: '1rem',
                          background: 'var(--surface)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedStep(step.id)}
                      >
                        <div style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '50%', 
                          background: 'var(--primary)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          flexShrink: 0
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{step.label}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {tool?.endpoint?.method} {tool?.endpoint?.path}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button 
                            className="btn btn-sm btn-ghost"
                            onClick={(e) => { e.stopPropagation(); handleStepMove(step.id, 'up'); }}
                            disabled={index === 0}
                          >
                            ▲
                          </button>
                          <button 
                            className="btn btn-sm btn-ghost"
                            onClick={(e) => { e.stopPropagation(); handleStepMove(step.id, 'down'); }}
                            disabled={index === formData.steps.length - 1}
                          >
                            ▼
                          </button>
                          <button 
                            className="btn btn-sm btn-danger"
                            onClick={(e) => { e.stopPropagation(); handleRemoveStep(step.id); }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {selectedStep === step.id && tool && (
                        <div style={{ padding: '1rem', background: 'var(--background)', borderTop: '1px solid var(--border)' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Step Label</label>
                          <input 
                            type="text"
                            value={step.label}
                            onChange={e => setFormData(prev => ({
                              ...prev,
                              steps: prev.steps.map(s => s.id === step.id ? { ...s, label: e.target.value } : s)
                            }))}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}
                          />

                          {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                Parameter Mappings
                              </label>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem 0' }}>
                                Choose where each parameter comes from
                              </p>
                              
                              {Object.entries(tool.inputSchema.properties).map(([paramKey, paramDef]) => (
                                <div key={paramKey} style={{ marginBottom: '0.75rem' }}>
                                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                    <code>{paramKey}</code> 
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                                      {' '}({paramDef.type})
                                    </span>
                                    {paramDef.description && (
                                      <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                                        {' '}- {paramDef.description}
                                      </span>
                                    )}
                                  </label>
                                  <select
                                    value={getMappingSource(step.inputMappings?.[paramKey])}
                                    onChange={e => handleMappingChange(step.id, paramKey, e.target.value)}
                                    style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                                  >
                                    <option value="input">Claude Input (recommended)</option>
                                    <option value="literal">Fixed Value</option>
                                    {formData.steps.slice(0, index).length > 0 && (
                                      <option value="previous">Previous Step Result</option>
                                    )}
                                  </select>
                                  
                                  {getMappingSource(step.inputMappings?.[paramKey]) === 'literal' && (
                                    <input 
                                      type="text"
                                      placeholder="Enter fixed value"
                                      value={step.inputMappings?.[paramKey]?.value || ''}
                                      onChange={e => handleMappingChange(step.id, paramKey, 'literal', e.target.value)}
                                      style={{ 
                                        width: '100%', 
                                        padding: '0.4rem', 
                                        borderRadius: '4px', 
                                        border: '1px solid var(--border)',
                                        marginTop: '0.25rem',
                                        fontSize: '0.85rem'
                                      }}
                                    />
                                  )}
                                  
                                  {getMappingSource(step.inputMappings?.[paramKey]) === 'input' && (
                                    <input 
                                      type="text"
                                      placeholder="Input parameter name (e.g., issueKey)"
                                      value={step.inputMappings?.[paramKey]?.key || ''}
                                      onChange={e => handleMappingChange(step.id, paramKey, 'input', e.target.value)}
                                      style={{ 
                                        width: '100%', 
                                        padding: '0.4rem', 
                                        borderRadius: '4px', 
                                        border: '1px solid var(--border)',
                                        marginTop: '0.25rem',
                                        fontSize: '0.85rem'
                                      }}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {(!tool.inputSchema?.properties || Object.keys(tool.inputSchema.properties).length === 0) && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                              This tool has no parameters - it will be called with no inputs.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompositeToolBuilder;
