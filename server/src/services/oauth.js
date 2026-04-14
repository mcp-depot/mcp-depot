const axios = require('axios');
const crypto = require('crypto');
const { loadModels } = require('../config/database');
const encryption = require('./encryption');
const logger = require('./logger');

const PROVIDERS = {
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'user'],
    baseUrl: 'https://api.github.com'
  },
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/gmail.readonly'],
    baseUrl: 'https://www.googleapis.com'
  },
  slack: {
    name: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'channels:read', 'users:read'],
    baseUrl: 'https://slack.com/api'
  },
  notion: {
    name: 'Notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: ['read', 'write', 'insert'],
    baseUrl: 'https://api.notion.com/v1'
  },
  linear: {
    name: 'Linear',
    authUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    scopes: ['read', 'write'],
    baseUrl: 'https://api.linear.app'
  },
  jira: {
    name: 'Jira',
    authUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
    baseUrl: null,
    extraAuthParams: { audience: 'api.atlassian.com', prompt: 'consent' }
  }
};

const providerConfigs = {};

async function initProviderConfigs() {
  const { SystemSetting } = loadModels();
  
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    const setting = await SystemSetting.findByPk(`oauth_${key}`);
    if (setting?.value) {
      providerConfigs[key] = { ...provider, ...setting.value };
    } else if (provider.baseUrl) {
      providerConfigs[key] = provider;
    }
  }
  
  logger.info({ providers: Object.keys(providerConfigs) }, 'OAuth providers initialized');
}

function getProviderConfig(provider) {
  return providerConfigs[provider];
}

function buildAuthUrl(provider, clientId, redirectUri, state) {
  const config = providerConfigs[provider];
  if (!config) throw new Error(`Provider ${provider} not configured`);

  const scope = config.scopes.join(' ');
  
  let url = `${config.authUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&response_type=code`;
  
  if (config.extraAuthParams) {
    for (const [key, value] of Object.entries(config.extraAuthParams)) {
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }
  }

  return url;
}

async function exchangeCode(provider, code, clientId, clientSecret, redirectUri) {
  const config = providerConfigs[provider];
  if (!config) throw new Error(`Provider ${provider} not configured`);

  let tokenUrl = config.tokenUrl;

  if (provider === 'notion') {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await axios.post(tokenUrl,
      { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
      { headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
      }}
    );
    const data = res.data;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      createdAt: Date.now()
    };
  }

  const headers = {
    'Accept': 'application/json',
    ...(provider === 'github' ? { 'Accept': 'application/json' } : {})
  };

  const bodyParams = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  };

  const res = await axios.post(tokenUrl, new URLSearchParams(bodyParams).toString(), { headers });

  const data = res.data;
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
    createdAt: Date.now()
  };
}

async function refreshToken(provider, refreshTokenValue, clientId, clientSecret) {
  const config = providerConfigs[provider];
  if (!config) throw new Error(`Provider ${provider} not configured`);

  let tokenUrl = config.tokenUrl;
  if (provider === 'jira') {
    const baseUrl = config.baseUrl || 'https://your-domain.atlassian.net';
    tokenUrl = `${baseUrl}/oauth/access_token`;
  }

  const bodyParams = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token'
  };

  const headers = {
    'Accept': 'application/json'
  };

  try {
    const res = await axios.post(tokenUrl, new URLSearchParams(bodyParams).toString(), { headers });
    const data = res.data;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshTokenValue,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      createdAt: Date.now()
    };
  } catch (err) {
    if (err.response?.status === 401) {
      return null;
    }
    throw err;
  }
}

function shouldRefresh(tokenData) {
  if (!tokenData?.createdAt || !tokenData?.expiresIn) return false;
  const expiresAt = tokenData.createdAt + (tokenData.expiresIn * 1000);
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() > (expiresAt - fiveMinutes);
}

async function getValidToken(provider, credentials) {
  if (!credentials.oauth) return null;
  
  const { clientId, clientSecret, redirectUri, storedTokens } = credentials.oauth;
  
  if (!storedTokens?.accessToken) return null;
  
  if (shouldRefresh(storedTokens)) {
    if (!storedTokens.refreshToken || !clientId || !clientSecret) {
      return null;
    }
    
    const refreshed = await refreshToken(
      provider,
      storedTokens.refreshToken,
      clientId,
      clientSecret,
      redirectUri
    );
    
    if (!refreshed) {
      return null;
    }
    
    return {
      accessToken: encryption.encrypt(refreshed.accessToken),
      refreshToken: encryption.encrypt(refreshed.refreshToken || storedTokens.refreshToken),
      createdAt: refreshed.createdAt,
      expiresIn: refreshed.expiresIn
    };
  }
  
  return storedTokens;
}

module.exports = {
  PROVIDERS,
  providerConfigs,
  initProviderConfigs,
  getProviderConfig,
  buildAuthUrl,
  exchangeCode,
  refreshToken,
  getValidToken,
  shouldRefresh
};