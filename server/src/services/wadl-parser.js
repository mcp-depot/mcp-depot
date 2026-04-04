const axios = require('axios');
const yaml = require('js-yaml');
const JenkinsParser = require('./jenkins-parser');

const COMMON_WADL_PATHS = [
  '/rest/api/2/apidocs?type=wadl',
  '/rest/api/2/apidocs',
  '/rest/api/2?depth=1',
  '/api/2/apidocs',
  '/api-docs',
  '/rest/api/2'
];

class WADLParser {
  constructor(baseUrl, auth = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.auth = auth;
    this.spec = null;
  }

  getAuthHeaders() {
    if (!this.auth || this.auth.type === 'none') return {};
    
    const crypto = require('crypto');
    const key = require('../services/encryption');
    
    const decrypt = (val) => {
      if (!val) return '';
      try { return key.decrypt(val); } catch { return val; }
    };

    switch (this.auth.type) {
      case 'basic':
        const username = decrypt(this.auth.credentials?.username);
        const password = decrypt(this.auth.credentials?.token);
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        return { 'Authorization': `Basic ${auth}` };
      case 'bearer':
        const token = decrypt(this.auth.credentials?.token);
        return { 'Authorization': `Bearer ${token}` };
      case 'apiKey':
        const keyName = decrypt(this.auth.credentials?.key);
        const keyValue = decrypt(this.auth.credentials?.value);
        return { [keyName]: keyValue };
      default:
        return {};
    }
  }

  async fetchWADL(urlOrPath) {
    let url = urlOrPath;
    
    if (!urlOrPath.startsWith('http')) {
      url = `${this.baseUrl}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
    }

    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/vnd.sun.wadl+xml, application/xml, text/xml',
        ...this.getAuthHeaders()
      },
      timeout: 15000
    });

    return response.data;
  }

  parseWADL(wadlXml) {
    const endpoints = [];
    const resources = this.extractResources(wadlXml);
    
    for (const resource of resources) {
      for (const method of resource.methods) {
        const path = resource.path;
        const name = this.generateName(method, path);
        
        const params = [];
        
        for (const param of method.params || []) {
          params.push({
            name: param.name,
            in: param.type?.includes('query') ? 'query' : 'path',
            required: param.required || false,
            type: this.mapType(param.type),
            description: param.doc || ''
          });
        }

        let body = null;
        if (method.representation) {
          body = {
            type: 'object',
            properties: {}
          };
        }

        endpoints.push({
          path: path,
          method: method.name?.toUpperCase() || 'GET',
          operationId: name.replace(/\s+/g, ''),
          summary: name,
          description: method.doc || '',
          params,
          body,
          tags: [resource.tag || 'Default']
        });
      }
    }

    return {
      info: {
        title: 'API',
        version: '1.0.0',
        description: 'Discovered from WADL'
      },
      baseUrl: this.baseUrl,
      endpoints,
      total: endpoints.length
    };
  }

  extractResources(wadlXml) {
    const resources = [];
    
    const resourceRegex = /<resource\s+(?:[^>]*?)?path="([^"]*)"[^>]*>([\s\S]*?)<\/resource>/gi;
    let match;
    
    while ((match = resourceRegex.exec(wadlXml)) !== null) {
      const path = match[1];
      const content = match[2];
      const methods = this.extractMethods(content);
      
      resources.push({ path, methods });
    }

    if (resources.length === 0) {
      const methodRegex = /<method\s+(?:[^>]*?)?name="(GET|POST|PUT|DELETE|PATCH)"[^>]*>([\s\S]*?)<\/method>/gi;
      while ((match = methodRegex.exec(wadlXml)) !== null) {
        resources.push({
          path: '/',
          methods: [{
            name: match[1],
            params: [],
            representation: null,
            doc: ''
          }]
        });
      }
    }

    return resources;
  }

  extractMethods(content) {
    const methods = [];
    const methodRegex = /<method\s+[^>]*name="(GET|POST|PUT|DELETE|PATCH)"[^>]*>([\s\S]*?)<\/method>/gi;
    let match;
    
    while ((match = methodRegex.exec(content)) !== null) {
      const params = [];
      const paramRegex = /<param\s+([^>]*)\/?>/gi;
      let paramMatch;
      
      while ((paramMatch = paramRegex.exec(match[2])) !== null) {
        const paramAttrs = paramMatch[1];
        const nameMatch = paramAttrs.match(/name="([^"]*)"/);
        const styleMatch = paramAttrs.match(/style="([^"]*)"/);
        const requiredMatch = paramAttrs.match(/required="([^"]*)"/);
        
        if (nameMatch) {
          params.push({
            name: nameMatch[1],
            type: styleMatch ? styleMatch[1] : 'query',
            required: requiredMatch?.[1] === 'true',
            doc: ''
          });
        }
      }

      const docMatch = match[2].match(/<doc[^>]*>([^<]*)/);
      
      methods.push({
        name: match[1],
        params,
        representation: match[2].includes('<representation') ? {} : null,
        doc: docMatch ? docMatch[1] : ''
      });
    }

    return methods;
  }

  generateName(method, path) {
    const parts = path.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1] || 'api';
    const methodName = method.name?.toLowerCase() || 'get';
    
    return `${methodName}${lastPart.charAt(0).toUpperCase() + lastPart.slice(1)}`;
  }

  mapType(type) {
    if (!type) return 'string';
    if (type.includes('int') || type.includes('long')) return 'integer';
    if (type.includes('boolean')) return 'boolean';
    if (type.includes('double') || type.includes('float')) return 'number';
    return 'string';
  }

  async discover() {
    for (const path of COMMON_WADL_PATHS) {
      try {
        const wadlData = await this.fetchWADL(path);
        if (wadlData && (wadlData.includes('application/vnd.sun.wadl') || wadlData.includes('<resources'))) {
          return this.parseWADL(wadlData);
        }
      } catch (e) {
        continue;
      }
    }

    try {
      const rootWadl = await this.fetchWADL('/rest/api/2');
      if (rootWadl && rootWadl.includes('<resources')) {
        return this.parseWADL(rootWadl);
      }
    } catch (e) {
      throw new Error(`Failed to discover WADL specification: ${e.message}`);
    }

    throw new Error('No WADL specification found. Try providing credentials or checking the API URL.');
  }
}

module.exports = WADLParser;