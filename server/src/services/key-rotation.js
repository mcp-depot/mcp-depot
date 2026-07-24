const secretStore = require('./secret-store');

// Re-encrypts a single value from the old key to the new key. Leaves
// anything that isn't recognizably-encrypted ciphertext (plaintext,
// non-strings, secret-store references) untouched rather than guessing.
function rotateEncryptedValue(value, oldDecryptor, newEncryptor) {
  if (typeof value !== 'string' || !value) {
    return { value, changed: false, failed: false };
  }
  if (secretStore.isSecretRef(value)) {
    return { value, changed: false, failed: false };
  }
  if (!oldDecryptor.isEncrypted(value)) {
    return { value, changed: false, failed: false };
  }

  const plain = oldDecryptor.decrypt(value);
  if (plain === null) {
    return { value, changed: false, failed: true };
  }

  return { value: newEncryptor.encrypt(plain), changed: true, failed: false };
}

// Walks an arbitrary JSON value (string, object, array, nested combinations)
// and re-encrypts every string leaf that looks like ciphertext under the old
// key. Covers every shape credentials are actually stored in across this
// app: a bare encrypted string, a flat object of encrypted fields, or an
// object with a nested sub-object (e.g. { oauth: { accessToken, ... } }).
// Never mutates the input - returns a new structure.
function rotateCredentialsDeep(input, oldDecryptor, newEncryptor) {
  let rotatedCount = 0;
  let failedCount = 0;

  function walk(node) {
    if (typeof node === 'string') {
      const result = rotateEncryptedValue(node, oldDecryptor, newEncryptor);
      if (result.changed) rotatedCount++;
      if (result.failed) failedCount++;
      return result.value;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        out[key] = walk(value);
      }
      return out;
    }
    return node;
  }

  const value = walk(input);
  return { value, rotatedCount, failedCount };
}

module.exports = { rotateEncryptedValue, rotateCredentialsDeep };
