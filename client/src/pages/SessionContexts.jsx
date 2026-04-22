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
    <div className="container">
      <div className="page-header">
        <h1>Session Contexts</h1>
        <p>Named context snapshots stored by AI sessions. Read by other sessions to skip re-diagnosis.</p>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : contexts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h3>No contexts yet</h3>
          <p>Ask Claude to store a context using <code>store-session-context</code>.</p>
        </div>
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
                    className="btn btn-sm btn-danger"
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.name}</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-meta">
                <span>By {selected.creator?.username ?? 'unknown'}</span>
                <span>Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-'}</span>
              </div>
              <pre>{selected.content}</pre>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionContexts;