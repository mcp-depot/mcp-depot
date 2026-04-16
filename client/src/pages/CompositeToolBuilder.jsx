import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, ChevronRight, Zap, Play, GripVertical } from 'lucide-react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SourceTree, DraggableField, InputDropTarget } from '../components/SourceTree';

const SOURCE_TYPES = {
  INPUT: 'input',
  STEP: 'step',
  EXPRESSION: 'expression',
  LITERAL: 'literal'
};

function getMappingSourceKey(mapping) {
  if (!mapping || !mapping.source) return '';
  if (mapping.source === SOURCE_TYPES.INPUT)      return `input:${mapping.key || ''}`;
  if (mapping.source === SOURCE_TYPES.STEP)       return `step:${mapping.stepId || ''}::${mapping.extractName || ''}`;
  if (mapping.source === SOURCE_TYPES.EXPRESSION) return 'expression';
  if (mapping.source === SOURCE_TYPES.LITERAL)    return 'literal';
  return '';
}

function SortableStep({ step, index, isSelected, onClick, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cb-step-card ${isSelected ? 'cb-step-card--active' : ''}`}
      onClick={onClick}
    >
      <span {...attributes} {...listeners} style={{ cursor: 'grab' }}>
        <GripVertical size={14} style={{ opacity: 0.5 }} />
      </span>
      <span className="cb-step-card__num">{index + 1}</span>
      <div className="cb-step-card__body">
        <input
          className="cb-step-card__label"
          type="text"
          value={step.label}
          onChange={(e) => {}}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <button
        className="btn-icon btn-danger btn-small"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove step"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
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
  const [stepTestResults,     setStepTestResults]    = useState([]);
  const [error,               setError]              = useState(null);
  const [selectedStep,        setSelectedStep]        = useState(null);
  const [selectedIntegration, setSelectedIntegration] = useState(integrationIdParam);
  const [integrations,        setIntegrations]        = useState([]);
  const [newInputName,        setNewInputName]        = useState('');
  const [showAddInput,        setShowAddInput]        = useState(false);
  const [testParams,          setTestParams]          = useState({});
  const [showExtractorModal,  setShowExtractorModal]  = useState(false);
  const [extractorDraft,     setExtractorDraft]      = useState({});
  const [draggedField,       setDraggedField]        = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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

  const handleAddStep = () => {
    const newStep = {
      id:            `step_${Date.now()}`,
      label:         `Step ${formData.steps.length + 1}`,
      toolId:        '',
      inputMappings: {},
      extractors:    []
    };
    setFormData(prev => ({ ...prev, steps: [...prev.steps, newStep] }));
    setSelectedStep(newStep.id);
  };

  const handleRemoveStep = (stepId) => {
    setFormData(prev => ({ ...prev, steps: prev.steps.filter(s => s.id !== stepId) }));
    if (selectedStep === stepId) setSelectedStep(null);
  };

  const handleStepChange = (stepId, field, value) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === stepId ? { ...s, [field]: value } : s)
    }));
  };

  const handleToolSelect = (stepId, toolId) => {
    const tool = availableTools.find(t => (t.id || t._id) === toolId);
    if (!tool) return;
    const inputMappings = {};
    const params = tool.inputSchema?.properties || {};
    Object.keys(params).forEach(key => {
      inputMappings[key] = { source: SOURCE_TYPES.INPUT, key };
    });
    handleStepChange(stepId, 'toolId', toolId);
    handleStepChange(stepId, 'inputMappings', inputMappings);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setDraggedField(null);
    
    if (!over) return;
    
    const draggedData = active.data.current;
    if (!draggedData) return;
    
    const [type, paramKey] = over.id.split('-');
    if (type !== 'input') return;
    
    let mapping;
    if (draggedData.path.startsWith('inputs.')) {
      const inputKey = draggedData.path.replace('inputs.', '');
      mapping = { source: SOURCE_TYPES.INPUT, key: inputKey };
    } else if (draggedData.path.startsWith('steps.')) {
      const parts = draggedData.path.split('.');
      const stepId = parts[1];
      const isExtract = parts[2] === 'extract';
      if (isExtract) {
        const extractName = parts[3];
        mapping = { source: SOURCE_TYPES.STEP, stepId, extractName };
      } else {
        mapping = { source: SOURCE_TYPES.STEP, stepId, extractName: '' };
      }
    }
    
    if (mapping) {
      handleStepChange(selectedStep, 'inputMappings', {
        ...formData.steps.find(s => s.id === selectedStep)?.inputMappings,
        [paramKey]: mapping
      });
    }
  };

  const handleDragStart = (event) => {
    const draggedData = event.active.data.current;
    setDraggedField(draggedData);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token  = localStorage.getItem('accessToken');
      const url    = isEditing ? `/api/integrations/composite/${id}` : '/api/integrations/composite';
      const method = isEditing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ ...formData, integrationId: selectedIntegration || formData.integrationId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStepTest = async (step) => {
    const stepTool = availableTools.find(t => (t.id || t._id) === step.toolId);
    if (!stepTool) return;

    const params = {};
    for (const [key, mapping] of Object.entries(step.inputMappings || {})) {
      if (mapping.source === SOURCE_TYPES.INPUT) {
        params[key] = testParams[key] || `{{inputs.${mapping.key}}}`;
      } else if (mapping.source === SOURCE_TYPES.LITERAL) {
        params[key] = mapping.value;
      }
    }

    setTesting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const toolId = stepTool.id || stepTool._id;
      const res = await fetch(`/api/consume/tools/${toolId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ params })
      });
      const data = await res.json();
      
      setStepTestResults(prev => {
        const updated = prev.filter(r => r.id !== step.id);
        return [...updated, { ...step, response: data.data || data, extractions: {} }];
      });
    } catch (err) {
      setStepTestResults(prev => {
        const updated = prev.filter(r => r.id !== step.id);
        return [...updated, { ...step, response: { error: err.message }, extractions: {} }];
      });
    } finally {
      setTesting(false);
    }
  };

  const handleInputAdd = () => {
    const name = newInputName.trim();
    if (!name) return;
    setFormData(prev => ({
      ...prev,
      inputSchema: {
        ...prev.inputSchema,
        properties: { ...prev.inputSchema.properties, [name]: { type: 'string', description: '' } }
      }
    }));
    setNewInputName('');
    setShowAddInput(false);
  };

  const handleInputRemove = (name) => {
    setFormData(prev => {
      const newProps = { ...prev.inputSchema.properties };
      delete newProps[name];
      return {
        ...prev,
        inputSchema: {
          ...prev.inputSchema,
          properties: newProps,
          required:   prev.inputSchema.required.filter(r => r !== name)
        }
      };
    });
  };

  const toggleRequired = (name) => {
    setFormData(prev => {
      const isRequired = prev.inputSchema.required.includes(name);
      return {
        ...prev,
        inputSchema: {
          ...prev.inputSchema,
          required: isRequired
            ? prev.inputSchema.required.filter(r => r !== name)
            : [...prev.inputSchema.required, name]
        }
      };
    });
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  const activeIntegrationId   = selectedIntegration || formData.integrationId;
  const selectedStepData      = formData.steps.find(s => s.id === selectedStep);
  const selectedTool          = selectedStepData
    ? availableTools.find(t => (t.id || t._id) === selectedStepData.toolId)
    : null;
  const previousSteps         = stepTestResults.filter(r => 
    formData.steps.slice(0, formData.steps.findIndex(s => s.id === selectedStep)).map(s => s.id).includes(r.id)
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="composite-builder">
        <div className="composite-builder__header">
          <button className="btn-icon" onClick={() => navigate(-1)} title="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="composite-builder__title">
            <Zap size={18} className="composite-builder__title-icon" />
            <h2>{isEditing ? 'Edit Composite Tool' : 'New Composite Tool'}</h2>
          </div>
          <div className="composite-builder__actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="composite-builder__body">
          <aside className="composite-builder__sidebar">
            <section className="cb-section">
              <h4 className="cb-section__title">Basic Info</h4>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Set Jira Status"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What does this composite tool do?"
                  rows={2}
                />
              </div>
              {!isEditing && (
                <div className="form-group">
                  <label>Integration</label>
                  <select
                    value={selectedIntegration}
                    onChange={e => handleIntegrationChange(e.target.value)}
                  >
                    <option value="">Select integration…</option>
                    {integrations.map(int => (
                      <option key={int._id || int.id} value={int._id || int.id}>{int.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            <section className="cb-section">
              <h4 className="cb-section__title">
                Steps
                <span className="cb-badge">{formData.steps.length}</span>
              </h4>

              {formData.steps.length === 0 && (
                <p className="cb-empty-hint">Add steps to chain API calls together</p>
              )}

              <SortableContext items={formData.steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {formData.steps.map((step, idx) => (
                  <SortableStep
                    key={step.id}
                    step={step}
                    index={idx}
                    isSelected={selectedStep === step.id}
                    onClick={() => setSelectedStep(step.id)}
                    onRemove={() => handleRemoveStep(step.id)}
                  />
                ))}
              </SortableContext>

              <button
                className="btn btn-secondary btn-block"
                onClick={handleAddStep}
                disabled={!activeIntegrationId}
              >
                <Plus size={14} /> Add Step
              </button>
            </section>
          </aside>

          <main className="composite-builder__main">
            {selectedStepData ? (
              <div className="cb-step-detail">
                <h4 className="cb-section__title cb-step-detail__heading">
                  Configure: {selectedStepData.label}
                </h4>

                <div className="form-group">
                  <label>Tool to call</label>
                  {availableTools.length === 0 ? (
                    <p className="cb-hint-text">No tools found for this integration</p>
                  ) : (
                    <select
                      value={selectedStepData.toolId}
                      onChange={e => handleToolSelect(selectedStep, e.target.value)}
                    >
                      <option value="">Choose a tool…</option>
                      {availableTools.map(tool => (
                        <option key={tool.id || tool._id} value={tool.id || tool._id}>
                          {tool.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedTool && (
                  <>
                    <div className="form-group">
                      <label>Input Mappings</label>
                      <p className="cb-hint-text">Drag fields from the right panel to map them here</p>
                      
                      {Object.entries(selectedTool.inputSchema?.properties || {}).map(([key, paramDef]) => {
                        const mapping = selectedStepData.inputMappings?.[key] || {};
                        return (
                          <InputDropTarget
                            key={key}
                            paramKey={key}
                            paramDef={paramDef}
                            currentMapping={mapping.source ? mapping : null}
                            onDrop={(data) => {
                              if (data.path.startsWith('inputs.')) {
                                const inputKey = data.path.replace('inputs.', '');
                                handleStepChange(selectedStep, 'inputMappings', {
                                  ...selectedStepData.inputMappings,
                                  [key]: { source: SOURCE_TYPES.INPUT, key: inputKey }
                                });
                              } else if (data.path.startsWith('steps.')) {
                                const parts = data.path.split('.');
                                const stepId = parts[1];
                                const extractName = parts[2] === 'extract' ? parts[3] : '';
                                handleStepChange(selectedStep, 'inputMappings', {
                                  ...selectedStepData.inputMappings,
                                  [key]: { source: SOURCE_TYPES.STEP, stepId, extractName }
                                });
                              }
                            }}
                          />
                        );
                      })}
                    </div>

                    <div className="form-group">
                      <div className="cb-section-row">
                        <label>Test This Step</label>
                      </div>
                      
                      <div style={{ 
                        padding: '1rem', 
                        background: 'var(--surface-hover)', 
                        borderRadius: '8px',
                        marginBottom: '0.5rem'
                      }}>
                        {Object.entries(selectedTool.inputSchema?.properties || {}).map(([key, paramDef]) => (
                          <div key={key} className="form-group" style={{ marginBottom: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem' }}>{key}</label>
                            <input
                              type="text"
                              value={testParams[key] || ''}
                              onChange={e => setTestParams(prev => ({ ...prev, [key]: e.target.value }))}
                              placeholder={`Enter test value for ${key}`}
                              style={{ fontSize: '0.85rem' }}
                            />
                          </div>
                        ))}
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleStepTest(selectedStepData)}
                          disabled={testing}
                        >
                          <Play size={14} /> {testing ? 'Testing...' : 'Run Step'}
                        </button>
                      </div>

                      {stepTestResults.find(r => r.id === selectedStepData.id) && (
                        <details open style={{ marginTop: '0.5rem' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.5rem' }}>
                            Test Result
                          </summary>
                          <div style={{ 
                            background: 'var(--background)', 
                            borderRadius: '8px', 
                            padding: '0.75rem',
                            maxHeight: '300px',
                            overflow: 'auto'
                          }}>
                            <pre style={{ 
                              fontSize: '0.8rem', 
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              margin: 0
                            }}>
                              {JSON.stringify(stepTestResults.find(r => r.id === selectedStepData.id)?.response, null, 2)}
                            </pre>
                          </div>
                        </details>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="cb-no-step">
                <ChevronRight size={40} />
                <p>Select a step on the left to configure it</p>
                {formData.steps.length === 0 && (
                  <p className="cb-no-step__sub">Start by adding a step below the steps list</p>
                )}
              </div>
            )}
          </main>

          <aside className="composite-builder__right">
            <section className="cb-section">
              <h4 className="cb-section__title">Available Fields</h4>
              <p className="cb-hint-text">Drag fields to the input mappings on the left</p>
              
              <SourceTree 
                inputs={formData.inputSchema.properties || {}} 
                stepResults={stepTestResults}
                stepId={selectedStep}
              />
            </section>

            <section className="cb-section">
              <h4 className="cb-section__title">Claude Inputs</h4>
              <p className="cb-hint-text">
                Parameters that Claude provides when calling this tool.
              </p>

              <div className="cb-input-list">
                {Object.entries(formData.inputSchema.properties || {}).map(([name, schema]) => (
                  <div key={name} className="cb-input-item">
                    <div className="cb-input-item__info">
                      <span className="cb-input-item__name">{name}</span>
                      <span className="cb-input-item__type">{schema.type}</span>
                    </div>
                    <div className="cb-input-item__actions">
                      <button
                        className={`cb-input-item__req ${formData.inputSchema.required.includes(name) ? 'cb-input-item__req--on' : ''}`}
                        title="Toggle required"
                        onClick={() => toggleRequired(name)}
                      >
                        {formData.inputSchema.required.includes(name) ? '★' : '☆'}
                      </button>
                      <button className="btn-icon btn-danger" onClick={() => handleInputRemove(name)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {showAddInput ? (
                <div className="cb-add-input-form">
                  <input
                    type="text"
                    placeholder="Input name  (e.g. issueId)"
                    value={newInputName}
                    onChange={e => setNewInputName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleInputAdd(); if (e.key === 'Escape') setShowAddInput(false); }}
                    autoFocus
                  />
                  <div className="cb-add-input-form__btns">
                    <button className="btn btn-primary btn-sm" onClick={handleInputAdd} disabled={!newInputName.trim()}>
                      Add
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddInput(false); setNewInputName(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-secondary btn-block" onClick={() => setShowAddInput(true)}>
                  <Plus size={14} /> Add Input
                </button>
              )}
            </section>

            <section className="cb-section">
              <h4 className="cb-section__title">Template Reference</h4>
              <div className="cb-reference">
                <div className="cb-reference__row">
                  <code>{'{{inputs.name}}'}</code>
                  <span>Claude input</span>
                </div>
                <div className="cb-reference__row">
                  <code>{'{{steps.step_1.extract.name}}'}</code>
                  <span>Extracted value</span>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <DragOverlay>
          {draggedField && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--primary)',
              color: 'white',
              borderRadius: '6px',
              fontSize: '0.85rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {draggedField.label}
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}

export default CompositeToolBuilder;
