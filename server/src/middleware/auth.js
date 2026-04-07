const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.token = token;
    
    if (user.mustResetPassword && req.path !== '/api/v1/auth/password' && req.path !== '/api/auth/password') {
      return res.status(403).json({
        error: 'PASSWORD_RESET_REQUIRED',
        message: 'You must change your password before continuing'
      });
    }
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authWithApiKey = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const apiKeyHeader = req.header('X-API-Key');
    
    let authenticated = false;
    let user = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        user = await User.findByPk(decoded.userId);
        if (user) {
          authenticated = true;
          req.token = token;
        }
      } catch (e) {
      }
    }
    
    if (!authenticated && apiKeyHeader) {
      user = await User.findOne({ where: { apiKey: apiKeyHeader } });
      if (user) {
        authenticated = true;
      }
    }
    
    if (!authenticated) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.mustResetPassword && req.path !== '/api/v1/auth/password' && req.path !== '/api/auth/password') {
      return res.status(403).json({
        error: 'PASSWORD_RESET_REQUIRED',
        message: 'You must change your password before continuing'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (user) {
      req.user = user;
      req.token = token;
    }
    next();
  } catch (error) {
    next();
  }
};

const optionalApiKey = async (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  
  if (!apiKey) {
    return next();
  }

  try {
    const user = await User.findOne({ where: { apiKey } });
    if (user) {
      req.user = user;
      req.apiKeyAuth = true;
    }
    next();
  } catch (error) {
    next();
  }
};

const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { auth, optionalAuth, optionalApiKey, authWithApiKey, requireAdmin };
