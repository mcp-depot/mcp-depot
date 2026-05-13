const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const config = require('../config/env');
const logger = require('../services/logger');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

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

router.post('/change-password', auth, async (req, res) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { currentPassword, newPassword } = value;

    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    req.user.password = newPassword;
    req.user.mustResetPassword = false;
    await req.user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
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

router.get('/me', auth, async (req, res) => {
  try {
    res.json(req.user.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.post('/api-key/generate', auth, async (req, res) => {
  try {
    const apiKey = req.user.generateApiKey();
    req.user.apiKeyEnabled = true;
    await req.user.save();

    res.json({ apiKey, message: 'API key generated. Store it securely - it will not be shown again.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

router.post('/api-key/regenerate', auth, async (req, res) => {
  try {
    const apiKey = req.user.generateApiKey();
    req.user.apiKeyEnabled = true;
    await req.user.save();

    res.json({ apiKey, message: 'API key regenerated. Old key is now invalid.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

router.post('/api-key/disable', auth, async (req, res) => {
  try {
    req.user.apiKey = null;
    req.user.apiKeyEnabled = false;
    await req.user.save();

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
    issuerPublicUrl: process.env.OIDC_ISSUER_PUBLIC_URL || process.env.OIDC_ISSUER_URL,
    scope: 'openid email profile'
  }
};

const oidcDiscoveryCache = {};

async function getOidcEndpoints(issuerUrl) {
  if (oidcDiscoveryCache[issuerUrl]) return oidcDiscoveryCache[issuerUrl];
  
  const res = await fetch(`${issuerUrl}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`Failed to fetch OIDC discovery document from ${issuerUrl}`);
  
  const config = await res.json();
  const endpoints = {
    authorizationEndpoint: config.authorization_endpoint,
    tokenEndpoint: config.token_endpoint,
    userinfoEndpoint: config.userinfo_endpoint
  };
  
  oidcDiscoveryCache[issuerUrl] = endpoints;
  return endpoints;
}

router.get('/oauth-url/:provider', async (req, res) => {
  const { provider } = req.params;
  const config = OAUTH_CONFIGS[provider];
  
  if (!config || !config.clientId) {
    return res.status(400).json({ error: `OAuth provider ${provider} is not configured` });
  }

  let authUrl = config.authUrl;
  
  if (provider === 'oidc' && config.issuerUrl) {
    try {
      const endpoints = await getOidcEndpoints(config.issuerUrl);
      const publicBase = config.issuerPublicUrl || config.issuerUrl;
      authUrl = endpoints.authorizationEndpoint.replace(config.issuerUrl, publicBase);
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to fetch OIDC discovery document');
      return res.status(500).json({ error: 'Failed to fetch OIDC provider configuration' });
    }
  }

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const redirectUri = `${clientUrl}/login`;
  const state = provider;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scope,
    state
  });

  res.json({ url: `${authUrl}?${params.toString()}` });
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
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const tokenData = await exchangeOAuthCode(provider, code, redirectUri || `${clientUrl}/login`);
    const profile = await fetchOAuthProfile(provider, tokenData.access_token, tokenData);

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
  
  let tokenUrl = config.tokenUrl;
  if (provider === 'oidc' && config.issuerUrl) {
    const endpoints = await getOidcEndpoints(config.issuerUrl);
    tokenUrl = endpoints.tokenEndpoint;
  }
  
  const body = {
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code'
  };

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': provider === 'github' ? 'application/json' : 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: provider === 'github' ? JSON.stringify(body) : new URLSearchParams(body).toString()
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${errorText}`);
  }

  return res.json();
}

async function fetchOAuthProfile(provider, accessToken, tokenData = {}) {
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

  if (provider === 'oidc') {
    if (tokenData.id_token) {
      const decoded = jwt.decode(tokenData.id_token);
      if (decoded && decoded.email) {
        return {
          email: decoded.email,
          name: decoded.name || decoded.preferred_username || decoded.email
        };
      }
    }
    const config = OAUTH_CONFIGS.oidc;
    const endpoints = await getOidcEndpoints(config.issuerUrl);
    const res = await fetch(endpoints.userinfoEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to fetch OIDC userinfo: ${res.status} ${body}`);
    }
    const data = await res.json();
    return {
      email: data.email,
      name: data.name || data.preferred_username || data.email
    };
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

router.get('/config', async (req, res) => {
  const defaultFeatures = ['integrations', 'tools', 'skills', 'sessions', 'channels', 'personas', 'users', 'monitoring', 'health'];
  const enabledFeaturesEnv = process.env.ENABLED_FEATURES;
  
  let enabledFeatures;
  try {
    const dbSetting = await SystemSetting.findByPk('enabled_features');
    enabledFeatures = dbSetting?.value?.features || 
      (enabledFeaturesEnv ? enabledFeaturesEnv.split(',').map(f => f.trim()).filter(f => defaultFeatures.includes(f)) : 
      defaultFeatures);
  } catch (e) {
    enabledFeatures = enabledFeaturesEnv 
      ? enabledFeaturesEnv.split(',').map(f => f.trim()).filter(f => defaultFeatures.includes(f))
      : defaultFeatures;
  }
  
  res.json({
    allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
    googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    githubEnabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    oidcEnabled: !!(process.env.OIDC_ENABLED === 'true' && process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID),
    oidcDisplayName: process.env.OIDC_DISPLAY_NAME || 'Login with SSO',
    enabledFeatures,
    serveClient: process.env.SERVE_CLIENT !== 'false',
    apiOnly: process.env.API_ONLY === 'true',
    version: '1.0.0'
  });
});

module.exports = router;
