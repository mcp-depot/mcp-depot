import StyledSelect from './StyledSelect';

const authOptions = [
  { value: 'none', label: 'None' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'token', label: 'Token' },
  { value: 'custom', label: 'Custom' },
  { value: 'apiKey', label: 'API Key' },
];

const apiKeyInOptions = [
  { value: 'header', label: 'HTTP Header' },
  { value: 'query', label: 'Query Parameter' },
];

export function AuthFieldsGroup({ authType, authData, onChange, showLabels = true }) {
  const handleTypeChange = (opt) => {
    onChange(opt?.value || 'none', {});
  };

  const updateCredential = (key, value) => {
    onChange(authType, { ...authData, [key]: value });
  };

  return (
    <div>
      {showLabels && <label className="form-label">Auth Type</label>}
      <StyledSelect
        options={authOptions}
        value={authOptions.find(o => o.value === authType)}
        onChange={handleTypeChange}
      />

      {authType === 'basic' && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            {showLabels && <label className="form-label">Username</label>}
            <input type="text" className="form-input" value={authData?.username || ''} onChange={e => updateCredential('username', e.target.value)} placeholder="Username" />
          </div>
          <div>
            {showLabels && <label className="form-label">Password / Token</label>}
            <input type="password" className="form-input" value={authData?.token || ''} onChange={e => updateCredential('token', e.target.value)} placeholder="Password or token" />
          </div>
        </div>
      )}

      {authType === 'bearer' && (
        <div style={{ marginTop: '0.75rem' }}>
          {showLabels && <label className="form-label">Bearer Token</label>}
          <input type="password" className="form-input" value={authData?.token || ''} onChange={e => updateCredential('token', e.target.value)} placeholder="Enter token or infisical://dev/SECRET_NAME" />
        </div>
      )}

      {(authType === 'token' || authType === 'custom') && (
        <div style={{ marginTop: '0.75rem' }}>
          {showLabels && <label className="form-label">{authType === 'token' ? 'Token' : 'Custom Auth Value'}</label>}
          <input type={authType === 'token' ? 'text' : 'password'} className="form-input" value={authData?.token || ''} onChange={e => updateCredential('token', e.target.value)} placeholder={authType === 'token' ? 'e.g., wlu_...' : 'e.g., Token wlu_...'} />
        </div>
      )}

      {authType === 'apiKey' && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            {showLabels && <label className="form-label">Key Name</label>}
            <input type="text" className="form-input" value={authData?.key || ''} onChange={e => updateCredential('key', e.target.value)} placeholder="X-API-Key" />
          </div>
          <div>
            {showLabels && <label className="form-label">Key Value</label>}
            <input type="password" className="form-input" value={authData?.value || ''} onChange={e => updateCredential('value', e.target.value)} placeholder="Enter key or infisical://dev/SECRET_NAME" />
          </div>
          <div>
            {showLabels && <label className="form-label">Add To</label>}
            <StyledSelect
              options={apiKeyInOptions}
              value={apiKeyInOptions.find(o => o.value === (authData?.addTo || 'header'))}
              onChange={(opt) => updateCredential('addTo', opt?.value || 'header')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthFieldsGroup;
