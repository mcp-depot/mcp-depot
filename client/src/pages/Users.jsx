import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Users as UsersIcon, Users2, Plus, Trash2, RotateCcw, X } from 'lucide-react';
import { StyledSelect } from '../components/StyledSelect';
import { showSuccess, showError } from '../utils/toast';
import { formatDate } from '../utils/date';
import { getApiError } from '../utils/apiError';
import { confirmDialog } from '../utils/confirm';
import { useModalA11y } from '../hooks/useModalA11y';
import { useId } from 'react';

function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [credentialInfo, setCredentialInfo] = useState(null);
  const [form, setForm] = useState({ email: '', name: '', role: 'user', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [resetting, setResetting] = useState(false);
  const formTitleId = useId();
  const formModalRef = useModalA11y(() => setShowModal(false), showModal);
  const resetTitleId = useId();
  const resetModalRef = useModalA11y(() => setShowResetModal(false), showResetModal);
  const credentialTitleId = useId();
  const credentialModalRef = useModalA11y(() => setCredentialInfo(null), !!credentialInfo);
  const [groupsUser, setGroupsUser] = useState(null);
  const [userGroups, setUserGroups] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupToAdd, setGroupToAdd] = useState(null);
  const [addAsGroupAdmin, setAddAsGroupAdmin] = useState(false);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const groupsTitleId = useId();
  const groupsModalRef = useModalA11y(() => setGroupsUser(null), !!groupsUser);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      showError('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        const res = await api.put(`/users/${editingUser.id}`, form);
        setUsers(users.map(u => u.id === editingUser.id ? res.data : u));
        showSuccess('User updated');
      } else {
        const res = await api.post('/users', form);
        setUsers([...users, res.data]);
        if (res.data.temporaryPassword) {
          setTempPassword(res.data.temporaryPassword);
          setShowModal(false);
          setCredentialInfo({ email: res.data.email, password: res.data.temporaryPassword });
        } else {
          showSuccess('User created');
        }
      }
      setShowModal(false);
      setEditingUser(null);
      setForm({ email: '', name: '', role: 'user', password: '' });
    } catch (err) {
      showError(`Failed to save user: ${getApiError(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user) => {
    const ok = await confirmDialog(`Delete user ${user.email}?`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    setDeletingId(user.id);
    try {
      await api.delete(`/users/${user.id}`);
      setUsers(users.filter(u => u.id !== user.id));
      showSuccess('User deleted');
    } catch (err) {
      showError(`Failed to delete user: ${getApiError(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleResetPassword = async () => {
    setResetting(true);
    try {
      const res = await api.post(`/users/${resetUser.id}/reset-password`);
      setTempPassword(res.data.temporaryPassword);
      setShowResetModal(false);
      setCredentialInfo({ email: resetUser.email, password: res.data.temporaryPassword });
    } catch (err) {
      showError(`Failed to reset password: ${getApiError(err)}`);
    } finally {
      setResetting(false);
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({ email: user.email, name: user.name, role: user.role, password: '' });
    setShowModal(true);
  };

  const openReset = (user) => {
    setResetUser(user);
    setShowResetModal(true);
  };

  const openGroups = async (user) => {
    setGroupsUser(user);
    setGroupToAdd(null);
    setAddAsGroupAdmin(false);
    setGroupsLoading(true);
    try {
      const [userGroupsRes, allGroupsRes] = await Promise.all([
        api.get('/groups', { params: { memberUserId: user.id } }),
        api.get('/groups')
      ]);
      setUserGroups(userGroupsRes.data);
      setAllGroups(allGroupsRes.data);
    } catch (err) {
      showError(`Failed to load groups: ${getApiError(err)}`);
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleAddToGroup = async (e) => {
    e.preventDefault();
    if (!groupToAdd) return;
    setGroupSubmitting(true);
    try {
      await api.post(`/groups/${groupToAdd.value}/members`, {
        userId: groupsUser.id,
        role: addAsGroupAdmin ? 'admin' : 'member'
      });
      const userGroupsRes = await api.get('/groups', { params: { memberUserId: groupsUser.id } });
      setUserGroups(userGroupsRes.data);
      setGroupToAdd(null);
      setAddAsGroupAdmin(false);
      showSuccess(`Added to ${groupToAdd.label}`);
    } catch (err) {
      showError(`Failed to add to group: ${getApiError(err)}`);
    } finally {
      setGroupSubmitting(false);
    }
  };

  const handleRemoveFromGroup = async (group) => {
    const ok = await confirmDialog(`Remove ${groupsUser.email} from "${group.name}"?`, { danger: true, confirmLabel: 'Remove' });
    if (!ok) return;
    try {
      await api.delete(`/groups/${group.id}/members/${groupsUser.id}`);
      setUserGroups(userGroups.filter(g => g.id !== group.id));
      showSuccess('Removed from group');
    } catch (err) {
      showError(`Failed to remove from group: ${getApiError(err)}`);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UsersIcon size={20} /> User Management
          </h1>
          <p className="page-subtitle">Manage user accounts and roles</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingUser(null); setForm({ email: '', name: '', role: 'user', password: '' }); setShowModal(true); }}>
          <Plus size={18} /> Add User
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Created</th>
                <th style={{ width: '190px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.name}</td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-small btn-secondary" onClick={() => openEdit(user)}>Edit</button>
                      <button className="btn btn-small btn-secondary" onClick={() => openGroups(user)} title="Manage Groups">
                        <Users2 size={14} />
                      </button>
                      <button className="btn btn-small btn-secondary" onClick={() => openReset(user)} title="Reset Password">
                        <RotateCcw size={14} />
                      </button>
                      {user.id !== currentUser?.id && (
                        <button className="btn btn-small btn-danger" onClick={() => handleDelete(user)} disabled={deletingId === user.id} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div ref={formModalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={formTitleId} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2 id={formTitleId}>{editingUser ? 'Edit User' : 'Add User'}</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required disabled={editingUser} />
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Password {editingUser && '(leave empty to keep current)'}</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editingUser ? '••••••••' : 'Auto-generated if empty'} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : (editingUser ? 'Update' : 'Create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div ref={resetModalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={resetTitleId} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 id={resetTitleId}>Reset Password</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setShowResetModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Reset password for <strong>{resetUser?.email}</strong>?</p>
              <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>A temporary password will be generated and shown to you.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleResetPassword} disabled={resetting}>{resetting ? 'Resetting...' : 'Reset Password'}</button>
            </div>
          </div>
        </div>
      )}

      {credentialInfo && (
        <div className="modal-overlay" onClick={() => setCredentialInfo(null)}>
          <div ref={credentialModalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={credentialTitleId} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 id={credentialTitleId}>Temporary Credentials</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setCredentialInfo(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--text-light)', fontSize: '0.875rem' }}>
                Share these credentials with the user. They will be prompted to change their password on first login.
              </p>
              <div className="form-group">
                <label>Email</label>
                <input readOnly value={credentialInfo.email} onClick={e => e.target.select()} />
              </div>
              <div className="form-group">
                <label>Temporary Password</label>
                <input readOnly value={credentialInfo.password} onClick={e => e.target.select()} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setCredentialInfo(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {groupsUser && (
        <div className="modal-overlay" onClick={() => setGroupsUser(null)}>
          <div ref={groupsModalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={groupsTitleId} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2 id={groupsTitleId}>Groups: {groupsUser.name}</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setGroupsUser(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {groupsLoading ? (
                <div className="loading-overlay"><div className="spinner"></div></div>
              ) : (
                <>
                  {userGroups.length === 0 ? (
                    <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>Not a member of any group yet.</p>
                  ) : (
                    <div style={{ marginBottom: '1rem' }}>
                      {userGroups.map(group => (
                        <div key={group.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{group.name}</span>
                            <span className={`badge ${group.membershipRole === 'admin' ? 'badge-warning' : 'badge-info'}`}>{group.membershipRole}</span>
                          </div>
                          <button className="btn btn-small btn-danger" onClick={() => handleRemoveFromGroup(group)} title="Remove from group">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleAddToGroup} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Add to group</label>
                    <StyledSelect
                      options={allGroups.filter(g => !userGroups.some(ug => ug.id === g.id)).map(g => ({ value: g.id, label: g.name }))}
                      value={groupToAdd}
                      onChange={setGroupToAdd}
                      placeholder="Select a group..."
                      isClearable
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="checkbox" checked={addAsGroupAdmin} onChange={e => setAddAsGroupAdmin(e.target.checked)} style={{ width: 'auto' }} />
                      <label style={{ marginBottom: 0 }}>Add as group admin</label>
                    </div>
                    <button type="submit" className="btn btn-primary btn-small" disabled={!groupToAdd || groupSubmitting} style={{ alignSelf: 'flex-start' }}>
                      {groupSubmitting ? 'Adding...' : 'Add'}
                    </button>
                  </form>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setGroupsUser(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;