import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Network, Chrome, Github, Key } from 'lucide-react';
import api from '../services/api';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [oauthConfig, setOauthConfig] = useState({ googleEnabled: false, githubEnabled: false, oidcEnabled: false, oidcDisplayName: 'Login with SSO' });

  useEffect(() => {
    api.get('/auth/config')
      .then(res => {
        setAllowRegistration(res.data.allowRegistration === true);
        setOauthConfig({ 
          googleEnabled: res.data.googleEnabled, 
          githubEnabled: res.data.githubEnabled,
          oidcEnabled: res.data.oidcEnabled,
          oidcDisplayName: res.data.oidcDisplayName || 'Login with SSO'
        });
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const userData = await login(email, password);
      if (userData.requirePasswordReset) {
        navigate('/reset-password');
      } else {
        navigate('/');
      }
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

  const handleOAuthLogin = async (provider) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`/auth/oauth-url/${provider}`, { params: { redirect_uri: window.location.origin + '/login' } });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || `Failed to initiate ${provider} login`);
      setLoading(false);
    }
  };

  const handleOIDCLogin = () => handleOAuthLogin('oidc');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const provider = params.get('state');
    if (code && provider) {
      setLoading(true);
      api.post(`/auth/oauth/${provider}`, { code, redirectUri: window.location.origin + '/login' })
        .then(res => {
          login(res.data.accessToken, null, res.data.user, res.data.refreshToken);
          navigate('/');
        })
        .catch(err => {
          setError(err.response?.data?.error || 'OAuth login failed');
          setLoading(false);
        });
    }
  }, [navigate, login]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            width: '56px', 
            height: '56px', 
            borderRadius: '12px', 
            marginBottom: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }}>
            <Network size={28} color="white" />
          </div>
          <h2>MCP Depot</h2>
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

        {(oauthConfig.googleEnabled || oauthConfig.githubEnabled) && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {oauthConfig.googleEnabled && (
                <button type="button" className="btn btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => handleOAuthLogin('google')} disabled={loading}>
                  <Chrome size={18} />
                  Google
                </button>
              )}
              {oauthConfig.githubEnabled && (
                <button type="button" className="btn btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => handleOAuthLogin('github')} disabled={loading}>
                  <Github size={18} />
                  GitHub
                </button>
              )}
            </div>
          </>
        )}

        {oauthConfig.oidcEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            </div>
            <button type="button" className="btn btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={handleOIDCLogin} disabled={loading}>
              <Key size={18} />
              {oauthConfig.oidcDisplayName}
            </button>
          </>
        )}
        
        {allowRegistration && (
          <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-light)', fontSize: '0.9rem' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 500 }}>Create one</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default Login;
