const logger = require('./logger');

let config = null;
let initialized = false;

async function init(options) {
  if (!options || !options.enabled) {
    initialized = false;
    config = null;
    return;
  }

  config = {
    provider: options.provider || 'infisical',
    siteUrl: options.siteUrl,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    workspaceId: options.workspaceId,
    environment: options.environment || 'dev'
  };

  try {
    const response = await fetch(`${config.siteUrl}/api/v3/workspace`, {
      headers: {
        'Authorization': `Bearer ${config.clientSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Infisical auth failed: ${response.status}`);
    }

    initialized = true;
    logger.info({ provider: config.provider }, 'Secret store initialized');
  } catch (error) {
    initialized = false;
    config = null;
    logger.error({ err: error.message }, 'Failed to initialize secret store');
    throw error;
  }
}

function isSecretRef(value) {
  return typeof value === 'string' && value.startsWith('infisical://');
}

async function resolveSecret(secretRef) {
  if (!isSecretRef(secretRef)) {
    return secretRef;
  }

  if (!initialized || !config) {
    logger.warn({ secretRef }, 'Secret store not initialized, cannot resolve');
    return null;
  }

  const path = secretRef.replace('infisical://', '');
  const [projectSlug, env, secretName] = path.split('/');

  if (!projectSlug || !env || !secretName) {
    throw new Error(`Invalid secret ref: ${secretRef}. Expected: infisical://project/env/secret-name`);
  }

  try {
    const secretPath = `${config.siteUrl}/api/v3/secrets/raw/${secretName}?environment=${env}&secretPath=/${projectSlug}&workspaceId=${config.workspaceId}`;
    
    const response = await fetch(secretPath, {
      headers: {
        'Authorization': `Bearer ${config.clientSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch secret: ${response.status}`);
    }

    const data = await response.json();
    return data.secretValue || null;
  } catch (error) {
    logger.error({ err: error.message, secretRef }, 'Failed to resolve secret');
    return null;
  }
}

function isInitialized() {
  return initialized;
}

function getConfig() {
  return config;
}

module.exports = { init, resolveSecret, isSecretRef, isInitialized, getConfig };