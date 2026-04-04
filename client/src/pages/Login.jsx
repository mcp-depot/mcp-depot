import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      if (err.response?.data?.code === 'PASSWORD_RESET_REQUIRED') {
        navigate('/reset-password');
      } else {
        setError(err.response?.data?.error || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="/logo.png" alt="MCPConnect Logo" width="56" height="56" style={{ borderRadius: '12px', marginBottom: '1rem' }} />
          <h2>MCPConnect</h2>
          <p className="login-subtitle">Sign in to your account</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.875rem' }} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: '16px', height: '16px' }}></span> Signing in...</> : 'Sign In'}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-light)', fontSize: '0.9rem' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 500 }}>Create one</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
