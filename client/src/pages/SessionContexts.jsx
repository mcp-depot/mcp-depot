import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Layers, Globe, Lock, Trash2, Share2, MessageSquare } from 'lucide-react';
import MarkdownRenderer from '../components/MarkdownRenderer';
import api from '../services/api';

function expiryInfo(ctx, now) {
  if (ctx.ttlHours == null || ctx.ttlHours === 0) return { label: 'Pinned', urgency: 'pinned' };
  const expiresAt = new Date(ctx.updatedAt).getTime() + ctx.ttlHours * 3600000;
  const msLeft = expiresAt - now;
  if (msLeft <= 0) return { label: 'Expired', urgency: 'urgent' };
  const hLeft = msLeft / 3600000;
  if (hLeft < 1) {
    const mLeft = Math.ceil(msLeft / 60000);
    return { label: `${mLeft}m`, urgency: 'urgent' };
  }
  if (hLeft < 24) {
    const h = Math.floor(hLeft);
    const m = Math.floor((hLeft - h) * 60);
    return { label: `${h}h ${m}m`, urgency: 'soon' };
  }
  const d = Math.floor(hLeft / 24);
  const h = Math.floor(hLeft % 24);
  return { label: `${d}d ${h}h`, urgency: 'ok' };
}

function SessionContexts() {
  const { token, user } = useAuth();
  const [contexts, setContexts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

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
      await api.patch(`/session-contexts/${encodeURIComponent(name)}/share`, { shared: !currentShared });
      loadContexts();
      if (selected?.name === name) {
        setSelected(s => ({ ...s, isShared: !currentShared }));
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to toggle share');
    }
  };

  const handleUpdateTtl = async (name, ttlHours) => {
    try {
      await api.patch(`/session-contexts/${encodeURIComponent(name)}`, { ttlHours });
      loadContexts();
      if (selected?.name === name) {
        setSelected(s => ({ ...s, ttlHours: ttlHours === 0 ? null : ttlHours }));
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update TTL');
    }
  };

  const isOwner = (ctx) => ctx.createdBy === user?.id || ctx.createdBy == null;

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
          <MessageSquare size={48} className="empty-state-icon" />
          <h3>No contexts yet</h3>
          <p>From your AI session, call <code>store-session-context</code> with a name and content.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Visibility</th>
              <th>Expires</th>
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
                <td onClick={e => e.stopPropagation()}>
                  {isOwner(ctx) ? (
                    <>
                      <span className={`expiry-${expiryInfo(ctx, now).urgency}`} style={{ marginRight: '6px' }}>
                        {expiryInfo(ctx, now).label}
                      </span>
                      <select
                        className="input-sm"
                        value={ctx.ttlHours == null || ctx.ttlHours === 0 ? -1 : ctx.ttlHours}
                        onChange={e => {
                          e.stopPropagation();
                          const val = parseInt(e.target.value);
                          handleUpdateTtl(ctx.name, val === -1 ? 0 : val);
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value={-1}>Pin permanent</option>
                        <option value={24}>1 day</option>
                        <option value={168}>7 days</option>
                        <option value={720}>30 days</option>
                        <option value={2160}>90 days</option>
                      </select>
                    </>
                  ) : (
                    <span className={`expiry-${expiryInfo(ctx, now).urgency}`}>
                      {expiryInfo(ctx, now).label}
                    </span>
                  )}
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
                <span className={`badge ${selected.isShared ? 'badge-green' : 'badge-muted'}`}>
                  {selected.isShared ? 'Shared' : 'Private'}
                </span>
                <span>Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-'}</span>
                <span>{selected.content?.length ?? 0} chars</span>
              </div>
              <div className="markdown-body">
                <MarkdownRenderer content={selected.content} />
              </div>
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