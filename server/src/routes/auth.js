const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const config = require('../config/env');
const logger = require('../services/logger');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({
    allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
    version: '1.0.0'
  });
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required()
});

function generateTokens(userId) {
  const accessToken = jwt.sign(
    { userId },
    config.jwtSecret,
    { expiresIn: config.jwtExpire }
  );

  const refreshToken = jwt.sign(
    { userId },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpire }
  );

  return { accessToken, refreshToken };
}

router.post('/register', async (req, res) => {
  try {
    if (process.env.ALLOW_REGISTRATION !== 'true') {
      return res.status(403).json({ error: 'Registration is disabled. Contact your administrator.' });
    }

    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, name } = value;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = await User.create({ email, password, name, role: 'user' });

    const { accessToken, refreshToken } = generateTokens(user.id);

    res.status(201).json({
      user: user.toJSON(),
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Register error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    if (user.mustResetPassword) {
      return res.json({
        user: user.toJSON(),
        accessToken,
        refreshToken,
        requirePasswordReset: true
      });
    }

    res.json({
      user: user.toJSON(),
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { currentPassword, newPassword } = value;
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.mustResetPassword = false;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/admin-reset', auth, requireAdmin, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and newPassword required' });
    }
    
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.password = newPassword;
    user.changed('password', true);  // Force trigger hook
    user.mustResetPassword = false;
    await user.save();
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokens = generateTokens(user.id);

    res.json(tokens);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user.toJSON());
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/api-key/generate', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const apiKey = user.generateApiKey();
    user.apiKeyEnabled = true;
    await user.save();

    res.json({ apiKey, message: 'API key generated. Store it securely - it will not be shown again.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

router.post('/api-key/regenerate', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const apiKey = user.generateApiKey();
    user.apiKeyEnabled = true;
    await user.save();

    res.json({ apiKey, message: 'API key regenerated. Old key is now invalid.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

router.post('/api-key/disable', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.apiKey = null;
    user.apiKeyEnabled = false;
    await user.save();

    res.json({ message: 'API key disabled and removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disable API key' });
  }
});

const OAUTH_CONFIGS = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile'
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email'
  },
  oidc: {
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    issuerUrl: process.env.OIDC_ISSUER_URL,
    authUrl: process.env.OIDC_ISSUER_URL ? `${process.env.OIDC_ISSUER_URL}/authorize` : null,
    tokenUrl: process.env.OIDC_ISSUER_URL ? `${process.env.OIDC_ISSUER_URL}/token` : null,
    scope: 'openid email profile'
  }
};

router.get('/oauth-url/:provider', (req, res) => {
  const { provider } = req.params;
  const config = OAUTH_CONFIGS[provider];
  
  if (!config || !config.clientId) {
    return res.status(400).json({ error: `OAuth provider ${provider} is not configured` });
  }

  const redirectUri = req.query.redirect_uri || `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/auth/oauth/${provider}/callback`;
  const state = provider;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scope,
    state
  });

  res.json({ url: `${config.authUrl}?${params.toString()}` });
});

router.post('/oauth/:provider', async (req, res) => {
  const { provider } = req.params;
  const { code, redirectUri } = req.body;
  const config = OAUTH_CONFIGS[provider];

  if (!config || !config.clientId) {
    return res.status(400).json({ error: `OAuth provider ${provider} is not configured` });
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const tokenData = await exchangeOAuthCode(provider, code, redirectUri || `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/auth/oauth/${provider}/callback`);
    const profile = await fetchOAuthProfile(provider, tokenData.access_token);

    if (!profile.email) {
      return res.status(400).json({ error: 'OAuth provider did not return an email address' });
    }

    let user = await User.findOne({ where: { email: profile.email } });

    if (!user) {
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await User.create({
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        password: randomPassword,
        role: 'user',
        mustResetPassword: false
      });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    res.json({
      accessToken,
      refreshToken,
      user: user.toJSON()
    });
  } catch (err) {
    logger.error({ err: err.message, provider }, 'OAuth login error');
    res.status(500).json({ error: 'OAuth login failed: ' + err.message });
  }
});

async function exchangeOAuthCode(provider, code, redirectUri) {
  const config = OAUTH_CONFIGS[provider];
  
  const body = {
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code'
  };

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': provider === 'github' ? 'application/json' : 'application/x-www-form-urlencoded'
    },
    body: provider === 'github' ? JSON.stringify(body) : new URLSearchParams(body).toString()
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${errorText}`);
  }

  return res.json();
}

async function fetchOAuthProfile(provider, accessToken) {
  if (provider === 'google') {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch Google profile');
    const data = await res.json();
    return { email: data.email, name: data.name };
  }

  if (provider === 'github') {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'mcp-depot' }
    });
    if (!res.ok) throw new Error('Failed to fetch GitHub profile');
    const data = await res.json();

    let email = data.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'mcp-depot' }
      });
      if (emailsRes.ok) {
        const emails = await emailsRes.json();
        const primary = emails.find(e => e.primary && e.verified);
        email = primary?.email;
      }
    }

    return { email, name: data.name || data.login };
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

router.get('/config', (req, res) => {
  const defaultFeatures = ['integrations', 'tools', 'skills', 'sessions', 'channels', 'users'];
  const enabledFeaturesEnv = process.env.ENABLED_FEATURES;
  const enabledFeatures = enabledFeaturesEnv 
    ? enabledFeaturesEnv.split(',').map(f => f.trim()).filter(f => defaultFeatures.includes(f))
    : defaultFeatures;
  
  res.json({
    googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    githubEnabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    oidcEnabled: !!(process.env.OIDC_ENABLED === 'true' && process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID),
    oidcDisplayName: process.env.OIDC_DISPLAY_NAME || 'Login with SSO',
    enabledFeatures,
    serveClient: process.env.SERVE_CLIENT !== 'false',
  });
});

module.exports = router;
