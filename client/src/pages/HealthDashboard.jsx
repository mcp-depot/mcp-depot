import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Activity, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

function HealthDashboard() {
  const { user } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/health');
      setResults(res.data.cached || []);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.post('/health/refresh');
      setResults(res.data.results || []);
    } catch (err) {
      alert('Failed to refresh health: ' + (err.response?.data?.error || err.message));
    } finally {
      setRefreshing(false);
    }
  };

  const statusIcon = (r) => {
    if (r.status === 'ok') return <CheckCircle size={18} style={{ color: '#4caf50' }} />;
    return r.error?.includes('Unauthorized')
      ? <AlertCircle size={18} style={{ color: '#ff9800' }} />
      : <XCircle size={18} style={{ color: '#f44336' }} />;
  };

  const statusText = (r) => {
    if (r.status === 'ok') return `OK · ${r.latencyMs}ms`;
    if (r.error === 'No base URL configured') return 'No base URL';
    return r.error || 'Unknown error';
  };

  const timeAgo = (checkedAt) => {
    if (!checkedAt) return 'Never';
    const diff = (Date.now() - new Date(checkedAt).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const okCount = results.filter(r => r.status === 'ok').length;
  const errCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={24} /> Integration Health
          </h1>
          <p className="page-subtitle">Monitor API reachability and auth status for all integrations</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Checking...' : 'Re-check all'}
        </button>
      </div>

      {results.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="stat-card" style={{ flex: 1 }}>
            <div style={{ fontSize: '0.85rem', color: '#888' }}>Healthy</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4caf50' }}>{okCount}</div>
          </div>
          <div className="stat-card" style={{ flex: 1 }}>
            <div style={{ fontSize: '0.85rem', color: '#888' }}>Errors</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f44336' }}>{errCount}</div>
          </div>
          <div className="stat-card" style={{ flex: 1 }}>
            <div style={{ fontSize: '0.85rem', color: '#888' }}>Total</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{results.length}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading health data...</div>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <Activity size={48} style={{ color: '#999' }} />
          <h3>No health data yet</h3>
          <p>Click "Re-check all" to probe your integrations. Results are cached for 60 seconds.</p>
        </div>
      ) : (
        <div className="card-list">
          {results.map(r => (
            <div key={r.id} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {statusIcon(r)}
                <div>
                  <strong>{r.name}</strong>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>{r.type}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '0.85rem', textAlign: 'right' }}>
                  <div style={{ color: r.status === 'ok' ? '#4caf50' : '#f44336' }}>{statusText(r)}</div>
                  <div style={{ fontSize: '0.7rem', color: '#aaa', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <Clock size={10} /> {timeAgo(r.checkedAt)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HealthDashboard;
