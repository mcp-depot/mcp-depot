const axios = require('axios');
const yaml = require('js-yaml');

class OpenAPIParser {
  constructor(baseUrl, auth = null) {
    this.baseUrl = baseUrl;
    this.auth = auth;
    this.spec = null;
  }

  async fetchSpec(urlOrPath) {
    let specUrl = urlOrPath;

    if (!urlOrPath.startsWith('http')) {
      specUrl = new URL(urlOrPath, this.baseUrl).href;
    }

    const response = await axios.get(specUrl, { timeout: 10000 });
    return response.data;
  }

  parseSpec(spec) {
    if (typeof spec === 'string') {
      if (spec.trim().startsWith('{')) {
        spec = JSON.parse(spec);
      } else {
        spec = yaml.load(spec);
      }
    }

    this.spec = spec;
    const info = spec.info || {};
    const servers = spec.servers || [];
    const basePath = servers[0]?.url || this.baseUrl;
    const definitions = spec.definitions || spec.components?.schemas || {};

    const resolving = new Set();

    const resolveRef = (ref) => {
      if (!ref || !ref.startsWith('#/')) return ref;
      if (resolving.has(ref)) return { type: 'object', properties: {} };
      const path = ref.replace('#/definitions/', '').replace('#/components/schemas/', '');
      const resolved = definitions[path];
      if (!resolved) return ref;
      resolving.add(ref);
      const result = resolveSchema(resolved);
      resolving.delete(ref);
      return result;
    };

    const resolveSchema = (schema) => {
      if (!schema) return null;
      if (schema.$ref) return resolveRef(schema.$ref);

      // Merge allOf sub-schemas into one flat object schema
      if (schema.allOf) {
        const merged = { type: 'object', properties: {}, required: [] };
        for (const sub of schema.allOf) {
          const resolved = resolveSchema(sub);
          if (resolved?.properties) Object.assign(merged.properties, resolved.properties);
          if (resolved?.required) merged.required.push(...resolved.required);
        }
        return merged;
      }

      if (schema.type === 'object' && schema.properties) {
        const resolved = { ...schema };
        resolved.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          resolved.properties[key] = resolveSchema(value);
        }
        return resolved;
      }
      return schema;
    };

    const generateBodyTemplate = (schema, keyPrefix = '') => {
      if (!schema || schema.type !== 'object' || !schema.properties) return null;
      const SKIP = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);
      const template = {};
      for (const [key, val] of Object.entries(schema.properties)) {
        if (SKIP.has(key)) continue;
        const varName = keyPrefix ? `${keyPrefix}_${key}` : key;
        if (val?.type === 'object' && val?.properties) {
          const nested = generateBodyTemplate(val, varName);
          if (nested) template[key] = nested;
        } else if (val?.type === 'array') {
          // skip — arrays need manual setup
        } else {
          template[key] = `{${varName}}`;
        }
      }
      return Object.keys(template).length > 0 ? template : null;
    };

    const endpoints = [];

    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
          const params = [];
          const pathParams = details.parameters?.filter(p => p.in === 'path') || [];
          const queryParams = details.parameters?.filter(p => p.in === 'query') || [];

          for (const p of pathParams) {
            params.push({
              name: p.name,
              in: 'path',
              required: p.required || false,
              type: p.schema?.type || 'string',
              description: p.description || ''
            });
          }

          for (const p of queryParams) {
            params.push({
              name: p.name,
              in: 'query',
              required: p.required || false,
              type: p.schema?.type || 'string',
              description: p.description || ''
            });
          }

          let bodySchema = null;

          // OpenAPI 3.x format
          const requestBody = details.requestBody?.content?.['application/json'];
          if (requestBody) {
            bodySchema = resolveSchema(requestBody.schema || requestBody);
          }

          // Swagger 2.0 format - check for body parameter
          if (!bodySchema) {
            const bodyParam = details.parameters?.find(p => p.in === 'body' || p.in === 'formData');
            if (bodyParam) {
              bodySchema = resolveSchema(bodyParam.schema) || {
                type: 'object',
                properties: bodyParam.schema || {},
                description: bodyParam.description
              };
            }
          }

          endpoints.push({
            path: path,
            method: method.toUpperCase(),
            operationId: details.operationId || null,
            summary: details.summary || '',
            description: details.description || '',
            params,
            body: bodySchema,
            bodyTemplate: bodySchema ? generateBodyTemplate(bodySchema) : null,
            tags: details.tags || []
          });
        }
      }
    }

    return {
      info: {
        title: info.title || 'API',
        version: info.version || '1.0.0',
        description: info.description || ''
      },
      baseUrl: basePath,
      endpoints,
      total: endpoints.length
    };
  }

  async discover(urlOrPath = '/openapi.json') {
    try {
      const specData = await this.fetchSpec(urlOrPath);
      return this.parseSpec(specData);
    } catch (error) {
      const commonPaths = [
        '/openapi.json',
        '/openapi.yaml',
        '/swagger.json',
        '/swagger.yaml',
        '/api-docs',
        '/api/openapi.json',
        '/api/swagger.json'
      ];

      for (const path of commonPaths) {
        try {
          const specData = await this.fetchSpec(path);
          return this.parseSpec(specData);
        } catch (e) {
          continue;
        }
      }

      throw new Error(`Failed to fetch OpenAPI spec: ${error.message}`);
    }
  }

  static getCommonOpenAPIPaths(service) {
    const knownPaths = {
      github: '/rest/openapi.json',
      gitlab: '/api/v4/swagger.json',
      jira: '/rest/api/2/swagger.json',
      jiraServiceManagement: '/rest/servicedeskapi/1.0/swagger.json',
      bitbucket: '/api/swagger.json',
      bitbucketServer: '/rest/api/2.0/apidocs',
      slack: '/openapi/manifest.json',
      notion: '/v1/openapi.json',
      stripe: '/v1/openapi.yaml',
      circleci: '/v2/openapi.yml'
    };
    return knownPaths[service] || '/openapi.json';
  }
}

module.exports = OpenAPIParser;