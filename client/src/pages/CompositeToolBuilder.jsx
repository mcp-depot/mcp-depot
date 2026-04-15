import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Play, Save, ChevronRight, Zap } from 'lucide-react';

const SOURCE_TYPES = {
  INPUT: 'input',
  STEP: 'step',
  EXPRESSION: 'expression',
  LITERAL: 'literal'
};

/** Convert a mapping object → the combined option value used by the select */
function getMappingSourceKey(mapping) {
  if (!mapping || !mapping.source) return '';
  if (mapping.source === SOURCE_TYPES.INPUT)      return `input:${mapping.key || ''}`;
  if (mapping.source === SOURCE_TYPES.STEP)       return `step:${mapping.stepId || ''}::${mapping.extractName || ''}`;
  if (mapping.source === SOURCE_TYPES.EXPRESSION) return 'expression';
  if (mapping.source === SOURCE_TYPES.LITERAL)    return 'literal';
  return '';
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
  const [newInputName,        setNewInputName]        = useState('');
  const [showAddInput,        setShowAddInput]        = useState(false);

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

  /* ── Steps ───────────────────────────────────────────────────────────── */

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
    const params = tool.endpoint?.params || {};
    Object.keys(params).forEach(key => {
      inputMappings[key] = { source: SOURCE_TYPES.INPUT, key };
    });
    handleStepChange(stepId, 'toolId', toolId);
    handleStepChange(stepId, 'inputMappings', inputMappings);
  };

  /* ── Mappings ────────────────────────────────────────────────────────── */

  const handleMappingChange = (stepId, paramKey, source, value) => {
    const step = formData.steps.find(s => s.id === stepId);
    if (!step) return;

    let mappingValue;
    switch (source) {
      case SOURCE_TYPES.INPUT:
        mappingValue = { source: SOURCE_TYPES.INPUT, key: value };
        break;
      case SOURCE_TYPES.STEP: {
        const [stepIdRef, extractName] = value.split('::');
        mappingValue = { source: SOURCE_TYPES.STEP, stepId: stepIdRef, extractName: extractName || '' };
        break;
      }
      case SOURCE_TYPES.EXPRESSION:
        mappingValue = { source: SOURCE_TYPES.EXPRESSION, value };
        break;
      case SOURCE_TYPES.LITERAL:
        mappingValue = { source: SOURCE_TYPES.LITERAL, value };
        break;
      default:
        return;
    }

    handleStepChange(stepId, 'inputMappings', { ...step.inputMappings, [paramKey]: mappingValue });
  };

  /** Called when the combined source selector changes */
  const handleSourceSelect = (stepId, paramKey, val) => {
    if (!val) return;
    if (val.startsWith('input:'))  { handleMappingChange(stepId, paramKey, SOURCE_TYPES.INPUT,      val.slice(6)); return; }
    if (val.startsWith('step:'))   { handleMappingChange(stepId, paramKey, SOURCE_TYPES.STEP,       val.slice(5)); return; }
    if (val === 'expression')      { handleMappingChange(stepId, paramKey, SOURCE_TYPES.EXPRESSION, ''); return; }
    if (val === 'literal')         { handleMappingChange(stepId, paramKey, SOURCE_TYPES.LITERAL,    ''); return; }
  };

  /* ── Extractors ──────────────────────────────────────────────────────── */

  const handleAddExtractor = (stepId) => {
    const step         = formData.steps.find(s => s.id === stepId);
    const newExtractor = { name: '', arrayPath: '', filterField: 'name', filterValue: '', selectField: 'id' };
    handleStepChange(stepId, 'extractors', [...(step.extractors || []), newExtractor]);
  };

  const handleExtractorChange = (stepId, index, field, value) => {
    const step        = formData.steps.find(s => s.id === stepId);
    if (!step) return;
    const newExtractors  = [...(step.extractors || [])];
    newExtractors[index] = { ...newExtractors[index], [field]: value };
    handleStepChange(stepId, 'extractors', newExtractors);
  };

  const handleRemoveExtractor = (stepId, index) => {
    const step       = formData.steps.find(s => s.id === stepId);
    if (!step) return;
    const newExtractors = [...(step.extractors || [])];
    newExtractors.splice(index, 1);
    handleStepChange(stepId, 'extractors', newExtractors);
  };

  /* ── Inputs (outer schema) ───────────────────────────────────────────── */

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

  /* ── Save / Test ─────────────────────────────────────────────────────── */

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

  const handleTest = async () => {
    const inputKeys = Object.keys(formData.inputSchema.properties || {});
    const inputs    = {};

    for (const key of inputKeys) {
      // eslint-disable-next-line no-alert
      const value = window.prompt(`Value for "${key}":`);
      if (value === null) return;
      inputs[key] = value;
    }

    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const token  = localStorage.getItem('accessToken');
      let toolId   = id;

      if (!isEditing) {
        const saveRes = await fetch('/api/integrations/composite', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ ...formData, integrationId: selectedIntegration || formData.integrationId })
        });
        if (!saveRes.ok) throw new Error((await saveRes.json()).error || 'Failed to save before test');
        const saved = await saveRes.json();
        toolId      = saved.id;
      }

      const res    = await fetch(`/api/integrations/composite/${toolId}/test`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ inputs })
      });
      setTestResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  /* ── Render helpers ──────────────────────────────────────────────────── */

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
  const previousSteps         = formData.steps.slice(0, formData.steps.findIndex(s => s.id === selectedStep));

  return (
    <div className="composite-builder">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="composite-builder__header">
        <button className="btn-icon" onClick={() => navigate(-1)} title="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="composite-builder__title">
          <Zap size={18} className="composite-builder__title-icon" />
          <h2>{isEditing ? 'Edit Composite Tool' : 'New Composite Tool'}</h2>
        </div>
        <div className="composite-builder__actions">
          <button
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={testing || formData.steps.length < 2}
            title={formData.steps.length < 2 ? 'Add at least 2 steps to test' : 'Run the chain with test inputs'}
          >
            <Play size={14} />
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={14} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* ── 3-panel body ────────────────────────────────────────────────── */}
      <div className="composite-builder__body">

        {/* LEFT: basic info + steps */}
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

            <div className="cb-steps-list">
              {formData.steps.map((step, idx) => {
                const stepTool = availableTools.find(t => (t.id || t._id) === step.toolId);
                return (
                  <div
                    key={step.id}
                    className={`cb-step-card ${selectedStep === step.id ? 'cb-step-card--active' : ''}`}
                    onClick={() => setSelectedStep(step.id)}
                  >
                    <span className="cb-step-card__num">{idx + 1}</span>
                    <div className="cb-step-card__body">
                      <input
                        className="cb-step-card__label"
                        type="text"
                        value={step.label}
                        onChange={e => handleStepChange(step.id, 'label', e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <span className="cb-step-card__tool">
                        {stepTool ? stepTool.name : <em>No tool selected</em>}
                      </span>
                    </div>
                    <button
                      className="btn-icon btn-danger cb-step-card__del"
                      title="Remove step"
                      onClick={e => { e.stopPropagation(); handleRemoveStep(step.id); }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              className="btn btn-secondary btn-block"
              onClick={handleAddStep}
              disabled={!activeIntegrationId}
              title={!activeIntegrationId ? 'Select an integration first' : undefined}
            >
              <Plus size={14} /> Add Step
            </button>
          </section>
        </aside>

        {/* CENTRE: step detail */}
        <main className="composite-builder__main">
          {selectedStepData ? (
            <div className="cb-step-detail">
              <h4 className="cb-section__title cb-step-detail__heading">
                Configure: {selectedStepData.label}
              </h4>

              {/* Tool selector */}
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
                  {/* Input mappings */}
                  <div className="form-group">
                    <label>Input Mappings</label>
                    <p className="cb-hint-text">Map each parameter to a source value</p>
                    {Object.keys(selectedTool.endpoint?.params || {}).length === 0 ? (
                      <p className="cb-hint-text">This tool has no parameters</p>
                    ) : (
                      <div className="cb-mapping-list">
                        {Object.entries(selectedTool.endpoint?.params || {}).map(([key]) => {
                          const mapping       = selectedStepData.inputMappings?.[key] || {};
                          const sourceKey     = getMappingSourceKey(mapping);
                          const needsValue    = mapping.source === SOURCE_TYPES.EXPRESSION
                                             || mapping.source === SOURCE_TYPES.LITERAL;

                          return (
                            <div key={key} className="cb-mapping-row">
                              <span className="cb-mapping-row__param" title={key}>{key}</span>
                              <div className="cb-mapping-row__controls">
                                <select
                                  className="cb-mapping-row__source"
                                  value={sourceKey}
                                  onChange={e => handleSourceSelect(selectedStep, key, e.target.value)}
                                >
                                  <option value="">— select source —</option>
                                  {Object.keys(formData.inputSchema.properties || {}).length > 0 && (
                                    <optgroup label="Claude Inputs">
                                      {Object.keys(formData.inputSchema.properties).map(inp => (
                                        <option key={inp} value={`input:${inp}`}>{inp}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {previousSteps.map(s => (
                                    <optgroup key={s.id} label={`Step: ${s.label}`}>
                                      <option value={`step:${s.id}::`}>{s.label} (full response)</option>
                                      {(s.extractors || []).map(ex => ex.name && (
                                        <option key={ex.name} value={`step:${s.id}::${ex.name}`}>
                                          {s.label} → {ex.name}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                  <optgroup label="Manual">
                                      <option value="expression">Expression  {"{{inputs.x}}"}</option>
                                    <option value="literal">Literal value</option>
                                  </optgroup>
                                </select>

                                {needsValue && (
                                  <input
                                    className="cb-mapping-row__value"
                                    type="text"
                                    placeholder={
                                      mapping.source === SOURCE_TYPES.EXPRESSION
                                        ? '{{inputs.x}} or {{steps.step_1.extract.name}}'
                                        : 'Fixed value'
                                    }
                                    value={mapping.value || ''}
                                    onChange={e => handleMappingChange(
                                      selectedStep, key, mapping.source, e.target.value
                                    )}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Extractors */}
                  <div className="form-group">
                    <div className="cb-section-row">
                      <label>Response Extractors</label>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleAddExtractor(selectedStep)}
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                    <p className="cb-hint-text">
                      Extract a value from an array in this step's response so later steps can reference it
                    </p>
                    {(selectedStepData.extractors || []).length === 0 ? (
                      <p className="cb-empty-hint">No extractors — add one if this step returns an array</p>
                    ) : (
                      <div className="cb-extractor-list">
                        {(selectedStepData.extractors || []).map((ext, idx) => (
                          <div key={idx} className="cb-extractor-card">
                            <div className="cb-extractor-card__header">
                              <input
                                type="text"
                                className="cb-extractor-card__name"
                                placeholder="Name  (e.g. transitionId)"
                                value={ext.name}
                                onChange={e => handleExtractorChange(selectedStep, idx, 'name', e.target.value)}
                              />
                              <button
                                className="btn-icon btn-danger"
                                onClick={() => handleRemoveExtractor(selectedStep, idx)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                              <label>Array path in response</label>
                              <input
                                type="text"
                                placeholder="e.g.  transitions"
                                value={ext.arrayPath}
                                onChange={e => handleExtractorChange(selectedStep, idx, 'arrayPath', e.target.value)}
                              />
                            </div>
                            <div className="cb-extractor-filter">
                              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label>Filter field</label>
                                <input
                                  type="text"
                                  placeholder="name"
                                  value={ext.filterField}
                                  onChange={e => handleExtractorChange(selectedStep, idx, 'filterField', e.target.value)}
                                />
                              </div>
                              <span className="cb-extractor-filter__eq">=</span>
                              <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                                <label>Filter value</label>
                                <input
                                  type="text"
                                  placeholder="In Progress  or  {{inputs.targetStatus}}"
                                  value={ext.filterValue}
                                  onChange={e => handleExtractorChange(selectedStep, idx, 'filterValue', e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="form-group" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                              <label>Extract field</label>
                              <input
                                type="text"
                                placeholder="id"
                                value={ext.selectField}
                                onChange={e => handleExtractorChange(selectedStep, idx, 'selectField', e.target.value)}
                              />
                            </div>
                            {ext.name && (
                              <p className="cb-extractor-card__ref">
                                Reference in later steps: <code>{'{{'}steps.{selectedStepData.id}.extract.{ext.name}{'}}'}</code>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
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

        {/* RIGHT: Claude inputs */}
        <aside className="composite-builder__right">
          <section className="cb-section">
            <h4 className="cb-section__title">Claude Inputs</h4>
            <p className="cb-hint-text">
              These are the parameters Claude provides when calling this tool.
              Reference them in mappings as <code>{'{{inputs.name}}'}</code>
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

          {/* Quick reference */}
          <section className="cb-section">
            <h4 className="cb-section__title">Template Reference</h4>
            <div className="cb-reference">
              <div className="cb-reference__row">
                <code>{'{{inputs.name}}'}</code>
                <span>Claude input</span>
              </div>
              <div className="cb-reference__row">
                <code>{'{{steps.step_1.response.field}}'}</code>
                <span>Step response field</span>
              </div>
              <div className="cb-reference__row">
                <code>{'{{steps.step_1.extract.name}}'}</code>
                <span>Named extraction</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* ── Test results modal ───────────────────────────────────────────── */}
      {testResult && (
        <div className="cb-test-overlay" onClick={() => setTestResult(null)}>
          <div className="cb-test-modal" onClick={e => e.stopPropagation()}>
            <div className="cb-test-modal__header">
              <h3>Test Results</h3>
              <span className="cb-test-modal__duration">
                {testResult.totalDurationMs}ms total
              </span>
            </div>

            {testResult.error ? (
              <div className="cb-test-error">
                <strong>Failed:</strong> {testResult.error}
                {testResult.failedStepLabel && (
                  <p>Step: <em>{testResult.failedStepLabel}</em></p>
                )}
              </div>
            ) : (
              <div className="cb-trace-list">
                {(testResult.trace || testResult.steps || []).map((step, idx) => (
                  <div key={idx} className={`cb-trace-step ${step.success === false ? 'cb-trace-step--error' : 'cb-trace-step--ok'}`}>
                    <div className="cb-trace-step__head">
                      <span className="cb-trace-step__num">{idx + 1}</span>
                      <strong>{step.label}</strong>
                      <span className="cb-trace-step__ms">{step.durationMs}ms</span>
                    </div>
                    {step.error && <p className="cb-trace-step__err">{step.error}</p>}
                    {step.resolvedInputs && (
                      <details>
                        <summary>Resolved inputs</summary>
                        <pre>{JSON.stringify(step.resolvedInputs, null, 2)}</pre>
                      </details>
                    )}
                    {step.extractions && Object.keys(step.extractions).length > 0 && (
                      <details>
                        <summary>Extractions</summary>
                        <pre>{JSON.stringify(step.extractions, null, 2)}</pre>
                      </details>
                    )}
                    {step.response && (
                      <details>
                        <summary>Response</summary>
                        <pre>{JSON.stringify(step.response, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                ))}
                {testResult.result && (
                  <details className="cb-trace-final">
                    <summary>Final result</summary>
                    <pre>{JSON.stringify(testResult.result, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}

            <div className="cb-test-modal__footer">
              <button className="btn btn-secondary" onClick={() => setTestResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompositeToolBuilder;
