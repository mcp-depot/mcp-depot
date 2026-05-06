import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function Personas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', systemPrompt: '', description: '', isShared: false });
  const [viewingPersona, setViewingPersona] = useState(null);

  useEffect(() => {
    fetchPersonas();
  }, []);

  const fetchPersonas = async () => {
    try {
      const res = await api.get('/personas');
      setPersonas(res.data || []);
    } catch (err) {
      console.error('Failed to fetch personas:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/personas', {
        name: form.name,
        role: form.role,
        systemPrompt: form.systemPrompt,
        description: form.description,
        isShared: form.isShared
      });
      setShowModal(false);
      setEditingPersona(null);
      resetForm();
      fetchPersonas();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save persona');
    }
  };

  const resetForm = () => {
    setForm({ name: '', role: '', systemPrompt: '', description: '', isShared: false });
  };

  const openEdit = (persona) => {
    setEditingPersona(persona);
    setForm({
      name: persona.name,
      role: persona.role,
      systemPrompt: persona.systemPrompt,
      description: persona.description || '',
      isShared: persona.isShared
    });
    setShowModal(true);
  };

  const handleDelete = async (name) => {
    if (!confirm('Delete this persona?')) return;
    try {
      await api.delete(`/personas/${name}`);
      fetchPersonas();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete persona');
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Agent Personas</h1>
          <p style={{ color: '#8899aa', margin: '0.5rem 0 0' }}>Named system prompt roles for any MCP client</p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          + New Persona
        </button>
      </div>

      {personas.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem' }}>👤</div>
          <h3>No personas yet</h3>
          <p style={{ maxWidth: '500px', margin: '0 auto', color: '#8899aa' }}>
            Create personas for recurring roles like Security Reviewer, Code Reviewer, or Documentation Writer.
          </p>
        </div>
      ) : (
        <div className="grid">
          {personas.map(p => (
            <div className="card skill-card" key={p.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewingPersona(p)}>
                  <h3 style={{ margin: '0 0 0.25rem' }}>{p.role}</h3>
                  <div style={{ fontSize: '0.75rem', color: '#8899aa', marginBottom: '0.5rem' }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <p style={{ color: '#8899aa', fontSize: '0.85rem', margin: 0 }}>{p.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '1rem' }}>
                  {p.isShared && <span className="badge badge-success">Shared</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-small btn-secondary" onClick={() => setViewingPersona(p)}>View</button>
                <button className="btn btn-small btn-secondary" onClick={() => openEdit(p)}>Edit</button>
                <button className="btn btn-small btn-danger" onClick={() => handleDelete(p.name)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingPersona && (
        <div className="modal-overlay" onClick={() => setViewingPersona(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>{viewingPersona.role}</h2>
              <button className="modal-close" onClick={() => setViewingPersona(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#8899aa', margin: '0 0 1rem' }}>{viewingPersona.name}{viewingPersona.isShared && ' · Shared'}</p>
              {viewingPersona.description && <p style={{ marginBottom: '1rem' }}>{viewingPersona.description}</p>}
              <pre style={{ background: '#1a1a2e', padding: '1rem', borderRadius: '8px', whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6' }}>
                {viewingPersona.systemPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingPersona(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>{editingPersona ? 'Edit Persona' : 'New Persona'}</h2>
              <button className="modal-close" onClick={() => { setShowModal(false); setEditingPersona(null); }}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div>
                    <label>Key</label>
                    <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="security-reviewer" required />
                  </div>
                  <div>
                    <label>Display Name</label>
                    <input className="form-control" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Security Reviewer" required />
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label>Description</label>
                  <input className="form-control" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Reviews code for security vulnerabilities" />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label>System Prompt</label>
                  <textarea className="form-control" rows="8" value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} placeholder="You are a security expert..." required />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} />
                    Share with all team members
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingPersona(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Personas;
