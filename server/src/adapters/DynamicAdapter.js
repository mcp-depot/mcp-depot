const axios = require('axios');
const https = require('https');
const encryption = require('../services/encryption');
const logger = require('../services/logger');
const envConfig = require('../config/env');

class DynamicAdapter {
  constructor(config, options = {}) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.auth = config.auth || { type: 'none' };
    this.customHeaders = config.headers || {};
    this.timeout = config.timeout || 30000;
    this.integrationId = config.integrationId;
    this.userId = options.userId || null;
    this.client = null;
    this.initClient();
  }

  initClient() {
    const skipSsl = this.config.allowSelfSignedCerts || envConfig.allowSelfSignedCerts;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...this.customHeaders
      },
      ...(skipSsl ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {})
    });
  }

  async resolveCredentials() {
    if (!this.userId || !this.integrationId) {
      return this.auth;
    }
    
    if (this.auth.type === 'none') {
      return this.auth;
    }
    
    if (this.auth.credentials) {
      const { UserIntegrationCredentials } = require('../models');
      const userCred = await UserIntegrationCredentials.findOne({
        where: {
          userId: this.userId,
          integrationId: this.integrationId,
          isActive: true
        }
      });
      
      if (userCred?.credentials) {
        try {
          const decrypted = JSON.parse(encryption.decrypt(userCred.credentials));
          return {
            ...this.auth,
            credentials: decrypted
          };
        } catch (e) {
          // User cred exists but couldn't decrypt - return null to force re-auth
          return null;
        }
      }
      
      // For shared integrations with userId, require user to provide their own credentials
      // Do NOT fall back to integration credentials
      return null;
    }
    
    // For non-shared integrations (no userId), use integration credentials
    return this.auth;
  }

  async getAuthHeaders() {
    const resolvedAuth = await this.resolveCredentials();
    
    if (!resolvedAuth) {
      throw new Error('CREDENTIALS_REQUIRED');
    }
    
    const { type, credentials } = resolvedAuth;
    
    if (!credentials) return {};

    switch (type) {
      case 'basic':
        const username = encryption.decrypt(credentials.username) || credentials.username;
        const password = encryption.decrypt(credentials.token) || credentials.token;
        if (!username || !password) return {};
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        return { 'Authorization': `Basic ${auth}` };

      case 'bearer':
      case 'infisical':
        const token = encryption.decrypt(credentials.token) || credentials.token;
        if (!token) return {};
        return { 'Authorization': `Bearer ${token}` };

      case 'token':
        const tokenValue = encryption.decrypt(credentials.token) || credentials.token;
        if (!tokenValue) return {};
        const prefix = credentials.prefix || 'Token';
        return { 'Authorization': `${prefix} ${tokenValue}` };

      case 'custom':
        const customAuth = credentials.value || credentials.token || '';
        if (!customAuth) return {};
        return { 'Authorization': customAuth };

      case 'apiKey':
        const key = encryption.decrypt(credentials.key) || credentials.key;
        const value = encryption.decrypt(credentials.value) || credentials.value;
        if (!key || !value) return {};
        const addTo = credentials.addTo || 'header';
        if (addTo === 'header') {
          return { [key]: value };
        }
        return {};

      case 'oauth2': {
        const accessToken = encryption.decrypt(credentials.accessToken) || credentials.accessToken;
        if (!accessToken) return {};
        return { 'Authorization': `Bearer ${accessToken}` };
      }

      default:
        return {};
    }
  }

  async getQueryParams() {
    const resolvedAuth = await this.resolveCredentials();
    const { type, credentials } = resolvedAuth;
    
    if (type === 'apiKey' && credentials?.addTo === 'query') {
      const key = encryption.decrypt(credentials.key) || credentials.key;
      const value = encryption.decrypt(credentials.value) || credentials.value;
      if (!key || !value) return {};
      return { [key]: value };
    }
    
    return {};
  }

  async testConnection() {
    try {
      const response = await this.client.request({
        method: 'GET',
        url: '/',
        headers: await this.getAuthHeaders(),
        params: await this.getQueryParams()
      });
      return { success: true, status: response.status };
    } catch (error) {
      const errorDetail = error?.response?.data
          ? JSON.stringify(error.response.data)
          : (error?.message || String(error));
        return { success: false, error: errorDetail };
    }
  }

  async makeRequest(method, path, data = null, options = {}) {
    const { params, headers, retries = 3 } = options;
    
    if (this.auth.type === 'oauth2') {
      await this.ensureValidToken();
    }
    
    const config = {
      method,
      url: path,
      headers: {
        ...await this.getAuthHeaders(),
        ...this.customHeaders,
        ...headers
      },
      params: {
        ...await this.getQueryParams(),
        ...params
      }
    };

    if (data) config.data = data;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.request(config);
        return {
          data: response.data,
          status: response.status,
          headers: response.headers
        };
      } catch (error) {
        const status = error.response?.status;
        const retryAfter = error.response?.headers?.['retry-after'];
        
        if (status === 429 && retryAfter) {
          const waitMs = parseInt(retryAfter) * 1000;
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        
        if (attempt < retries && status >= 500) {
          const delay = Math.min(Math.pow(2, attempt) * 500, 30000);
          await new Promise(r => setTimeout(r, delay));
          lastError = error;
          continue;
        }
        
        const errorDetail = error?.response?.data
          ? JSON.stringify(error.response.data)
          : (error?.message || String(error));
        throw new Error(`API Error: ${errorDetail}`);
      }
    }
    
    throw lastError;
  }

  async get(path, options = {}) {
    return this.makeRequest('GET', path, null, options);
  }

  async post(path, data, options = {}) {
    return this.makeRequest('POST', path, data, options);
  }

  async put(path, data, options = {}) {
    return this.makeRequest('PUT', path, data, options);
  }

  async patch(path, data, options = {}) {
    return this.makeRequest('PATCH', path, data, options);
  }

  async delete(path, options = {}) {
    return this.makeRequest('DELETE', path, null, options);
  }

  async fetchBinary(path, options = {}) {
    const { params, headers } = options;
    const config = {
      method: 'GET',
      url: path,
      headers: {
        ...await this.getAuthHeaders(),
        ...this.customHeaders,
        ...headers
      },
      params: {
        ...await this.getQueryParams(),
        ...params
      },
      responseType: 'arraybuffer'
    };
    const response = await this.client.request(config);
    return {
      data: response.data,
      status: response.status,
      headers: response.headers
    };
  }

  async ensureValidToken() {
    if (this.auth.type !== 'oauth2') return;
    
    const { credentials } = this.auth;
    if (!credentials?.accessToken) return null;
    
    const tokenData = credentials.tokenData || {};
    if (!tokenData.expiresIn || !tokenData.createdAt) return;
    
    const expiresAt = tokenData.createdAt + (tokenData.expiresIn * 1000);
    const fiveMinutes = 5 * 60 * 1000;
    
    if (Date.now() < (expiresAt - fiveMinutes)) return;
    
    const { getValidToken } = require('../services/oauth');
    const provider = credentials.provider || 'github';
    
    try {
      const freshTokens = await getValidToken(provider, { oauth: credentials });
      if (!freshTokens) return null;
      
      this.auth.credentials.accessToken = freshTokens.accessToken;
      if (freshTokens.refreshToken) {
        this.auth.credentials.refreshToken = freshTokens.refreshToken;
      }
      if (freshTokens.createdAt) {
        this.auth.credentials.tokenData.createdAt = freshTokens.createdAt;
      }
      if (freshTokens.expiresIn) {
        this.auth.credentials.tokenData.expiresIn = freshTokens.expiresIn;
      }
      
      if (this.integrationId) {
        this._persistCredentials();
      }
      
      return this.auth.credentials.accessToken;
    } catch (err) {
      return null;
    }
  }
  
  async _persistCredentials() {
    try {
      const { Integration } = require('../models');
      const integration = await Integration.findByPk(this.integrationId);
      if (integration) {
        integration.config.auth.credentials = this.auth.credentials;
        await integration.save();
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to persist OAuth credentials');
    }
  }
}

module.exports = DynamicAdapter;
