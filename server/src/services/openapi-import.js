const axios = require('axios');
const { loadModels } = require('../config/database');

async function parseOpenApiSpec(specUrl, specContent = null) {
  let spec;
  
  if (specUrl) {
    try {
      const response = await axios.get(specUrl, { timeout: 10000 });
      spec = response.data;
    } catch (error) {
      throw new Error(`Failed to fetch OpenAPI spec: ${error.message}`);
    }
  } else if (specContent) {
    try {
      spec = typeof specContent === 'string' ? JSON.parse(specContent) : specContent;
    } catch (error) {
      throw new Error(`Failed to parse OpenAPI spec: ${error.message}`);
    }
  } else {
    throw new Error('Either specUrl or specContent must be provided');
  }
  
  const info = spec.info || {};
  const baseUrl = spec.servers?.[0]?.url || '';
  const paths = spec.paths || {};
  const components = spec.components || spec.definitions || {};
  
  const tools = [];
  
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
        const operationId = operation.operationId || `${method}_${path.replace(/[\/{}]/g, '_')}`;
        const summary = operation.summary || operationId;
        const description = operation.description || '';
        
        const params = {};
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
        
        for (const p of [...pathParams, ...queryParams]) {
          params[p.name] = {
            type: p.schema?.type || 'string',
            required: p.required || false,
            description: p.description || `Parameter: ${p.name}`
          };
        }
        
        const requestBody = operation.requestBody;
        if (requestBody) {
          const content = requestBody.content || {};
          const jsonContent = content['application/json'];
          if (jsonContent?.schema) {
            params.body = {
              type: 'object',
              required: requestBody.required || false,
              description: 'Request body (JSON)'
            };
          }
        }
        
        tools.push({
          name: operationId,
          description: description || summary,
          endpoint: {
            path: path,
            method: method.toUpperCase(),
            params,
            headers: {}
          }
        });
      }
    }
  }
  
  return {
    title: info.title || 'API',
    version: info.version || '1.0.0',
    baseUrl,
    tools
  };
}

async function importOpenApiTools(userId, integrationId, specUrl, specContent = null) {
  const { Tool } = loadModels();
  
  const parsed = await parseOpenApiSpec(specUrl, specContent);
  
  const created = [];
  const skipped = [];
  
  for (const tool of parsed.tools) {
    try {
      const existing = await Tool.findOne({
        where: { userId, integrationId, name: tool.name }
      });
      
      if (existing) {
        skipped.push({ name: tool.name, reason: 'already exists' });
        continue;
      }
      
      await Tool.create({
        userId,
        integrationId,
        name: tool.name,
        description: tool.description,
        endpoint: tool.endpoint,
        isActive: true
      });
      
      created.push(tool.name);
    } catch (error) {
      skipped.push({ name: tool.name, reason: error.message });
    }
  }
  
  return {
    created: created.length,
    skipped: skipped.length,
    tools: created,
    errors: skipped
  };
}

module.exports = {
  parseOpenApiSpec,
  importOpenApiTools
};