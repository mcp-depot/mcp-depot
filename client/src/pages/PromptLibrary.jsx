import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Navbar from '../components/Navbar';

const defaultTemplates = [
  {
    id: 'full-cycle',
    name: 'Full Development Cycle',
    description: 'JIRA → Confluence → Jenkins → JIRA with auto-retry',
    inputs: [
      { name: 'jiraTicket', label: 'JIRA Ticket ID', type: 'text', required: true, placeholder: 'PROJ-123' },
      { name: 'confluenceSpace', label: 'Confluence Space Key', type: 'text', required: false, placeholder: 'e.g., DEV' },
      { name: 'confluenceTitle', label: 'Confluence Page Title', type: 'text', required: false, placeholder: 'Implementation Notes' },
      { name: 'jenkinsJob', label: 'Jenkins Job Name', type: 'text', required: false, placeholder: 'PR-build' },
      { name: 'finalStatus', label: 'Final Status', type: 'select', required: false, options: ['Done', 'Code Review', 'In Progress'] }
    ],
    prompt: `Using MCPConnect tools, please:
1. Fetch JIRA ticket {{jiraTicket}} and show me the description
2. {{#confluenceTitle}}Fetch Confluence page "{{confluenceTitle}}" from space "{{confluenceSpace}}"{{/confluenceTitle}}{{^confluenceTitle}}Skip Confluence (no page title provided){{/confluenceTitle}}
3. Start working on the implementation for {{jiraTicket}}
4. After I implement the changes, trigger Jenkins job "{{jenkinsJob}}"
5. Wait for the build to complete
6. If build is SUCCESS: Post "✅ Build successful!" comment and transition to {{finalStatus}}
7. If build is FAILURE: Get build logs, post "❌ Build failed" comment, and wait for me to fix and push again
8. Repeat steps 4-7 until build is successful (max 5 attempts)`
  },
  {
    id: 'jira-only',
    name: 'JIRA Only',
    description: 'Fetch, comment, and transition JIRA ticket',
    inputs: [
      { name: 'jiraTicket', label: 'JIRA Ticket ID', type: 'text', required: true, placeholder: 'PROJ-123' },
      { name: 'comment', label: 'Comment', type: 'text', required: false, placeholder: 'Starting implementation' },
      { name: 'status', label: 'Status', type: 'select', required: false, options: ['Done', 'In Progress', 'Code Review'] }
    ],
    prompt: `Using MCPConnect JIRA tools, please:
1. Fetch JIRA ticket {{jiraTicket}}
2. {{#comment}}Add comment "{{comment}}"{{/comment}}
3. Transition to {{status}}`
  },
  {
    id: 'jenkins-only',
    name: 'Jenkins Only',
    description: 'Trigger job and wait for result',
    inputs: [
      { name: 'jobName', label: 'Job Name', type: 'text', required: true, placeholder: 'PR-build' }
    ],
    prompt: `Using MCPConnect Jenkins tools, please:
1. Trigger Jenkins job "{{jobName}}"
2. Poll for build status every 10 seconds
3. Report the final result (SUCCESS/FAILURE)
4. If FAILED, get the console output and report the error`
  },
  {
    id: 'github-commit',
    name: 'GitHub Commit & Push',
    description: 'Stage, commit and push changes',
    inputs: [
      { name: 'message', label: 'Commit Message', type: 'text', required: true, placeholder: 'Fix bug' }
    ],
    prompt: `Using MCPConnect GitHub tools, please:
1. Show me the current git status
2. Stage all changes
3. Create a commit with message "{{message}}"
4. Push to remote`
  }
];

