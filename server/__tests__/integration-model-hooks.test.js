const Integration = require('../src/models/Integration');
const encryption = require('../src/services/encryption');

const { encryptCredentialsIfChanged, decryptCredentialsAfterFind } = Integration;

// Regression coverage for a real incident: beforeSave used to call
// encryption.encryptObject() unconditionally, stacking a second layer on top
// of whatever the route layer had already encrypted. Every one of these
// tests would have caught it before it reached a live instance.
describe('Integration model - credential encryption hooks', () => {
  describe('encryptCredentialsIfChanged (beforeSave)', () => {
    test('encrypts a plaintext credential on save', () => {
      const integration = {
        changed: () => true,
        config: { auth: { credentials: { token: 'plaintext-token' } } }
      };

      encryptCredentialsIfChanged(integration);

      const stored = integration.config.auth.credentials.token;
      expect(stored).not.toBe('plaintext-token');
      expect(encryption.isEncrypted(stored)).toBe(true);
      expect(encryption.decrypt(stored)).toBe('plaintext-token');
    });

    test('does not double-encrypt a credential that is already encrypted', () => {
      const alreadyEncrypted = encryption.encrypt('secret-token');
      const integration = {
        changed: () => true,
        config: { auth: { credentials: { token: alreadyEncrypted } } }
      };

      encryptCredentialsIfChanged(integration);

      // Must be byte-for-byte unchanged - re-encrypting would wrap it in a
      // second layer and decrypt() would return the ciphertext, not the secret.
      expect(integration.config.auth.credentials.token).toBe(alreadyEncrypted);
      expect(encryption.decrypt(integration.config.auth.credentials.token)).toBe('secret-token');
    });

    test('leaves a secret-store reference untouched', () => {
      const ref = 'infisical://prod/JIRA_TOKEN';
      const integration = {
        changed: () => true,
        config: { auth: { credentials: { token: ref } } }
      };

      encryptCredentialsIfChanged(integration);

      expect(integration.config.auth.credentials.token).toBe(ref);
    });

    test('does nothing when config has not changed', () => {
      const integration = {
        changed: () => false,
        config: { auth: { credentials: { token: 'plaintext-token' } } }
      };

      encryptCredentialsIfChanged(integration);

      expect(integration.config.auth.credentials.token).toBe('plaintext-token');
    });

    test('does nothing when there are no credentials', () => {
      const integration = { changed: () => true, config: { auth: { type: 'none' } } };
      expect(() => encryptCredentialsIfChanged(integration)).not.toThrow();
      expect(integration.config.auth.credentials).toBeUndefined();
    });

    test('handles multiple fields independently (mixed encrypted/plaintext)', () => {
      const alreadyEncrypted = encryption.encrypt('existing-user');
      const integration = {
        changed: () => true,
        config: { auth: { credentials: { username: alreadyEncrypted, token: 'new-plaintext-token' } } }
      };

      encryptCredentialsIfChanged(integration);

      expect(integration.config.auth.credentials.username).toBe(alreadyEncrypted);
      expect(encryption.decrypt(integration.config.auth.credentials.token)).toBe('new-plaintext-token');
    });
  });

  describe('decryptCredentialsAfterFind (afterFind)', () => {
    test('decrypts credentials on a single loaded instance', () => {
      const encrypted = encryption.encrypt('secret-token');
      const instance = { config: { auth: { credentials: { token: encrypted } } } };

      decryptCredentialsAfterFind(instance);

      expect(instance.config.auth.credentials.token).toBe('secret-token');
    });

    test('decrypts credentials across an array of instances (findAll) and tolerates nulls', () => {
      const encrypted = encryption.encrypt('secret-token');
      const instances = [
        { config: { auth: { credentials: { token: encrypted } } } },
        null,
        { config: { auth: { type: 'none' } } }
      ];

      expect(() => decryptCredentialsAfterFind(instances)).not.toThrow();
      expect(instances[0].config.auth.credentials.token).toBe('secret-token');
    });

    test('does nothing when there are no credentials on the instance', () => {
      const instance = { config: { baseUrl: 'http://example.com' } };
      decryptCredentialsAfterFind(instance);
      expect(instance.config).toEqual({ baseUrl: 'http://example.com' });
    });
  });

  describe('full save -> load -> resave cycle', () => {
    test('a credential survives repeated save/load cycles without corruption', () => {
      // Cycle 1: initial save with plaintext from the create route
      let integration = {
        changed: () => true,
        config: { auth: { credentials: { token: 'plaintext-token' } } }
      };
      encryptCredentialsIfChanged(integration);
      const afterFirstSave = integration.config.auth.credentials.token;
      expect(encryption.isEncrypted(afterFirstSave)).toBe(true);

      // Cycle 2: loaded back out (afterFind decrypts for in-memory use)
      const loaded = { config: JSON.parse(JSON.stringify(integration.config)) };
      decryptCredentialsAfterFind(loaded);
      expect(loaded.config.auth.credentials.token).toBe('plaintext-token');

      // Cycle 3: an unrelated field is edited and the record is saved again.
      // The route layer re-encrypts before calling save (matching real
      // integrations.js behavior) - beforeSave must not encrypt it a second time.
      const reEncrypted = encryption.encrypt('plaintext-token');
      const resaving = {
        changed: () => true,
        config: { auth: { credentials: { token: reEncrypted } } }
      };
      encryptCredentialsIfChanged(resaving);
      expect(resaving.config.auth.credentials.token).toBe(reEncrypted);
      expect(encryption.decrypt(resaving.config.auth.credentials.token)).toBe('plaintext-token');
    });
  });
});
