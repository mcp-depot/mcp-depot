import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function PasswordReset() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { changePassword, logout } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '48px', height: '48px', background: 'var(--surface-hover)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1rem', color: 'var(--text-dim)', fontWeight: '500' }}>MC</div>
          <h2>Reset Password</h2>
          <p className="login-subtitle">You must change your password to continue</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">Password changed! Redirecting to login...</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
            />
          </div>
          
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              minLength={6}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              minLength={6}
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.875rem' }} disabled={loading}>
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PasswordReset;
