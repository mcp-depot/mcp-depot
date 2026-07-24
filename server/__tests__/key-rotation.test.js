const { EncryptionService } = require('../src/services/encryption');
const encryption = require('../src/services/encryption'); // singleton, current test key
const { rotateEncryptedValue, rotateCredentialsDeep } = require('../src/services/key-rotation');

const newEncryptor = new EncryptionService('a-brand-new-rotation-key-32bytes');

describe('rotateEncryptedValue', () => {
  test('re-encrypts a value under the new key, decryptable back to the same plaintext', () => {
    const encrypted = encryption.encrypt('my-secret-token');
    const result = rotateEncryptedValue(encrypted, encryption, newEncryptor);

    expect(result.changed).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.value).not.toBe(encrypted);
    expect(newEncryptor.decrypt(result.value)).toBe('my-secret-token');
  });

  test('leaves plaintext untouched (nothing to rotate)', () => {
    const result = rotateEncryptedValue('plain-value', encryption, newEncryptor);
    expect(result.changed).toBe(false);
    expect(result.failed).toBe(false);
    expect(result.value).toBe('plain-value');
  });

  test('leaves a secret-store reference untouched', () => {
    const ref = 'infisical://prod/JIRA_TOKEN';
    const result = rotateEncryptedValue(ref, encryption, newEncryptor);
    expect(result.changed).toBe(false);
    expect(result.value).toBe(ref);
  });

  test('leaves non-string values untouched', () => {
    expect(rotateEncryptedValue(null, encryption, newEncryptor).value).toBeNull();
    expect(rotateEncryptedValue(undefined, encryption, newEncryptor).value).toBeUndefined();
    expect(rotateEncryptedValue(42, encryption, newEncryptor).value).toBe(42);
    expect(rotateEncryptedValue(true, encryption, newEncryptor).value).toBe(true);
  });

  test('rotates legacy CryptoJS-format ciphertext to the new AES-256-GCM format', () => {
    const CryptoJS = require('crypto-js');
    const legacy = CryptoJS.AES.encrypt('legacy-secret', process.env.ENCRYPTION_KEY).toString();

    const result = rotateEncryptedValue(legacy, encryption, newEncryptor);

    expect(result.changed).toBe(true);
    expect(result.value.startsWith('v2:')).toBe(true);
    expect(newEncryptor.decrypt(result.value)).toBe('legacy-secret');
  });

  test('flags a failed decryption instead of silently rotating garbage', () => {
    // Looks encrypted (right prefix) but is not valid ciphertext under the
    // active key - simulates the exact incident scenario (key mismatch).
    const bogus = 'v2:' + Buffer.from('not-real-ciphertext-at-all').toString('base64');
    const result = rotateEncryptedValue(bogus, encryption, newEncryptor);

    expect(result.failed).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.value).toBe(bogus); // left exactly as-is, not corrupted
  });
});

describe('rotateCredentialsDeep', () => {
  test('rotates a bare encrypted string (the "encrypt(JSON.stringify(...))" storage shape)', () => {
    const wholeBlobEncrypted = encryption.encrypt(JSON.stringify({ token: 'abc', username: 'bob' }));

    const result = rotateCredentialsDeep(wholeBlobEncrypted, encryption, newEncryptor);

    expect(result.rotatedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    const decrypted = JSON.parse(newEncryptor.decrypt(result.value));
    expect(decrypted).toEqual({ token: 'abc', username: 'bob' });
  });

  test('rotates a flat object of per-field encrypted values (the encryptObject() storage shape)', () => {
    const creds = { token: encryption.encrypt('tok-value'), username: encryption.encrypt('user-value') };

    const result = rotateCredentialsDeep(creds, encryption, newEncryptor);

    expect(result.rotatedCount).toBe(2);
    expect(newEncryptor.decrypt(result.value.token)).toBe('tok-value');
    expect(newEncryptor.decrypt(result.value.username)).toBe('user-value');
  });

  test('rotates a nested sub-object (the oauth-refresh storage shape) without disturbing sibling plain fields', () => {
    const creds = {
      provider: 'github', // plain, not encrypted - must survive untouched
      oauth: {
        accessToken: encryption.encrypt('access-123'),
        refreshToken: encryption.encrypt('refresh-456'),
        expiresIn: 3600, // plain number - must survive untouched
        createdAt: 1234567890
      }
    };

    const result = rotateCredentialsDeep(creds, encryption, newEncryptor);

    expect(result.rotatedCount).toBe(2);
    expect(result.value.provider).toBe('github');
    expect(result.value.oauth.expiresIn).toBe(3600);
    expect(result.value.oauth.createdAt).toBe(1234567890);
    expect(newEncryptor.decrypt(result.value.oauth.accessToken)).toBe('access-123');
    expect(newEncryptor.decrypt(result.value.oauth.refreshToken)).toBe('refresh-456');
  });

  test('rotates values nested inside arrays', () => {
    const creds = { tokens: [encryption.encrypt('a'), encryption.encrypt('b')] };
    const result = rotateCredentialsDeep(creds, encryption, newEncryptor);

    expect(result.rotatedCount).toBe(2);
    expect(result.value.tokens.map(t => newEncryptor.decrypt(t))).toEqual(['a', 'b']);
  });

  test('does not mutate the input structure', () => {
    const creds = { token: encryption.encrypt('tok-value') };
    const original = JSON.parse(JSON.stringify(creds));

    rotateCredentialsDeep(creds, encryption, newEncryptor);

    expect(creds).toEqual(original);
  });

  test('leaves a mix of secret-store references and plaintext completely alone', () => {
    const creds = { token: 'infisical://prod/TOK', note: 'not a secret' };
    const result = rotateCredentialsDeep(creds, encryption, newEncryptor);

    expect(result.rotatedCount).toBe(0);
    expect(result.value).toEqual(creds);
  });

  test('reports failures per-field without losing the fields that did succeed', () => {
    const bogus = 'v2:' + Buffer.from('garbage').toString('base64');
    const creds = { token: encryption.encrypt('good-token'), username: bogus };

    const result = rotateCredentialsDeep(creds, encryption, newEncryptor);

    expect(result.rotatedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(newEncryptor.decrypt(result.value.token)).toBe('good-token');
    expect(result.value.username).toBe(bogus); // untouched, not corrupted
  });

  test('end-to-end: after rotation, a fresh EncryptionService instantiated with only the new key can decrypt everything', () => {
    const creds = {
      token: encryption.encrypt('tok'),
      oauth: { accessToken: encryption.encrypt('access') }
    };

    const { value: rotated } = rotateCredentialsDeep(creds, encryption, newEncryptor);

    // Simulates the app restarting with ENCRYPTION_KEY set to the new value -
    // a brand new instance, no knowledge of the old key at all.
    const postRestartEncryptor = new EncryptionService('a-brand-new-rotation-key-32bytes');
    expect(postRestartEncryptor.decrypt(rotated.token)).toBe('tok');
    expect(postRestartEncryptor.decrypt(rotated.oauth.accessToken)).toBe('access');
  });
});
