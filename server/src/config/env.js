const crypto = require('crypto');

// Every one of these is a placeholder that has appeared in this repo's own
// source, .env.example, or docker-compose.yml at some point. Rejected in every
// environment, not just NODE_ENV=production - a misconfigured/unset NODE_ENV
// must not silently fall back to a publicly-known secret.
const KNOWN_DEFAULTS = [
  'mcp-secret-key-change-in-production',
  'mcp-refresh-secret-change-in-production',
  'mcp-32-byte-encryption-key!',
  'your-super-secret-jwt-key-change-in-production',
  'your-refresh-secret-key-change-in-production',
  'your-32-byte-encryption-key-here',
  'change-this-secret-key',
  'change-this-refresh-secret'
];

function requireSecret(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: ${name} env var is required and must be set to a strong, unique value`);
    process.exit(1);
  }
  if (KNOWN_DEFAULTS.includes(value)) {
    console.error(`FATAL: ${name} must not use a known default/placeholder value - generate a real secret`);
    process.exit(1);
  }
  return value;
}

const jwtSecret = requireSecret('JWT_SECRET');
const jwtRefreshSecret = requireSecret('JWT_REFRESH_SECRET');
const encryptionKey = requireSecret('ENCRYPTION_KEY');

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL env var is required in production');
  process.exit(1);
}

module.exports = {
  jwtSecret,
  jwtRefreshSecret,
  jwtExpire: process.env.JWT_EXPIRE || '15m',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',
  encryptionKey,
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://admin:admin123@localhost:5432/mcpconnect',
  allowSelfSignedCerts: process.env.ALLOW_SELF_SIGNED_CERTS === 'true',
  internalSecret: crypto.randomBytes(32).toString('hex')
};