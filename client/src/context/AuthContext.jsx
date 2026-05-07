import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const [appConfig, setAppConfig] = useState({ enabledFeatures: null });
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      Promise.all([
        api.get('/auth/me'),
        api.get('/auth/config').catch(() => ({ data: {} }))
      ])
        .then(([userRes, configRes]) => {
          setUser(userRes.data);
          setIsAuthenticated(true);
          setAppConfig(configRes.data);
          if (userRes.data.mustResetPassword) {
            setNeedsPasswordReset(true);
          }
          return api.get('/system/setup-status').catch(() => ({ data: { setupComplete: true } }));
        })
        .then(setupRes => {
          setSetupComplete(setupRes.data.setupComplete);
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
      api.get('/auth/config').then(res => setAppConfig(res.data)).catch(() => {});
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken, user: userData } = res.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
      setIsAuthenticated(true);
      if (userData.mustResetPassword) {
        setNeedsPasswordReset(true);
      }
      return userData;
    } catch (err) {
      if (err.response?.data?.code === 'PASSWORD_RESET_REQUIRED') {
        setNeedsPasswordReset(true);
        localStorage.setItem('pendingUserId', err.response.data.userId);
        throw err;
      }
      throw err;
    }
  };

  const register = async (email, password, name) => {
    const res = await api.post('/auth/register', { email, password, name });
    const { accessToken, refreshToken, user: userData } = res.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setUser(userData);
    setIsAuthenticated(true);
    return userData;
  };

  const changePassword = async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
    setNeedsPasswordReset(false);
    const updatedUser = { ...user, mustResetPassword: false };
    setUser(updatedUser);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    setIsAuthenticated(false);
    setNeedsPasswordReset(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAuthenticated, 
      needsPasswordReset,
      appConfig,
      setupComplete,
      setSetupComplete,
      login, 
      register, 
      changePassword,
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
