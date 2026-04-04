import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/auth/me')
        .then(res => {
          setUser(res.data);
          setIsAuthenticated(true);
          if (res.data.mustResetPassword) {
            setNeedsPasswordReset(true);
          }
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
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
