const encryption = require('../src/services/encryption');

describe('Encryption Service', () => {
  describe('encrypt', () => {
    test('should encrypt a string', () => {
      const plainText = 'Hello World';
      const encrypted = encryption.encrypt(plainText);
      
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plainText);
      expect(typeof encrypted).toBe('string');
    });

    test('should return same value for null/undefined input', () => {
      expect(encryption.encrypt(null)).toBeNull();
      expect(encryption.encrypt(undefined)).toBeUndefined();
      expect(encryption.encrypt('')).toBe('');
    });
  });

  describe('decrypt', () => {
    test('should decrypt an encrypted string', () => {
      const plainText = 'Secret Password';
      const encrypted = encryption.encrypt(plainText);
      const decrypted = encryption.decrypt(encrypted);
      
      expect(decrypted).toBe(plainText);
    });

    test('should return null for invalid ciphertext', () => {
      expect(encryption.decrypt('invalid-ciphertext')).toBeNull();
      expect(encryption.decrypt('')).toBeNull();
    });

    test('should return null for null/undefined input', () => {
      expect(encryption.decrypt(null)).toBeNull();
      expect(encryption.decrypt(undefined)).toBeNull();
    });
  });

  describe('encryptObject / decryptObject', () => {
    test('should encrypt an object', () => {
      const data = { username: 'admin', password: 'secret123' };
      const encrypted = encryption.encryptObject(data);

      expect(encrypted).toBeDefined();
      expect(encrypted.username).not.toBe(data.username);
    });

    test('should decrypt an encrypted object', () => {
      const data = { apiKey: 'sk-12345', secret: 'my-secret' };
      const encrypted = encryption.encryptObject(data);
      const decrypted = encryption.decryptObject(encrypted);

      expect(decrypted).toEqual(data);
    });
  });

  describe('ciphertext format', () => {
    test('new ciphertext is versioned (v2:) and not the legacy CryptoJS format', () => {
      const encrypted = encryption.encrypt('a-secret');
      expect(encrypted.startsWith('v2:')).toBe(true);
      expect(encrypted.startsWith('U2FsdGVk')).toBe(false);
    });

    test('tampering with ciphertext is detected (AEAD auth tag) instead of silently decrypting to garbage', () => {
      const encrypted = encryption.encrypt('a-secret');
      const tampered = encrypted.slice(0, -2) + (encrypted.slice(-2) === 'AA' ? 'BB' : 'AA');
      expect(encryption.decrypt(tampered)).toBeNull();
    });
  });

  describe('isEncrypted', () => {
    test('recognizes current-format (v2:) ciphertext', () => {
      expect(encryption.isEncrypted(encryption.encrypt('token'))).toBe(true);
    });

    test('recognizes legacy CryptoJS-format ciphertext by its U2FsdGVk prefix', () => {
      const CryptoJS = require('crypto-js');
      const legacy = CryptoJS.AES.encrypt('token', 'some-key').toString();
      expect(encryption.isEncrypted(legacy)).toBe(true);
    });

    test('returns false for plaintext', () => {
      expect(encryption.isEncrypted('plaintext-token')).toBe(false);
      expect(encryption.isEncrypted('infisical://prod/JIRA_TOKEN')).toBe(false);
    });

    test('returns false for non-string values', () => {
      expect(encryption.isEncrypted(null)).toBe(false);
      expect(encryption.isEncrypted(undefined)).toBe(false);
      expect(encryption.isEncrypted(12345)).toBe(false);
    });
  });

  describe('legacy ciphertext backward compatibility', () => {
    // Credentials encrypted before the AES-256-GCM migration must keep
    // decrypting correctly under the current ENCRYPTION_KEY - this is the
    // exact compatibility path relied on to recover from a real incident
    // where the app was briefly run against a mismatched encryption key.
    test('decrypts ciphertext produced by the legacy CryptoJS scheme under the same key', () => {
      const CryptoJS = require('crypto-js');
      const key = process.env.ENCRYPTION_KEY;
      const legacy = CryptoJS.AES.encrypt('legacy-secret-value', key).toString();

      expect(encryption.decrypt(legacy)).toBe('legacy-secret-value');
    });

    test('returns null (not the wrong secret) when the legacy ciphertext was encrypted under a different key', () => {
      const CryptoJS = require('crypto-js');
      const legacy = CryptoJS.AES.encrypt('legacy-secret-value', 'a-completely-different-key').toString();

      expect(encryption.decrypt(legacy)).toBeNull();
    });
  });
});