function PromptLibrary() {
  const { user } = useAuth();
  const [customPrompts, setCustomPrompts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', template: 'custom', prompt: '' });
  const [formInputs, setFormInputs] = useState([{ name: '', label: '', type: 'text', required: false, placeholder: '' }]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [inputValues, setInputValues] = useState({});

  useEffect(() => {
    fetchCustomPrompts();
  }, []);

  const fetchCustomPrompts = async () => {
    try {
      const res = await api.get('/prompt-library');
      setCustomPrompts(res.data || []);
    } catch (err) {
      console.error('Failed to fetch prompts:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        description: form.description,
        template: form.template,
        inputs: formInputs.filter(i => i.name),
        prompt: form.prompt
      };
      
      if (editingPrompt) {
        await api.put(`/prompt-library/${editingPrompt.id}`, payload);
      } else {
        await api.post('/prompt-library', payload);
      }
      
      setShowModal(false);
      setEditingPrompt(null);
      resetForm();
      fetchCustomPrompts();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save prompt');
    }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', template: 'custom', prompt: '' });
    setFormInputs([{ name: '', label: '', type: 'text', required: false, placeholder: '' }]);
  };

  const openEdit = (prompt) => {
    setEditingPrompt(prompt);
    setForm({ name: prompt.name, description: prompt.description || '', template: prompt.template || 'custom', prompt: prompt.prompt || '' });
    setFormInputs(prompt.inputs || [{ name: '', label: '', type: 'text', required: false, placeholder: '' }]);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this prompt?')) return;
    try {
      await api.delete(`/prompt-library/${id}`);
      fetchCustomPrompts();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const generatePrompt = (templateId, values) => {
    const template = defaultTemplates.find(t => t.id === templateId) || customPrompts.find(t => t.id === templateId);
    if (!template) return '';
    
    let prompt = template.prompt;
    Object.entries(values).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    });
    return prompt;
  };

  const allPrompts = [...defaultTemplates, ...customPrompts];

  return (
    <div>
      <Navbar />
      <div className="container">
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1>Prompt Library</h1>
              <p>Create and manage prompts for AI assistants</p>
            </div>
            <button className="btn btn-primary" onClick={() => { resetForm(); setEditingPrompt(null); setShowModal(true); }}>
              + Create Prompt
            </button>
          </div>
        </div>

        {selectedPrompt ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>{selectedPrompt.name}</h2>
              <button className="btn btn-secondary" onClick={() => { setSelectedPrompt(null); setInputValues({}); }}>Back</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{selectedPrompt.description}</p>
            
            <div style={{ display: 'grid', gap: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', marginBottom: '1rem' }}>
              {selectedPrompt.inputs?.map((input, idx) => (
                <div key={idx} className="form-group" style={{ margin: 0 }}>
                  <label>{input.label} {input.required && '*'}</label>
                  {input.type === 'select' ? (
                    <select value={inputValues[input.name] || ''} onChange={e => setInputValues({ ...inputValues, [input.name]: e.target.value })}>
                      <option value="">Select...</option>
                      {input.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input 
                      type="text"
                      value={inputValues[input.name] || ''}
                      onChange={e => setInputValues({ ...inputValues, [input.name]: e.target.value })}
                      placeholder={input.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Generated Prompt:</label>
              <div style={{ position: 'relative' }}>
                <textarea 
                  readOnly
                  value={generatePrompt(selectedPrompt.id, inputValues)}
                  style={{ width: '100%', minHeight: '250px', padding: '1rem', fontSize: '0.85rem', fontFamily: 'monospace', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--background)', color: 'var(--text)' }}
                />
                <button 
                  className="btn btn-primary btn-small"
                  style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
                  onClick={() => navigator.clipboard.writeText(generatePrompt(selectedPrompt.id, inputValues))}
                >
                  📋 Copy
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {allPrompts.map((prompt, idx) => (
              <div key={idx} className="card" style={{ cursor: 'pointer' }} onClick={() => { setSelectedPrompt(prompt); setInputValues({}); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{prompt.name}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{prompt.description}</p>
                  </div>
                  {prompt.id.startsWith('custom-') && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-ghost btn-small" onClick={(e) => { e.stopPropagation(); openEdit(prompt); }}>Edit</button>
                      <button className="btn btn-ghost btn-small" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); handleDelete(prompt.id); }}>Delete</button>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'var(--surface-hover)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {prompt.inputs?.length || 0} input(s) required
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPrompt ? 'Edit Prompt' : 'Create Prompt'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Inputs</label>
                  {formInputs.map((input, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input type="text" placeholder="Variable name" value={input.name} onChange={e => { const newInputs = [...formInputs]; newInputs[idx].name = e.target.value; setFormInputs(newInputs); }} style={{ flex: 1 }} />
                      <input type="text" placeholder="Label" value={input.label} onChange={e => { const newInputs = [...formInputs]; newInputs[idx].label = e.target.value; setFormInputs(newInputs); }} style={{ flex: 1 }} />
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => setFormInputs(formInputs.filter((_, i) => i !== idx))}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setFormInputs([...formInputs, { name: '', label: '', type: 'text', required: false, placeholder: '' }])}>+ Add Input</button>
                </div>
                <div className="form-group">
                  <label>Prompt Template *</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Use {{variableName}} for inputs</p>
                  <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} required style={{ minHeight: '150px', fontFamily: 'monospace' }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingPrompt ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PromptLibrary;
