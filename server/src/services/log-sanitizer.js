const CryptoJS = require('crypto-js');
const config = require('../config/env');

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
  'clientSecret'
];

const MASK = '[REDACTED]';

function isSensitive(key) {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()));
}

function sanitizeValue(value) {
  if (!value) return value;
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item));
  }
  
  if (typeof value === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSensitive(key)) {
        sanitized[key] = MASK;
      } else {
        sanitized[key] = sanitizeValue(val);
      }
    }
    return sanitized;
  }
  
  return value;
}

function sanitizeObject(obj) {
  if (!obj) return obj;
  return sanitizeValue(obj);
}

function sanitizeLog(message, ...args) {
  const sanitizedArgs = args.map(arg => sanitizeObject(arg));
  console.log(message, ...sanitizedArgs);
}

function sanitizeErrorLog(message, error) {
  const sanitizedError = {
    message: error.message,
    code: error.code,
    status: error.status,
    ...sanitizeObject(error)
  };
  
  delete sanitizedError.stack;
  delete sanitizedError.config;
  delete sanitizedError.request;
  
  console.error(message, sanitizedError);
}

const LogSanitizer = {
  sanitize: sanitizeObject,
  log: sanitizeLog,
  error: sanitizeErrorLog,
  
  safeStringify(obj) {
    return JSON.stringify(sanitizeObject(obj));
  }
};

module.exports = LogSanitizer;