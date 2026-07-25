import { useState, useEffect, useId, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Modal } from '../components/Modal';
import { ArrowLeft, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';
import { formatDateTime } from '../utils/date';
import { getApiError } from '../utils/apiError';
import { confirmDialog } from '../utils/confirm';

function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', role: 'member' });
  const [submitting, setSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState(null);
  const emailId = useId();

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/groups/${id}`);
      setGroup(res.data);
    } catch (err) {
      showError(`Failed to load group: ${getApiError(err)}`);
      if (err.response?.status === 404) navigate('/groups');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  // Server-computed and authoritative (same canManageGroup() the API uses
  // to actually gate every mutation below) - deriving this client-side
  // from currentUser.role would drift the moment someone is granted
  // manage_others via a group- or user-scoped policy rule instead of being
  // a full system admin, showing the wrong controls for what the API will
  // really allow.
  const canManage = !!group?.canManage;
  const adminCount = group?.members?.filter(m => m.role === 'admin').length || 0;

  const openAdd = () => {
    setAddForm({ email: '', role: 'member' });
    setShowAddModal(true);
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post(`/groups/${id}/members`, addForm);
      setGroup({ ...group, members: [...group.members, res.data] });
      showSuccess('Member added');
      setShowAddModal(false);
    } catch (err) {
      showError(`Failed to add member: ${getApiError(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRole = async (member) => {
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    setBusyUserId(member.userId);
    try {
      const res = await api.patch(`/groups/${id}/members/${member.userId}`, { role: newRole });
      setGroup({ ...group, members: group.members.map(m => m.userId === member.userId ? { ...m, role: res.data.role } : m) });
    } catch (err) {
      showError(`Failed to update member: ${getApiError(err)}`);
    } finally {
      setBusyUserId(null);
    }
  };

  const removeMember = async (member) => {
    const ok = await confirmDialog(`Remove ${member.user?.email || 'this member'} from ${group.name}?`, { danger: true, confirmLabel: 'Remove' });
    if (!ok) return;
    setBusyUserId(member.userId);
    try {
      await api.delete(`/groups/${id}/members/${member.userId}`);
      setGroup({ ...group, members: group.members.filter(m => m.userId !== member.userId) });
      showSuccess('Member removed');
    } catch (err) {
      showError(`Failed to remove member: ${getApiError(err)}`);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteGroup = async () => {
    const ok = await confirmDialog(`Delete group "${group.name}"? This removes all its memberships and any policy rules referencing it will stop matching.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/groups/${id}`);
      showSuccess('Group deleted');
      navigate('/groups');
    } catch (err) {
      showError(`Failed to delete group: ${getApiError(err)}`);
    }
  };

  if (loading) return <div className="container"><div className="loading-overlay"><div className="spinner"></div></div></div>;
  if (!group) return null;

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <Link to="/groups" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-light)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <ArrowLeft size={14} /> Back to Groups
          </Link>
          <h1>{group.name}</h1>
          {group.description && <p className="page-subtitle">{group.description}</p>}
        </div>
        {canManage && (
          <button className="btn btn-danger" onClick={handleDeleteGroup}>
            <Trash2 size={16} /> Delete Group
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1rem 0' }}>
          <h3 style={{ margin: 0 }}>Members</h3>
          {canManage && (
            <button className="btn btn-small btn-primary" onClick={openAdd}>
              <Plus size={14} /> Add Member
            </button>
          )}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
              {canManage && <th style={{ width: '160px' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {group.members.map(member => (
              <tr key={member.id}>
                <td>{member.user?.name || '-'}</td>
                <td>{member.user?.email || '-'}</td>
                <td>
                  <span className={`badge ${member.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                    {member.role === 'admin' && <ShieldCheck size={12} style={{ marginRight: '0.25rem', verticalAlign: 'text-bottom' }} />}
                    {member.role}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem' }}>{formatDateTime(member.createdAt)}</td>
                {canManage && (
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => toggleRole(member)}
                        disabled={busyUserId === member.userId || (member.role === 'admin' && adminCount <= 1)}
                        title={member.role === 'admin' && adminCount <= 1 ? 'Cannot demote the last remaining group admin' : ''}
                      >
                        {member.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => removeMember(member)}
                        disabled={busyUserId === member.userId || (member.role === 'admin' && adminCount <= 1)}
                        title={member.role === 'admin' && adminCount <= 1 ? 'Cannot remove the last remaining group admin' : 'Remove'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <Modal
          title="Add Member"
          onClose={() => setShowAddModal(false)}
          size="sm"
          footer={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button type="submit" form="add-member-form" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add'}
              </button>
            </>
          )}
        >
          <form id="add-member-form" onSubmit={handleAddMember}>
            <div className="form-group">
              <label htmlFor={emailId}>Email</label>
              <input id={emailId} type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} required autoFocus />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={addForm.role === 'admin'}
                onChange={e => setAddForm({ ...addForm, role: e.target.checked ? 'admin' : 'member' })}
                style={{ width: 'auto' }}
              />
              <label style={{ marginBottom: 0 }}>Add as group admin</label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default GroupDetail;
