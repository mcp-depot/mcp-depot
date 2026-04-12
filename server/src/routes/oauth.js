const express = require('express');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');
const encryption = require('../services/encryption');
const { PROVIDERS, buildAuthUrl, exchangeCode } = require('../services/oauth');
const logger = require('../services/logger');

const router = express.Router();

const stateStore = new Map();

function generateState(userId, integrationId) {
  return `${userId}:${integrationId}:${Date.now()}`;
}

router.get('/providers', async (req, res) => {
  try {
    const { SystemSetting } = loadModels();
    
    const providers = [];
    for (const [key, provider] of Object.entries(PROVIDERS)) {
      const config = await SystemSetting.findByPk(`oauth_${key}`);
      const isConfigured = !!config?.value?.clientId;
      
      providers.push({
        id: key,
        name: provider.name,
        scopes: provider.scopes,
        isConfigured
      });
    }
    
    res.json(providers);
  } catch (error) {
    logger.error({ error: error.message }, 'Get OAuth providers failed');
    res.status(500).json({ error: 'Failed to get providers' });
  }
});

router.get('/authorize/:provider', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const { integrationId, clientId: providedClientId } = req.query;
    const userId = req.user.id;

    const config = await SystemSetting.findByPk(`oauth_${provider}`);
    if (!config?.value?.clientId) {
      return res.status(400).json({ error: `Provider ${provider} not configured` });
    }

    const clientId = providedClientId || config.value.clientId;
    const redirectUri = config.value.redirectUri;
    
    if (!redirectUri) {
      return res.status(400).json({ error: 'OAuth redirect URI not configured' });
    }

    const state = generateState(userId, integrationId);
    stateStore.set(state, { userId, provider, clientId, redirectUri });

    const authUrl = buildAuthUrl(provider, clientId, redirectUri, state);
    
    res.json({ authUrl, state });
  } catch (error) {
    logger.error({ error: error.message }, 'OAuth authorize failed');
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: errorParam } = req.query;

    if (errorParam) {
      return res.redirect(`/integrations?oauth_error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !state) {
      return res.redirect('/integrations?oauth_error=missing_params');
    }

    const stateData = stateStore.get(state);
    if (!stateData) {
      return res.redirect('/integrations?oauth_error=invalid_state');
    }

    stateStore.delete(state);
    const { userId, provider, clientId, redirectUri } = stateData;

    const config = await SystemSetting.findByPk(`oauth_${provider}`);
    const providerConfig = config?.value;

    if (!providerConfig?.clientId || !providerConfig?.clientSecret) {
      return res.redirect('/integrations?oauth_error=not_configured');
    }

    const tokens = await exchangeCode(
      provider,
      code,
      providerConfig.clientId,
      providerConfig.clientSecret,
      redirectUri
    );

    res.redirect(`/integrations?oauth_success=${provider}`);
  } catch (error) {
    logger.error({ error: error.message }, 'OAuth callback failed');
    res.redirect('/integrations?oauth_error=exchange_failed');
  }
});

router.post('/refresh/:integrationId', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const { provider, credentials } = req.body;
    const userId = req.user.id;

    const integration = await Integration.findOne({
      where: { id: integrationId, userId }
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const stored = await UserIntegrationCredentials.findOne({
      where: { userId, integrationId }
    });

    if (!stored?.credentials?.oauth) {
      return res.status(400).json({ error: 'No OAuth credentials found' });
    }

    const config = await SystemSetting.findByPk(`oauth_${provider}`);
    const providerConfig = config?.value;

    const refreshed = await refreshToken(
      provider,
      stored.credentials.oauth.refreshToken,
      providerConfig.clientId,
      providerConfig.clientSecret
    );

    if (!refreshed) {
      return res.status(401).json({ error: 'Failed to refresh token' });
    }

    await stored.update({
      credentials: {
        ...stored.credentials,
        oauth: {
          ...stored.credentials.oauth,
          accessToken: encryption.encrypt(refreshed.accessToken),
          refreshToken: encryption.encrypt(refreshed.refreshToken),
          createdAt: refreshed.createdAt,
          expiresIn: refreshed.expiresIn
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'OAuth refresh failed');
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

module.exports = router;