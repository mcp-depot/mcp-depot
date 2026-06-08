'use strict';

const axios = require('axios');
const encryption = require('../services/encryption');
const logger = require('../services/logger');

const PROBE_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60000;

const cache = new Map();

async function buildProbeHeaders(config) {
  const auth = config.auth || { type: 'none' };
  const credentials = auth.credentials || {};

  switch (auth.type) {
    case 'basic': {
      const user = encryption.decrypt(credentials.username) || credentials.username;
      const pass = encryption.decrypt(credentials.token) || credentials.token;
      if (!user || !pass) return {};
      return { 'Authorization': `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
    }
    case 'bearer':
    case 'infisical': {
      const token = encryption.decrypt(credentials.token) || credentials.token;
      return token ? { 'Authorization': `Bearer ${token}` } : {};
    }
    case 'token': {
      const tokenValue = encryption.decrypt(credentials.token) || credentials.token;
      return tokenValue ? { 'Authorization': `${credentials.prefix || 'Token'} ${tokenValue}` } : {};
    }
    case 'custom': {
      const customAuth = credentials.value || credentials.token || '';
      return customAuth ? { 'Authorization': customAuth } : {};
    }
    case 'apikey':
    case 'apiKey': {
      const key = encryption.decrypt(credentials.key) || credentials.key;
      const value = encryption.decrypt(credentials.value) || credentials.value;
      return key && value ? { [key]: value } : {};
    }
    case 'oauth2': {
      const accessToken = encryption.decrypt(credentials.accessToken) || credentials.accessToken;
      return accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
    }
    default:
      return {};
  }
}

async function probe(integration) {
  const baseUrl = integration.config?.baseUrl;
  if (!baseUrl) {
    return { status: 'error', error: 'No base URL configured', latencyMs: 0 };
  }

  const probePath = integration.config?.healthPath || '/';
  const url = `${baseUrl}${probePath.startsWith('/') ? probePath : `/${probePath}`}`;

  const start = Date.now();
  try {
    const headers = await buildProbeHeaders(integration.config);
    const response = await axios.head(url, {
      headers: { ...headers, 'Accept': 'application/json' },
      timeout: PROBE_TIMEOUT_MS,
      validateStatus: () => true,
      maxRedirects: 3
    });

    let finalResponse = response;
    if (response.status === 404 || response.status === 405) {
      finalResponse = await axios.get(url, {
        headers: { ...headers, 'Accept': 'application/json' },
        timeout: PROBE_TIMEOUT_MS,
        validateStatus: () => true,
        maxRedirects: 3
      });
    }

    const latencyMs = Date.now() - start;

    if (finalResponse.status < 400) {
      return { status: 'ok', latencyMs };
    }
    return { status: 'error', latencyMs, error: `${finalResponse.status} ${finalResponse.statusText}` };
  } catch (err) {
    const latencyMs = Date.now() - start;
    let error;
    if (err.code === 'ECONNABORTED') {
      error = 'Timeout (5s)';
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      error = 'Host unreachable';
    } else {
      error = err.message || 'Unknown error';
    }
    return { status: 'error', latencyMs, error };
  }
}

async function checkAll(integrations) {
  const checks = integrations.map(async (integration) => {
    const result = await probe(integration);
    const entry = {
      id: integration.id,
      name: integration.name,
      type: integration.type,
      ...result,
      checkedAt: new Date().toISOString()
    };
    cache.set(integration.id, entry);
    return entry;
  });

  const results = await Promise.allSettled(checks);
  return results.map((r) =>
    r.status === 'fulfilled' ? r.value : { status: 'error', error: 'Check failed', checkedAt: new Date().toISOString() }
  );
}

function getCached() {
  return Array.from(cache.values());
}

function getCachedById(id) {
  return cache.get(id) || null;
}

let refreshInterval = null;

function startAutoRefresh(getActiveIntegrations) {
  if (refreshInterval) return;
  const run = async () => {
    try {
      const integrations = await getActiveIntegrations();
      if (integrations.length === 0) return;
      await checkAll(integrations);
      logger.info({ count: integrations.length }, 'Health auto-refresh completed');
    } catch (err) {
      logger.error({ err: err.message }, 'Health auto-refresh failed');
    }
  };
  run();
  refreshInterval = setInterval(run, CACHE_TTL_MS);
}

module.exports = { probe, checkAll, getCached, getCachedById, startAutoRefresh };
