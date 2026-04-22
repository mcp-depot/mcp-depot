import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function SessionContexts() {
  const { token } = useAuth();
  const [contexts, setContexts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContexts();
  }, []);

  const loadContexts = async () => {
    setLoading(true);
    try {
      const data = await api.get('/session-contexts', token);
      setContexts(data || []);
    } catch (err) {
      console.error('Failed to fetch contexts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name) => {
    if (!confirm(`Delete context "${name}"?`)) return;
    try {
      await api.delete(`/session-contexts/${encodeURIComponent(name)}`, token);
      setSelected(null);
      loadContexts();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <div className="page-container">
      <h1>Session Contexts</h1>
      <p className="page-subtitle">
        Named context snapshots stored by AI sessions. Read by other sessions to skip re-diagnosis.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : contexts.length === 0 ? (
        <p className="empty-state">No contexts stored yet. Ask Claude to store a context.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Creator</th>
              <th>Updated</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contexts.map(ctx => (
              <tr key={ctx.id} onClick={() => setSelected(ctx)} className="clickable-row">
                <td><code>{ctx.name}</code></td>
                <td>{ctx.creator?.username ?? '-'}</td>
                <td>{ctx.updatedAt ? new Date(ctx.updatedAt).toLocaleDateString() : '-'}</td>
                <td>{ctx.content?.length ?? 0} chars</td>
                <td>
                  <button
                    className="btn-danger btn-sm"
                    onClick={(e) => { e.stopPropagation(); handleDelete(ctx.name); }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <h2>{selected.name}</h2>
            <div className="modal-meta">
              <span>By {selected.creator?.username ?? 'unknown'}</span>
              <span>Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-'}</span>
            </div>
            <pre className="context-preview">{selected.content}</pre>
            <button className="btn-secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionContexts;