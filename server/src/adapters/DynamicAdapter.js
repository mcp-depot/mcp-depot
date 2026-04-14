const axios = require('axios');
const encryption = require('../services/encryption');

class DynamicAdapter {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.auth = config.auth || { type: 'none' };
    this.customHeaders = config.headers || {};
    this.timeout = config.timeout || 30000;
    this.integrationId = config.integrationId;
    this.client = null;
    this.initClient();
  }

  initClient() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...this.customHeaders
      }
    });
  }

  getAuthHeaders() {
    const { type, credentials } = this.auth;
    
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
        
        const tokenData = credentials.tokenData || {};
        if (tokenData.expiresIn && tokenData.createdAt) {
          const expiresAt = tokenData.createdAt + (tokenData.expiresIn * 1000);
          const fiveMinutes = 5 * 60 * 1000;
          
          if (Date.now() > (expiresAt - fiveMinutes) && credentials.refreshToken) {
            // Signal that refresh is needed - caller should handle this
            return { 'Authorization': `Bearer ${accessToken}`, 'X-OAuth-Refresh': 'true' };
          }
        }
        
        return { 'Authorization': `Bearer ${accessToken}` };
      }

      default:
        return {};
    }
  }

  getQueryParams() {
    const { type, credentials } = this.auth;
    
    if (type === 'apiKey' && credentials.addTo === 'query') {
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
        headers: this.getAuthHeaders(),
        params: this.getQueryParams()
      });
      return { success: true, status: response.status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async makeRequest(method, path, data = null, options = {}) {
    const { params, headers, retries = 3 } = options;
    
    const config = {
      method,
      url: path,
      headers: {
        ...this.getAuthHeaders(),
        ...this.customHeaders,
        ...headers
      },
      params: {
        ...this.getQueryParams(),
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
        
        const message = error.response?.data?.message || error.response?.data?.error || error.message;
        throw new Error(`API Error: ${message}`);
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
      
      return encryption.decrypt(freshTokens.accessToken) || freshTokens.accessToken;
    } catch (err) {
      return null;
    }
  }
}

module.exports = DynamicAdapter;
