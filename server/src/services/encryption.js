const CryptoJS = require('crypto-js');
const config = require('../config/env');

class EncryptionService {
  constructor() {
    this.key = config.encryptionKey;
  }

  encrypt(text) {
    if (!text) return text;
    return CryptoJS.AES.encrypt(text, this.key).toString();
  }

  decrypt(ciphertext) {
    if (!ciphertext) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, this.key);
      const result = bytes.toString(CryptoJS.enc.Utf8);
      if (!result) return null;
      return result;
    } catch (error) {
      return null;
    }
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
