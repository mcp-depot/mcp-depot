const crypto = require('crypto');

const KNOWN_DEFAULTS = ['mcp-secret-key-change-in-production', 'mcp-refresh-secret-change-in-production'];

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required in production');
  if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET env var is required in production');
  if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY env var is required in production');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL env var is required in production');
}

if (KNOWN_DEFAULTS.includes(process.env.JWT_SECRET) || KNOWN_DEFAULTS.includes(process.env.JWT_REFRESH_SECRET)) {
  console.error('FATAL: JWT secrets must not use known default values in any environment');
  process.exit(1);
}

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'mcp-secret-key-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'mcp-refresh-secret-change-in-production',
  jwtExpire: process.env.JWT_EXPIRE || '15m',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',
  encryptionKey: process.env.ENCRYPTION_KEY || 'mcp-32-byte-encryption-key!',
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://admin:admin123@localhost:5432/mcpconnect',
  allowSelfSignedCerts: process.env.ALLOW_SELF_SIGNED_CERTS === 'true',
  internalSecret: crypto.randomBytes(32).toString('hex')
};