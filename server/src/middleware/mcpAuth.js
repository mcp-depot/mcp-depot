const crypto = require('crypto');
const SystemSetting = require('../models/SystemSetting');

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Resolve a user from credentials if present. "Optional" auth means the
// request may proceed without credentials — not that X-API-Key / Bearer
// API keys should be ignored. Previously the optional branch only tried
// JWT Bearer, so CLI clients that send x-api-key stayed anonymous and
// private integration tools were filtered out of /api/v1/mcp/tools.
async function resolveMcpUserFromRequest(req) {
  const authHeader = req.header('Authorization');
  const apiKeyHeader = req.header('X-API-Key');
  const User = require('../models/User');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const config = require('../config/env');
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findByPk(decoded.userId);
        if (user) return user;
      } catch (_) {
        // Bearer may be an MCP Depot API key (mcp_...), not a JWT
        const user = await User.findOne({ where: { apiKey: hashApiKey(token) } });
        if (user) return user;
      }
    }
  }

  if (apiKeyHeader) {
    const user = await User.findOne({ where: { apiKey: hashApiKey(String(apiKeyHeader).trim()) } });
    if (user) return user;
  }

  return null;
}

async function checkMcpAuth(req, res, next) {
  try {
    const setting = await SystemSetting.findByPk('mcp');
    const mcpConfig = setting?.value || {};

    const authMode = mcpConfig.authMode || 'optional';

    // No auth at all - bypass completely
    if (authMode === 'none') {
      return next();
    }

    // Optional auth - authenticate when credentials are present, else continue
    if (authMode === 'optional') {
      const user = await resolveMcpUserFromRequest(req);
      if (user) req.user = user;
      return next();
    }

    // Required auth - must authenticate
    if (authMode === 'required') {
      const user = await resolveMcpUserFromRequest(req);
      if (!user) {
        return res.status(401).json({ error: 'MCP authentication required. Please provide a valid JWT token or API key.' });
      }
      req.user = user;
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'MCP authentication error' });
  }
}

module.exports = { checkMcpAuth, resolveMcpUserFromRequest, hashApiKey };
