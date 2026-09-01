const { mergeIntegrationConfig, hasCredentialValues } = require('../src/utils/mergeIntegrationConfig');

describe('mergeIntegrationConfig', () => {
  const existing = {
    baseUrl: 'https://petstore3.swagger.io/api/v3',
    allowSelfSignedCerts: false,
    auth: { type: 'bearer', credentials: { token: 'stored-token' } },
    headers: { 'X-Custom': 'keep-me' }
  };

  test('updates baseUrl without dropping stored credentials or extra config', () => {
    const merged = mergeIntegrationConfig(existing, {
      baseUrl: 'https://petstore3.swagger.io/api/v3-new',
      auth: { type: 'bearer' }
    });

    expect(merged.baseUrl).toBe('https://petstore3.swagger.io/api/v3-new');
    expect(merged.auth).toEqual({ type: 'bearer', credentials: { token: 'stored-token' } });
    expect(merged.headers).toEqual({ 'X-Custom': 'keep-me' });
  });

  test('ignores empty credential objects from the edit form so tokens are not wiped', () => {
    const merged = mergeIntegrationConfig(existing, {
      baseUrl: 'https://example.com',
      auth: { type: 'bearer', credentials: { token: '' } }
    });

    expect(merged.auth.credentials.token).toBe('stored-token');
  });

  test('replaces credentials when a new token is provided', () => {
    const merged = mergeIntegrationConfig(existing, {
      auth: { type: 'bearer', credentials: { token: 'new-token' } }
    });

    expect(merged.auth.credentials.token).toBe('new-token');
  });

  test('clears credentials when auth type is set to none', () => {
    const merged = mergeIntegrationConfig(existing, { auth: { type: 'none' } });
    expect(merged.auth).toEqual({ type: 'none', credentials: {} });
  });
});

describe('hasCredentialValues', () => {
  test('treats empty strings and empty objects as absent', () => {
    expect(hasCredentialValues({ token: '' })).toBe(false);
    expect(hasCredentialValues({})).toBe(false);
    expect(hasCredentialValues({ token: 'abc' })).toBe(true);
  });
});
