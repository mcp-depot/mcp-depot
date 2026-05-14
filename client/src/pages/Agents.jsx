import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getApiError } from '../utils/apiError';

function Agents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', systemPrompt: '', description: '', isShared: false, tools: '', model: '' });
  const [viewingAgent, setViewingAgent] = useState(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await api.get('/agents');
      setAgents(res.data || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const toolsArray = form.tools
        ? form.tools.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      await api.post('/agents', {
        name: form.name,
        role: form.role,
        systemPrompt: form.systemPrompt,
        description: form.description,
        isShared: form.isShared,
        tools: toolsArray,
        model: form.model || null
      });
      setShowModal(false);
      setEditingAgent(null);
      resetForm();
      fetchAgents();
    } catch (err) {
      alert(getApiError(err));
    }
  };

  const resetForm = () => {
    setForm({ name: '', role: '', systemPrompt: '', description: '', isShared: false, tools: '', model: '' });
  };

  const openEdit = (agent) => {
    setEditingAgent(agent);
    const tools = agent.tools
      ? (Array.isArray(agent.tools) ? agent.tools.join(', ') : agent.tools)
      : '';
    setForm({
      name: agent.name,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      description: agent.description || '',
      isShared: agent.isShared,
      tools,
      model: agent.model || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (name) => {
    if (!confirm('Delete this agent?')) return;
    try {
      await api.delete(`/agents/${name}`);
      fetchAgents();
    } catch (err) {
      alert(getApiError(err));
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Agents</h1>
          <p style={{ color: '#8899aa', margin: '0.5rem 0 0' }}>Named agent personas with system prompts, tool constraints, and model config. Install into any MCP client.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          + New Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem' }}>🤖</div>
          <h3>No agents yet</h3>
          <p style={{ maxWidth: '500px', margin: '0 auto', color: '#8899aa' }}>
            Create agents for recurring roles like Security Reviewer, Code Reviewer, or Documentation Writer.
            Each agent can define tool constraints and a preferred model.
          </p>
        </div>
      ) : (
        <div className="grid">
          {agents.map(a => (
            <div className="card skill-card" key={a.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewingAgent(a)}>
                  <h3 style={{ margin: '0 0 0.25rem' }}>{a.role}</h3>
                  <div style={{ fontSize: '0.75rem', color: '#8899aa', marginBottom: '0.5rem' }}>
                    {a.name}
                  </div>
                  {a.description && (
                    <p style={{ color: '#8899aa', fontSize: '0.85rem', margin: 0 }}>{a.description}</p>
                  )}
                  {(a.tools || a.model) && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      {a.tools && Array.isArray(a.tools) && a.tools.length > 0 && (
                        <span className="badge badge-info">{a.tools.length} tool{a.tools.length !== 1 ? 's' : ''}</span>
                      )}
                      {a.model && <span className="badge badge-warning">{a.model}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '1rem' }}>
                  {a.isShared && <span className="badge badge-success">Shared</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-small btn-secondary" onClick={() => setViewingAgent(a)}>View</button>
                <button className="btn btn-small btn-secondary" onClick={() => openEdit(a)}>Edit</button>
                <button className="btn btn-small btn-danger" onClick={() => handleDelete(a.name)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingAgent && (
        <div className="modal-overlay" onClick={() => setViewingAgent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>{viewingAgent.role}</h2>
              <button className="modal-close" onClick={() => setViewingAgent(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#8899aa', margin: '0 0 1rem' }}>{viewingAgent.name}{viewingAgent.isShared && ' · Shared'}</p>
              {viewingAgent.description && <p style={{ marginBottom: '1rem' }}>{viewingAgent.description}</p>}
              {viewingAgent.tools && Array.isArray(viewingAgent.tools) && viewingAgent.tools.length > 0 && (
                <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#8899aa' }}>
                  <strong>Tools:</strong> {viewingAgent.tools.join(', ')}
                </p>
              )}
              {viewingAgent.model && (
                <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#8899aa' }}>
                  <strong>Model:</strong> {viewingAgent.model}
                </p>
              )}
              <pre style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: '8px', whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text)' }}>
                {viewingAgent.systemPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingAgent(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>{editingAgent ? 'Edit Agent' : 'New Agent'}</h2>
              <button className="modal-close" onClick={() => { setShowModal(false); setEditingAgent(null); }}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Key</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="security-reviewer" required />
                  </div>
                  <div className="form-group">
                    <label>Display Name</label>
                    <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Security Reviewer" required />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label>Description</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Reviews code for security vulnerabilities" />
                </div>
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label>System Prompt</label>
                  <textarea rows="8" value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} placeholder="You are a security expert..." required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <div className="form-group">
                    <label>Tool Constraints (comma-separated)</label>
                    <input value={form.tools} onChange={e => setForm({ ...form, tools: e.target.value })} placeholder="read, grep, bash" />
                  </div>
                  <div className="form-group">
                    <label>Model (optional)</label>
                    <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="claude-opus-4-7" />
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'normal' }}>
                    <input type="checkbox" checked={form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} style={{ width: 'auto', margin: 0 }} />
                    Share with all team members
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingAgent(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Agents;
