import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { BookOpen, Plus, Edit3, Trash2, Globe, Lock, Send } from 'lucide-react';

function Prompts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', prompt: '', isShared: false });
  const [formInputs, setFormInputs] = useState([{ name: '', description: '', type: 'string', required: false, default: '' }]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [testArgs, setTestArgs] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPrompts(); }, []);

  const fetchPrompts = async () => {
    try {
      const res = await api.get('/prompt-library');
      setPrompts(res.data || []);
    } catch (err) {
      console.error('Failed to fetch prompts:', err);
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
        inputs: formInputs.filter(i => i.name),
        prompt: form.prompt,
        isShared: form.isShared
      };
      if (editingPrompt) {
        await api.put(`/prompt-library/${editingPrompt.id}`, payload);
      } else {
        await api.post('/prompt-library', payload);
      }
      setShowModal(false);
      setEditingPrompt(null);
      resetForm();
      fetchPrompts();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save prompt');
    }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', prompt: '', isShared: false });
    setFormInputs([{ name: '', description: '', type: 'string', required: false, default: '' }]);
  };

  const openEdit = (prompt) => {
    setEditingPrompt(prompt);
    setForm({ name: prompt.name, description: prompt.description || '', prompt: prompt.prompt || '', isShared: prompt.isShared || false });
    setFormInputs(prompt.inputs?.length ? prompt.inputs : [{ name: '', description: '', type: 'string', required: false, default: '' }]);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this prompt?')) return;
    try {
      await api.delete(`/prompt-library/${id}`);
      fetchPrompts();
    } catch (err) {
      alert('Failed to delete prompt');
    }
  };

  const openTest = (prompt) => {
    setSelectedPrompt(prompt);
    const args = {};
    (prompt.inputs || []).forEach(inp => {
      if (inp.default != null) args[inp.name] = inp.default;
    });
    setTestArgs(args);
    setTestResult(null);
  };

  const runTest = async () => {
    try {
      const res = await api.post('/prompt-library/test', {
        id: selectedPrompt.id,
        args: testArgs
      });
      setTestResult(res.data.rendered);
    } catch (err) {
      setTestResult('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={24} /> Prompts
          </h1>
          <p className="page-subtitle">MCP Prompts — named, parameterised prompt templates for any MCP client</p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setEditingPrompt(null); setShowModal(true); }}>
          <Plus size={16} /> New Prompt
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading prompts...</div>
      ) : prompts.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} style={{ color: '#999' }} />
          <h3>No prompts yet</h3>
          <p>Create a named prompt template with variable slots. MCP clients can call prompts/list and prompts/get to retrieve them.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Create your first prompt
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {prompts.map(p => (
            <div key={p.id} className="card" onClick={() => openTest(p)} style={{ cursor: 'pointer' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BookOpen size={16} style={{ color: '#666' }} />
                  <strong>{p.name}</strong>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {p.isShared ? <Globe size={14} style={{ color: '#4caf50' }} /> : <Lock size={14} style={{ color: '#999' }} />}
                  <button className="btn-icon" onClick={e => { e.stopPropagation(); openEdit(p); }}><Edit3 size={14} /></button>
                  <button className="btn-icon btn-icon-danger" onClick={e => { e.stopPropagation(); handleDelete(p.id); }}><Trash2 size={14} /></button>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#888', margin: '0.5rem 0 0' }}>{p.description || 'No description'}</p>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.5rem' }}>
                {(p.inputs || []).length} input(s) · {p.outputFormat || 'text'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPrompt ? 'Edit Prompt' : 'New Prompt'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Name</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="summarise_issue" required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Summarise a Jira issue" />
                </div>
                <div className="form-group">
                  <label>Template
                    <span className="help-text" style={{ marginLeft: 8, color: '#999', fontWeight: 'normal', fontSize: '0.85em' }}>
                      Use {'{{variable}}'} syntax for substitution
                    </span>
                  </label>
                  <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} rows={8} placeholder="You are summarising Jira issue {{issueKey}} for a {{audience}}..." required />
                </div>
                <div className="form-group">
                  <label>Inputs (variables)</label>
                  {formInputs.map((inp, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input type="text" placeholder="Name" value={inp.name} onChange={e => { const u = [...formInputs]; u[i] = { ...u[i], name: e.target.value }; setFormInputs(u); }} style={{ flex: 1 }} />
                      <input type="text" placeholder="Description" value={inp.description} onChange={e => { const u = [...formInputs]; u[i] = { ...u[i], description: e.target.value }; setFormInputs(u); }} style={{ flex: 2 }} />
                      <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={inp.required} onChange={e => { const u = [...formInputs]; u[i] = { ...u[i], required: e.target.checked }; setFormInputs(u); }} /> Required
                      </label>
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setFormInputs(f => f.length > 1 ? [...f.slice(0, i), ...f.slice(i + 1)] : f)}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary" onClick={() => setFormInputs(f => [...f, { name: '', description: '', type: 'string', required: false, default: '' }])}>+ Add input</button>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ margin: 0 }}>
                    <input type="checkbox" checked={form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} />
                  </label>
                  <span style={{ fontSize: '0.9rem' }}>Share with all users</span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingPrompt ? 'Update' : 'Create'} Prompt</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Modal */}
      {selectedPrompt && (
        <div className="modal-overlay" onClick={() => setSelectedPrompt(null)}>
          <div className="modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Test: {selectedPrompt.name}</h2>
              <button className="modal-close" onClick={() => setSelectedPrompt(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1rem' }}>{selectedPrompt.description || ''}</p>
              {(selectedPrompt.inputs || []).filter(i => i.name).map(inp => (
                <div key={inp.name} className="form-group">
                  <label>{inp.name}{inp.required ? ' *' : ''}</label>
                  <input type="text" value={testArgs[inp.name] || ''} onChange={e => setTestArgs(a => ({ ...a, [inp.name]: e.target.value }))} placeholder={inp.description || inp.name} />
                </div>
              ))}
              <button className="btn btn-primary" onClick={runTest} style={{ marginTop: '0.5rem' }}>
                <Send size={14} /> Render Prompt
              </button>
              {testResult && (
                <pre style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', fontSize: '0.85rem', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
                  {testResult}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Prompts;
