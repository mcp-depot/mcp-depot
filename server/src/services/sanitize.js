const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'api_key',
  'secret',
  'secretKey',
  'bearer',
  'authorization',
  'credentials',
  'username',
  'privateKey',
  'clientSecret',
  'resolved',
  'tokenPreview'
];

const MASK = '[REDACTED]';

function isSensitive(key) {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()));
}

function sanitizeValue(value, seen) {
  if (!value) return value;

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = isSensitive(key) ? MASK : sanitizeValue(val, seen);
    }
    return sanitized;
  }

  return value;
}

function sanitizeObject(obj) {
  if (!obj) return obj;
  return sanitizeValue(obj, new WeakSet());
}

module.exports = { isSensitive, sanitizeObject, SENSITIVE_FIELDS, MASK };
