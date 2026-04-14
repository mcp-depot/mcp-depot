const SystemSetting = require('../models/SystemSetting');

async function checkMcpAuth(req, res, next) {
  try {
    const setting = await SystemSetting.findByPk('mcp');
    const mcpConfig = setting?.value || {};
    
    const authMode = mcpConfig.authMode || 'optional';
    
    // No auth at all - bypass completely
    if (authMode === 'none') {
      return next();
    }
    
    // Optional auth - allow both authenticated and unauthenticated
    if (authMode === 'optional') {
      // Try to extract user from token if provided, but don't require it
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const config = require('../config/env');
        const User = require('../models/User');
        
        const token = authHeader.replace('Bearer ', '');
        try {
          const decoded = jwt.verify(token, config.jwtSecret);
          const user = await User.findByPk(decoded.userId);
          if (user) {
            req.user = user;
          }
        } catch (e) {}
      }
      return next();
    }
    
    // Required auth - must authenticate
    if (authMode === 'required') {
      const authHeader = req.header('Authorization');
      const apiKeyHeader = req.header('X-API-Key');
      
      let authenticated = false;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const config = require('../config/env');
        const User = require('../models/User');
        
        const token = authHeader.replace('Bearer ', '');
        try {
          const decoded = jwt.verify(token, config.jwtSecret);
          const user = await User.findByPk(decoded.userId);
          if (user) {
            authenticated = true;
            req.user = user;
          }
        } catch (e) {}
      }
      
      if (!authenticated && apiKeyHeader) {
        const User = require('../models/User');
        const user = await User.findOne({ where: { apiKey: apiKeyHeader } });
        if (user) {
          authenticated = true;
          req.user = user;
        }
      }
      
      if (!authenticated) {
        return res.status(401).json({ error: 'MCP authentication required. Please provide a valid JWT token or API key.' });
      }
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'MCP authentication error' });
  }
}

module.exports = { checkMcpAuth };
