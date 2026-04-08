const logger = require('./logger');

let config = null;
let initialized = false;
let accessToken = null;
let tokenExpiry = 0;

async function authenticate() {
  const response = await fetch(`${config.siteUrl}/api/v1/auth/universal-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      clientId: config.clientId, 
      clientSecret: config.clientSecret 
    })
  });

  if (!response.ok) {
    throw new Error(`Infisical auth failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.accessToken;
  
  // Use actual TTL from Infisical response (expiresIn is in seconds)
  // Default to 5 minutes if not provided
  const ttlSeconds = data.expiresIn || 300;
  tokenExpiry = Date.now() + (ttlSeconds * 1000);
  
  logger.info({ expiresIn: `${ttlSeconds} seconds` }, 'Infisical access token obtained');
}

async function getAccessToken() {
  if (!accessToken || Date.now() >= tokenExpiry - 60000) {
    // Refresh if expired or about to expire (1 min buffer)
    await authenticate();
  }
  return accessToken;
}

async function init(options) {
  if (!options || !options.enabled) {
    initialized = false;
    config = null;
    accessToken = null;
    return;
  }

  config = {
    provider: options.provider || 'infisical',
    siteUrl: options.siteUrl,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    workspaceId: options.workspaceId,  // This is actually the project ID
    environment: options.environment || 'dev'
  };

  try {
    await authenticate();
    initialized = true;
    logger.info({ provider: config.provider }, 'Secret store initialized');
  } catch (error) {
    initialized = false;
    config = null;
    accessToken = null;
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
  const parts = path.split('/');
  
  // Format: infisical://env/secretName (e.g., infisical://prod/JIRA_TOKEN)
  // Or: infisical://env/folder/secretName (e.g., infisical://prod/backend/JIRA_TOKEN)
  let env, folderPath, secretName;
  
  if (parts.length >= 3) {
    env = parts[0];  // e.g., "prod"
    folderPath = '/' + parts.slice(1, -1).join('/');  // e.g., "/backend"
    secretName = parts[parts.length - 1];  // e.g., "JIRA_TOKEN"
  } else if (parts.length === 2) {
    env = parts[0];  // e.g., "prod"
    folderPath = '/';
    secretName = parts[1];
  } else {
    throw new Error(`Invalid secret ref: ${secretRef}. Expected: infisical://env/secret-name or infisical://env/folder/secret-name`);
  }

  try {
    const token = await getAccessToken();
    logger.info({ tokenPreview: token?.substring(0, 20), siteUrl: config.siteUrl, projectId: config.workspaceId, env, folderPath, secretName }, 'Fetching secret from Infisical');
    
    // Use v3 secrets API: /api/v3/secrets/raw/{secretName}?workspaceId=<projectId>&environment=<env>&secretPath=<path>
    const url = `${config.siteUrl}/api/v3/secrets/raw/${encodeURIComponent(secretName)}` +
      `?workspaceId=${config.workspaceId}&environment=${env}&secretPath=${encodeURIComponent(folderPath)}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    logger.info({ status: response.status, statusText: response.statusText }, 'Infisical response');

    if (!response.ok) {
      throw new Error(`Failed to fetch secret: ${response.status}`);
    }

    const data = await response.json();
    logger.info({ dataKeys: Object.keys(data), hasSecret: !!data.secret, secretValueLength: data.secret?.secretValue?.length }, 'Infisical response parsed');
    return data.secret?.secretValue || null;
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