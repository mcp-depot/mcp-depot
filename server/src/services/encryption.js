const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const config = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION_PREFIX = 'v2:';

class EncryptionService {
  // Defaults to the active ENCRYPTION_KEY, but accepts an explicit key so a
  // second, independent instance can be created for key rotation (see
  // services/key-rotation.js) without disturbing the app-wide singleton
  // every other caller in this file's module.exports relies on.
  constructor(explicitKey) {
    const rawKey = explicitKey || config.encryptionKey;
    // Derive a fixed 32-byte key from the configured secret for AES-256-GCM.
    this.key = crypto.createHash('sha256').update(rawKey).digest();
    // Kept only to decrypt ciphertext written before the GCM migration.
    this.legacyPassphrase = rawKey;
  }

  encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return VERSION_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(ciphertext) {
    if (!ciphertext) return null;
    try {
      if (ciphertext.startsWith(VERSION_PREFIX)) {
        return this._decryptGcm(ciphertext.slice(VERSION_PREFIX.length));
      }
      return this._decryptLegacy(ciphertext);
    } catch (error) {
      return null;
    }
  }

  _decryptGcm(payload) {
    const raw = Buffer.from(payload, 'base64');
    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const data = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // Decrypt-only path for credentials encrypted before the AES-256-GCM
  // migration (plain CryptoJS passphrase-based AES-CBC, no auth tag).
  // Re-saving any such credential re-encrypts it under the new scheme.
  _decryptLegacy(ciphertext) {
    const bytes = CryptoJS.AES.decrypt(ciphertext, this.legacyPassphrase);
    const result = bytes.toString(CryptoJS.enc.Utf8);
    if (!result) return null;
    // Legacy AES-CBC has no integrity check (that's why it was replaced) -
    // decrypting with the wrong key can occasionally produce a short string
    // that happens to pass as "valid" UTF-8 instead of throwing. Reject
    // anything containing the replacement character or control characters
    // rather than returning it as if it were a real decrypted secret.
    if (/�/.test(result)) return null;
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(result)) return null;
    return result;
  }

  isEncrypted(value) {
    return typeof value === 'string' && (value.startsWith(VERSION_PREFIX) || value.startsWith('U2FsdGVk'));
  }

  encryptObject(obj) {
    if (!obj) return obj;
    const encrypted = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        encrypted[key] = this.encryptObject(value);
      } else {
        encrypted[key] = this.encrypt(value);
      }
    }
    return encrypted;
  }

  decryptObject(obj) {
    if (!obj) return obj;
    const decrypted = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        decrypted[key] = this.decryptObject(value);
      } else {
        decrypted[key] = this.decrypt(value);
      }
    }
    return decrypted;
  }
}

module.exports = new EncryptionService();
module.exports.EncryptionService = EncryptionService;
