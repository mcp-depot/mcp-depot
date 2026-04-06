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
});
