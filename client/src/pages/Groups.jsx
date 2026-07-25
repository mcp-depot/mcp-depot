import { useState, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Modal } from '../components/Modal';
import { Users2, Plus } from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';
import { formatDateTime } from '../utils/date';
import { getApiError } from '../utils/apiError';

function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const nameId = useId();
  const descId = useId();

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
    } catch (err) {
      showError(`Failed to fetch groups: ${getApiError(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  const openCreate = () => {
    setForm({ name: '', description: '' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/groups', form);
      setGroups([res.data, ...groups]);
      showSuccess('Group created');
      setShowModal(false);
    } catch (err) {
      showError(`Failed to create group: ${getApiError(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users2 size={20} /> Groups
          </h1>
          <p className="page-subtitle">Share resources with a named set of people instead of one user at a time</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} /> New Group
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <tr key={group.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link to={`/groups/${group.id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                      {group.name}
                    </Link>
                  </td>
                  <td style={{ color: 'var(--text-light)' }}>{group.description || '-'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{formatDateTime(group.createdAt)}</td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No groups yet - create one to share resources with a team</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal
          title="New Group"
          onClose={() => setShowModal(false)}
          size="sm"
          footer={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" form="group-form" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </>
          )}
        >
          <form id="group-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor={nameId}>Name</label>
              <input id={nameId} type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor={descId}>Description</label>
              <textarea id={descId} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default Groups;
