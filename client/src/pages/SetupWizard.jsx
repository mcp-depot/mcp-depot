import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { showSuccess, showError } from '../utils/toast';
import { CheckCircle, Circle, User, Shield, Bell, Database } from 'lucide-react';

const STEPS = [
  { id: 'profile', title: 'Profile', description: 'Set up your account' },
  { id: 'security', title: 'Security', description: 'Configure password' },
  { id: 'notifications', title: 'Notifications', description: 'Set up alerts' },
  { id: 'complete', title: 'Complete', description: 'Finish setup' }
];

export default function SetupWizard() {
  const navigate = useNavigate();
  const { setSetupComplete } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: '',
    emailNotifications: true,
    webhookNotifications: false
  });

  async function handleComplete() {
    if (formData.password !== formData.confirmPassword) {
      showError('Passwords do not match');
      return;
    }
    if (formData.password && formData.password.length < 8) {
      showError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      if (formData.password) {
        await api.post('/auth/change-password', {
          currentPassword: '',
          newPassword: formData.password
        });
      }

      await api.post('/system/setup-complete');
      setSetupComplete(true);
      showSuccess('Setup complete! Redirecting...');
      navigate('/');
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to complete setup');
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--background)'
    }}>
      <div className="card" style={{ maxWidth: '600px', width: '100%', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ marginBottom: '0.5rem' }}>Welcome to MCP Depot</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Let's set up your environment</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', position: 'relative' }}>
          <div style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '10%', 
            right: '10%', 
            height: '2px', 
            background: 'var(--border)',
            transform: 'translateY(-50%)',
            zIndex: 0 
          }} />
          {STEPS.map((step, idx) => (
            <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: idx <= currentStep ? 'var(--primary)' : 'var(--surface)',
                border: `2px solid ${idx <= currentStep ? 'var(--primary)' : 'var(--border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: idx <= currentStep ? 'white' : 'var(--text-secondary)',
                marginBottom: '0.5rem'
              }}>
                {idx < currentStep ? <CheckCircle size={18} /> : idx + 1}
              </div>
              <span style={{ fontSize: '0.75rem', color: idx === currentStep ? 'var(--text)' : 'var(--text-secondary)' }}>
                {step.title}
              </span>
            </div>
          ))}
        </div>

        <div style={{ minHeight: '200px' }}>
          {currentStep === 0 && (
            <div>
              <h2 style={{ marginBottom: '1.5rem' }}><User size={20} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Profile</h2>
              <div className="form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter your name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  value={formData.email || ''}
                  disabled
                  style={{ background: 'var(--surface-hover)' }}
                />
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div>
              <h2 style={{ marginBottom: '1.5rem' }}><Shield size={20} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Security</h2>
              <div className="form-group">
                <label>New Password</label>
                <input 
                  type="password" 
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input 
                  type="password" 
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Confirm your password"
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div>
              <h2 style={{ marginBottom: '1.5rem' }}><Bell size={20} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Notifications</h2>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={formData.emailNotifications}
                    onChange={(e) => setFormData({ ...formData, emailNotifications: e.target.checked })}
                  />
                  <span>Email notifications for alerts and updates</span>
                </label>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={formData.webhookNotifications}
                    onChange={(e) => setFormData({ ...formData, webhookNotifications: e.target.checked })}
                  />
                  <span>Webhook notifications for integrations</span>
                </label>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <CheckCircle size={64} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
              <h2 style={{ marginBottom: '1rem' }}>Ready to Go!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                You've completed the initial setup. You can always change these settings later in the Settings page.
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
          <button 
            className="btn btn-ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            Back
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? 'Saving...' : currentStep === STEPS.length - 1 ? 'Complete Setup' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}