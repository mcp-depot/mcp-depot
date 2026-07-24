const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// A real RSA keypair, used to sign test ID tokens exactly like a real OIDC
// provider would - this exercises the actual jsonwebtoken verification path
// (signature, iss, aud, exp, algorithm allowlist) rather than mocking it away.
const { publicKey: mockPublicKey, privateKey: mockPrivateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(null, { getPublicKey: () => mockPublicKey })
})));

const { isEmailUnverified, verifyOidcIdToken } = require('../src/routes/auth');

const ENDPOINTS = { jwksUri: 'https://idp.example.com/jwks', issuer: 'https://idp.example.com' };
const CLIENT_ID = 'mcp-depot-client';

function signIdToken(claims, opts = {}) {
  return jwt.sign(claims, mockPrivateKey, { algorithm: 'RS256', keyid: 'test-key-1', ...opts });
}

describe('isEmailUnverified', () => {
  test('treats explicit boolean false as unverified', () => {
    expect(isEmailUnverified({ email_verified: false })).toBe(true);
  });

  test('treats the string "false" as unverified (some providers send strings)', () => {
    expect(isEmailUnverified({ email_verified: 'false' })).toBe(true);
  });

  test('does not treat true or a missing claim as unverified', () => {
    expect(isEmailUnverified({ email_verified: true })).toBe(false);
    expect(isEmailUnverified({})).toBe(false);
  });
});

describe('verifyOidcIdToken', () => {
  test('verifies a correctly signed token and returns its claims', async () => {
    const token = signIdToken({ email: 'user@example.com', iss: ENDPOINTS.issuer, aud: CLIENT_ID });
    const decoded = await verifyOidcIdToken(token, ENDPOINTS, CLIENT_ID);
    expect(decoded.email).toBe('user@example.com');
  });

  test('rejects a token signed with a different private key (forged token)', async () => {
    const forgedKeys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const forged = jwt.sign(
      { email: 'attacker@evil.com', iss: ENDPOINTS.issuer, aud: CLIENT_ID },
      forgedKeys.privateKey,
      { algorithm: 'RS256', keyid: 'test-key-1' }
    );

    await expect(verifyOidcIdToken(forged, ENDPOINTS, CLIENT_ID)).rejects.toThrow();
  });

  test('rejects a token with the wrong issuer', async () => {
    const token = signIdToken({ email: 'user@example.com', iss: 'https://not-the-real-idp.example.com', aud: CLIENT_ID });
    await expect(verifyOidcIdToken(token, ENDPOINTS, CLIENT_ID)).rejects.toThrow();
  });

  test('rejects a token issued for a different audience (client_id)', async () => {
    const token = signIdToken({ email: 'user@example.com', iss: ENDPOINTS.issuer, aud: 'someone-elses-client-id' });
    await expect(verifyOidcIdToken(token, ENDPOINTS, CLIENT_ID)).rejects.toThrow();
  });

  test('rejects an expired token', async () => {
    const token = signIdToken({ email: 'user@example.com', iss: ENDPOINTS.issuer, aud: CLIENT_ID }, { expiresIn: -10 });
    await expect(verifyOidcIdToken(token, ENDPOINTS, CLIENT_ID)).rejects.toThrow();
  });

  test('rejects an "alg: none" unsigned token (algorithm-confusion attempt)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ email: 'attacker@evil.com', iss: ENDPOINTS.issuer, aud: CLIENT_ID })).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    await expect(verifyOidcIdToken(noneToken, ENDPOINTS, CLIENT_ID)).rejects.toThrow();
  });

  test('rejects when the provider published no jwks_uri', async () => {
    const token = signIdToken({ email: 'user@example.com', iss: ENDPOINTS.issuer, aud: CLIENT_ID });
    await expect(verifyOidcIdToken(token, { issuer: ENDPOINTS.issuer }, CLIENT_ID)).rejects.toThrow(/jwks_uri/);
  });
});
