const axios = require('axios');
const encryption = require('../services/encryption');

class DynamicAdapter {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.auth = config.auth || { type: 'none' };
    this.customHeaders = config.headers || {};
    this.timeout = config.timeout || 30000;
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
        const username = encryption.decrypt(credentials.username);
        const password = encryption.decrypt(credentials.token);
        if (!username || !password) return {};
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        return { 'Authorization': `Basic ${auth}` };

      case 'bearer':
        const token = encryption.decrypt(credentials.token);
        if (!token) return {};
        return { 'Authorization': `Bearer ${token}` };

      case 'apiKey':
        const key = encryption.decrypt(credentials.key);
        const value = encryption.decrypt(credentials.value);
        if (!key || !value) return {};
        const addTo = credentials.addTo || 'header';
        if (addTo === 'header') {
          return { [key]: value };
        }
        return {};

      case 'oauth2':
        const accessToken = encryption.decrypt(credentials.accessToken);
        if (!accessToken) return {};
        return { 'Authorization': `Bearer ${accessToken}` };

      default:
        return {};
    }
  }

  getQueryParams() {
    const { type, credentials } = this.auth;
    
    if (type === 'apiKey' && credentials.addTo === 'query') {
      const key = encryption.decrypt(credentials.key);
      const value = encryption.decrypt(credentials.value);
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
    const { params, headers } = options;
    
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

    try {
      const response = await this.client.request(config);
      return {
        data: response.data,
        status: response.status,
        headers: response.headers
      };
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`API Error: ${message}`);
    }
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
}

module.exports = DynamicAdapter;
