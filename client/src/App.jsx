import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import PasswordReset from './pages/PasswordReset';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import Tools from './pages/Tools';
import Workflows from './pages/Workflows';
import Settings from './pages/Settings';
import Monitoring from './pages/Monitoring';
import PromptLibrary from './pages/PromptLibrary';

function PrivateRoute({ children }) {
  const { isAuthenticated, loading, needsPasswordReset } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (needsPasswordReset) {
    return <Navigate to="/reset-password" />;
  }
  
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  return isAuthenticated ? <Navigate to="/" /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/reset-password" element={<PasswordReset />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/integrations" element={<PrivateRoute><Integrations /></PrivateRoute>} />
      <Route path="/integrations/:id/tools" element={<PrivateRoute><Tools /></PrivateRoute>} />
      <Route path="/tools" element={<PrivateRoute><Tools all /></PrivateRoute>} />
      <Route path="/workflows" element={<PrivateRoute><Workflows /></PrivateRoute>} />
      <Route path="/monitoring" element={<PrivateRoute><Monitoring /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/prompts" element={<PrivateRoute><PromptLibrary /></PrivateRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppRoutes />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
