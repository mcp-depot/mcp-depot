import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MarkdownRenderer from '../components/MarkdownRenderer';
import api from '../services/api';
import TagInput from '../components/TagInput';
import { getApiError } from '../utils/apiError';

function stripMarkdown(text = '', maxLength = 120) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, maxLength) + (text.length > maxLength ? '\u2026' : '');
}

function Skills() {
  const { user } = useAuth();
  const [customSkills, setCustomSkills] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', prompt: '', outputFormat: 'text', isShared: false, tags: [] });
  const [formInputs, setFormInputs] = useState([{ name: '', label: '', type: 'string', required: false, placeholder: '' }]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [inputValues, setInputValues] = useState({});
  const [testingSkill, setTestingSkill] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);

  useEffect(() => {
    fetchCustomSkills();
  }, []);

  const fetchCustomSkills = async () => {
    try {
      const res = await api.get('/skills');
      setCustomSkills(res.data || []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        description: form.description,
        inputs: formInputs.filter(i => i.name),
        prompt: form.prompt,
        outputFormat: form.outputFormat,
        isShared: form.isShared,
        tags: form.tags
      };
      
      if (editingSkill) {
        await api.put(`/skills/${editingSkill.id}`, payload);
      } else {
        await api.post('/skills', payload);
      }
      
      setShowModal(false);
      setEditingSkill(null);
      resetForm();
      fetchCustomSkills();
    } catch (err) {
      alert(getApiError(err));
    }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', prompt: '', outputFormat: 'text', isShared: false, tags: [] });
    setFormInputs([{ name: '', label: '', type: 'string', required: false, placeholder: '' }]);
  };

  const openEdit = (skill) => {
    setEditingSkill(skill);
    setForm({ 
      name: skill.name, 
      description: skill.description || '', 
      prompt: skill.prompt || '',
      outputFormat: skill.outputFormat || 'text',
      isShared: skill.isShared || false,
      tags: skill.tags || []
    });
    setFormInputs(skill.inputs?.length ? skill.inputs : [{ name: '', label: '', type: 'string', required: false, placeholder: '' }]);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this skill?')) return;
    try {
      await api.delete(`/skills/${id}`);
      fetchCustomSkills();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const generatePrompt = (templateId, values) => {
    const template = customSkills.find(t => t.id === templateId);
    if (!template) return '';
    
    let prompt = template.prompt;
    Object.entries(values).forEach(([key, value]) => {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      prompt = prompt.replace(placeholder, value || '');
      
      const conditionalStart = new RegExp(`\\{\\{#${key}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
      prompt = prompt.replace(conditionalStart, (match, content) => {
        return (value && String(value).trim()) ? content : '';
      });
      
      const conditionalInverse = new RegExp(`\\{\\{\\^{${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
      prompt = prompt.replace(conditionalInverse, (match, content) => {
        return (!value || !String(value).trim()) ? content : '';
      });
    });
    return prompt;
  };

  const testSkill = async (skillId, values) => {
    setTestingSkill(true);
    setTestResult(null);
    try {
      const res = await api.post(`/skills/${skillId}/invoke`, { inputs: values });
      setTestResult({ success: true, data: res.data });
    } catch (err) {
      setTestResult({ success: false, error: `Failed to invoke skill: ${getApiError(err)}` });
    } finally {
      setTestingSkill(false);
    }
  };

  const allSkills = customSkills.map(s => ({ ...s, isCustom: true }));
  const allTags = [...new Set(customSkills.flatMap(s => s.tags || []).filter(Boolean))].sort();
  const filteredSkills = selectedTag ? allSkills.filter(s => s.tags && s.tags.includes(selectedTag)) : allSkills;

  return (
    <div>
      <div className="container">
        <div className="page-header">
          <div>
            <h1>Skills</h1>
            <p>Create parameterized skills that AI assistants can invoke directly</p>
          </div>
          <button className="btn btn-primary" onClick={() => { resetForm(); setEditingSkill(null); setShowModal(true); }}>
            + Create Skill
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Filter by tag:</span>
          {allTags.length > 0 ? allTags.map(tag => (
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
            )) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>No tags yet</span>
            )}
            {selectedTag && <button onClick={() => setSelectedTag(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>}
          </div>

        {selectedSkill ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2>{selectedSkill.name}</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{selectedSkill.description}</p>
              </div>
              <button className="btn btn-secondary" onClick={() => { setSelectedSkill(null); setInputValues({}); setTestResult(null); }}>Back</button>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <span className="badge" style={{ background: 'var(--primary)', color: 'white' }}>
                {selectedSkill.outputFormat || 'text'}
              </span>
              {selectedSkill.isShared && (
                <span className="badge" style={{ background: 'var(--success)', color: 'white' }}>
                  Shared
                </span>
              )}
              <span className="badge">
                {selectedSkill.inputs?.length || 0} input(s)
              </span>
            </div>

            <div style={{ display: 'grid', gap: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', marginBottom: '1rem' }}>
              {selectedSkill.inputs?.map((input, idx) => (
                <div key={idx} className="form-group" style={{ margin: 0 }}>
                  <label>{input.label} {input.required && <span style={{color: 'var(--danger)'}}>*</span>}</label>
                  <input 
                    type="text"
                    value={inputValues[input.name] || ''}
                    onChange={e => setInputValues({ ...inputValues, [input.name]: e.target.value })}
                    placeholder={input.placeholder || `Enter ${input.label}`}
                  />
                </div>
              ))}
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Rendered Prompt:</label>
              <div style={{ position: 'relative', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1rem', background: 'var(--surface-hover)' }}>
                <MarkdownRenderer content={generatePrompt(selectedSkill.id, inputValues)} />
                <button 
                  className="btn btn-primary btn-small"
                  style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
                  onClick={() => navigator.clipboard.writeText(generatePrompt(selectedSkill.id, inputValues))}
                >
                  Copy
                </button>
              </div>
            </div>

            {selectedSkill.isCustom && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => testSkill(selectedSkill.id, inputValues)}
                  disabled={testingSkill}
                >
                  {testingSkill ? 'Testing...' : 'Test Skill'}
                </button>
              </div>
            )}

            {testResult && (
              <div style={{ marginTop: '1rem' }}>
                {testResult.success ? (
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Result:</label>
                    <pre style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', maxHeight: '300px', overflow: 'auto', fontSize: '0.85rem' }}>
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="error-message">{testResult.error}</div>
                )}
              </div>
            )}

            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>How to use</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                Connect to MCP Depot via MCP. Use the <code>list-skills</code> tool to see all available skills, then use <code>get-skill "{selectedSkill.name}"</code> to install it locally in your AI assistant.
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Once installed, the skill will be available as <code>/{selectedSkill.name}</code> and your AI can use it directly.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {filteredSkills.map((skill, idx) => (
              <div key={idx} className="card" style={{ cursor: 'pointer' }} onClick={() => { setSelectedSkill(skill); setInputValues({}); setTestResult(null); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{skill.name}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{skill.description}</p>
                    {skill.prompt && (
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem', lineClamp: 2, WebkitLineClamp: 2, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical' }}>
                        {stripMarkdown(skill.prompt, 100)}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  <span className="badge">{skill.outputFormat || 'text'}</span>
                  {skill.isShared && <span className="badge" style={{ background: 'var(--success)', color: 'white' }}>Shared</span>}
                  <span className="badge">{skill.inputs?.length || 0} inputs</span>
                  {skill.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {skill.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{ background: 'var(--primary)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem' }}>{tag}</span>
                      ))}
                      {skill.tags.length > 3 && <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>+{skill.tags.length - 3}</span>}
                    </div>
                  )}
                </div>
                {skill.isCustom && (
                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.75rem' }}>
                    <button className="btn btn-ghost btn-small" onClick={(e) => { e.stopPropagation(); openEdit(skill); }}>Edit</button>
                    <button className="btn btn-ghost btn-small" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); handleDelete(skill.id); }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '650px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSkill ? 'Edit Skill' : 'Create Skill'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Name *</label>
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g., Standup Update" />
                  </div>
                  <div className="form-group">
                    <label>Output Format</label>
                    <select value={form.outputFormat} onChange={e => setForm({ ...form, outputFormat: e.target.value })}>
                      <option value="text">Text</option>
                      <option value="json">JSON</option>
                      <option value="markdown">Markdown</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does this skill do?" />
                </div>
                <div className="form-group">
                  <label>Tags</label>
                  <TagInput tags={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder="Add tag..." />
                </div>
                <div className="form-group">
                  <label>Inputs</label>
                  {formInputs.map((input, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input type="text" placeholder="Variable name" value={input.name} onChange={e => { const newInputs = [...formInputs]; newInputs[idx].name = e.target.value; setFormInputs(newInputs); }} />
                      <input type="text" placeholder="Label" value={input.label} onChange={e => { const newInputs = [...formInputs]; newInputs[idx].label = e.target.value; setFormInputs(newInputs); }} />
                      <select value={input.type} onChange={e => { const newInputs = [...formInputs]; newInputs[idx].type = e.target.value; setFormInputs(newInputs); }} style={{ fontSize: '0.85rem' }}>
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => setFormInputs(formInputs.filter((_, i) => i !== idx))}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setFormInputs([...formInputs, { name: '', label: '', type: 'string', required: false, placeholder: '' }])}>+ Add Input</button>
                </div>
                <div className="form-group">
                  <label>Prompt Template *</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Use <code>{'{{variableName}}'}</code> for inputs, <code>{'{{#var}}content{{/var}}'}</code> for conditional sections
                  </p>
                  <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} required style={{ minHeight: '150px', fontFamily: 'monospace' }} placeholder={`Write a standup update for {{project}} in a {{tone}} tone.`} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} />
                    Share with team members
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingSkill ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Skills;
