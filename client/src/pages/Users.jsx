import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Users as UsersIcon, Plus, Trash2, RotateCcw, X } from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';

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
      showError(err.response?.data?.error || 'Failed to save user');
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Delete user ${user.email}?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      setUsers(users.filter(u => u.id !== user.id));
      showSuccess('User deleted');
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleResetPassword = async () => {
    try {
      const res = await api.post(`/users/${resetUser.id}/reset-password`);
      setTempPassword(res.data.temporaryPassword);
      setShowResetModal(false);
      setCredentialInfo({ email: resetUser.email, password: res.data.temporaryPassword });
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to reset password');
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
                <th style={{ width: '150px' }}>Actions</th>
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
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-small btn-secondary" onClick={() => openEdit(user)}>Edit</button>
                      <button className="btn btn-small btn-secondary" onClick={() => openReset(user)} title="Reset Password">
                        <RotateCcw size={14} />
                      </button>
                      {user.id !== currentUser?.id && (
                        <button className="btn btn-small btn-danger" onClick={() => handleDelete(user)} title="Delete">
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
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
                <button type="submit" className="btn btn-primary">{editingUser ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Reset Password</h2>
              <button className="modal-close" onClick={() => setShowResetModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Reset password for <strong>{resetUser?.email}</strong>?</p>
              <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>A temporary password will be generated and shown to you.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleResetPassword}>Reset Password</button>
            </div>
          </div>
        </div>
      )}

      {credentialInfo && (
        <div className="modal-overlay" onClick={() => setCredentialInfo(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Temporary Credentials</h2>
              <button className="modal-close" onClick={() => setCredentialInfo(null)}>&times;</button>
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
    </div>
  );
}

export default Users;