import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function SessionContexts() {
  const { token, user } = useAuth();
  const [contexts, setContexts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContexts();
  }, []);

  const loadContexts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/session-contexts', token);
      const data = Array.isArray(res) ? res : (res?.data || res?.contexts || []);
      setContexts(data);
    } catch (err) {
      console.error('Failed to fetch contexts:', err);
      setContexts([]);
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

  const handleToggleShare = async (name, currentShared) => {
    try {
      await api.patch(`/session-contexts/${encodeURIComponent(name)}/share`, token, { shared: !currentShared });
      loadContexts();
      if (selected?.name === name) {
        setSelected(s => ({ ...s, isShared: !currentShared }));
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to toggle share');
    }
  };

  const isOwner = (ctx) => ctx.createdBy === user?.id;

  return (
    <div className="container">
      <div className="page-header">
        <h1>Session Contexts</h1>
        <p>Named context snapshots stored by AI sessions. Private by default — share to make visible to teammates.</p>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : contexts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h3>No contexts yet</h3>
          <p>From your AI session, call <code>store-session-context</code> with a name and content.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Visibility</th>
              <th>Updated</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contexts.map(ctx => (
              <tr key={ctx.id} onClick={() => setSelected(ctx)} className="clickable-row">
                <td><code>{ctx.name}</code></td>
                <td>
                  <span className={`badge ${ctx.isShared ? 'badge-green' : 'badge-muted'}`}>
                    {ctx.isShared ? 'Shared' : 'Private'}
                  </span>
                </td>
                <td>{ctx.updatedAt ? new Date(ctx.updatedAt).toLocaleDateString() : '-'}</td>
                <td>{ctx.content?.length ?? 0} chars</td>
                <td onClick={e => e.stopPropagation()}>
                  {isOwner(ctx) && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleToggleShare(ctx.name, ctx.isShared)}
                      >
                        {ctx.isShared ? 'Unshare' : 'Share'}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(ctx.name)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
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
                <span>{selected.isShared ? '🌐 Shared' : '🔒 Private'}</span>
                <span>Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-'}</span>
                <span>{selected.content?.length ?? 0} chars</span>
              </div>
              <pre>{selected.content}</pre>
            </div>
            <div className="modal-footer">
              {isOwner(selected) && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleToggleShare(selected.name, selected.isShared)}
                  >
                    {selected.isShared ? 'Make Private' : 'Share with team'}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(selected.name)}>Delete</button>
                </>
              )}
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionContexts;