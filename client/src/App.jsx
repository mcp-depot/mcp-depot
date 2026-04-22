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
import Skills from './pages/Skills';
import SessionContexts from './pages/SessionContexts';
import SessionChannels from './pages/SessionChannels';
import CompositeToolBuilder from './pages/CompositeToolBuilder';
import Layout from './components/Layout';

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
      <Route path="/" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/integrations" element={<PrivateRoute><Layout><Integrations /></Layout></PrivateRoute>} />
      <Route path="/integrations/:id/tools" element={<PrivateRoute><Layout><Tools /></Layout></PrivateRoute>} />
      <Route path="/tools" element={<PrivateRoute><Layout><Tools all /></Layout></PrivateRoute>} />
      {/* <Route path="/workflows" element={<PrivateRoute><Layout><Workflows /></Layout></PrivateRoute>} /> */}
      <Route path="/monitoring" element={<PrivateRoute><Layout><Monitoring /></Layout></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Layout><Settings /></Layout></PrivateRoute>} />
      <Route path="/skills" element={<PrivateRoute><Layout><Skills /></Layout></PrivateRoute>} />
      <Route path="/session-contexts" element={<PrivateRoute><Layout><SessionContexts /></Layout></PrivateRoute>} />
      <Route path="/session-channels" element={<PrivateRoute><Layout><SessionChannels /></Layout></PrivateRoute>} />
      <Route path="/composite-tool/new" element={<PrivateRoute><Layout><CompositeToolBuilder /></Layout></PrivateRoute>} />
      <Route path="/composite-tool/:id" element={<PrivateRoute><Layout><CompositeToolBuilder /></Layout></PrivateRoute>} />
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
