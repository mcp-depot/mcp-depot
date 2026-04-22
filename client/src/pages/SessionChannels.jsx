import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function SessionChannels() {
  const { token } = useAuth();
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadChannels = async () => {
    setLoading(true);
    try {
      const res = await api.get('/session-channels', token);
      const data = Array.isArray(res) ? res : (res?.data || res?.channels || []);
      setChannels(data);
    } catch (err) {
      console.error('Failed to load channels:', err);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (channel) => {
    setLoadingMessages(true);
    try {
      const res = await api.get(`/session-channels/${encodeURIComponent(channel)}`, token);
      const data = res?.messages || res || [];
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => { loadChannels(); }, []);

  const handleSelect = (channel) => {
    setSelected(channel);
    loadMessages(channel);
  };

  const handleClear = async (channel) => {
    if (!confirm(`Clear all messages in "${channel}"?`)) return;
    await api.delete(`/session-channels/${encodeURIComponent(channel)}`, token);
    setSelected(null);
    setMessages([]);
    loadChannels();
  };

  const handleRefresh = () => {
    if (selected) loadMessages(selected);
  };

  return (
    <div className="page-container">
      <h1>Session Channels</h1>
      <p className="page-subtitle">
        Append-only logs shared across AI sessions. Sessions post as they work;
        others read at any time to catch up without interrupting.
      </p>

      <div className="two-panel">
        <div className="panel-left">
          {loading && <p>Loading...</p>}
          {channels.map(ch => (
            <div
              key={ch.channel}
              className={`channel-row ${selected === ch.channel ? 'active' : ''}`}
              onClick={() => handleSelect(ch.channel)}
            >
              <span className="channel-name">{ch.channel}</span>
              <span className="channel-meta">
                {ch.messageCount || ch.dataValues?.messageCount || 0} msgs
              </span>
            </div>
          ))}
          {!loading && channels.length === 0 && (
            <p className="empty-state">No channels yet. Ask AI to post to a channel.</p>
          )}
        </div>

        <div className="panel-right">
          {selected ? (
            <>
              <div className="panel-header">
                <h2>{selected}</h2>
                <div className="panel-actions">
                  <button className="btn-secondary btn-sm" onClick={handleRefresh}>Refresh</button>
                  <button className="btn-danger btn-sm" onClick={() => handleClear(selected)}>Clear</button>
                </div>
              </div>
              {loadingMessages && <p>Loading messages...</p>}
              <div className="message-log">
                {Array.isArray(messages) ? messages.map(m => (
                  <div key={m.id} className="log-entry">
                    <span className="log-ts">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}
                    </span>
                    <span className="log-message">{m.message}</span>
                  </div>
                )) : messages.messages?.map(m => (
                  <div key={m.id} className="log-entry">
                    <span className="log-ts">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}
                    </span>
                    <span className="log-message">{m.message}</span>
                  </div>
                ))}
                {!loadingMessages && (messages.length === 0 || messages.messages?.length === 0) && (
                  <p className="empty-state">No messages yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">Select a channel to view its log.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default SessionChannels;