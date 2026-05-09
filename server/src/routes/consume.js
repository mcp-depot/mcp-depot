const express = require('express');
const Joi = require('joi');
const { optionalApiKey } = require('../middleware/auth');
const Integration = require('../models/Integration');
const Tool = require('../models/Tool');
const AdapterFactory = require('../adapters');
const audit = require('../services/audit');
const { logToolCall } = require('../services/tool-logger');
const logger = require('../services/logger');
const encryption = require('../services/encryption');
const secretStore = require('../services/secret-store');
const { executeCompositeTool } = require('../services/compositeExecutor');
const { pruneNulls } = require('../services/body-utils');

function coerceParam(value, paramDefs, key) {
  const type = paramDefs?.[key]?.type;
  if (type === 'number' || type === 'integer') return Number(value);
  if (type === 'boolean') return value === 'true' || value === true;
  return value;
}

const router = express.Router();

const executeToolSchema = Joi.object({
  params: Joi.object().default({}),
  headers: Joi.object().default({}),
  body: Joi.any()
});

const proxyRequestSchema = Joi.object({
  integrationId: Joi.string().required(),
  method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').required(),
  path: Joi.string().required(),
  data: Joi.any(),
  params: Joi.object().default({}),
  headers: Joi.object().default({})
});

const getUserCredentials = async (userId, integrationId) => {
  if (!userId) return null;
  const UserIntegrationCredentials = require('../models/UserIntegrationCredentials');
  const userCreds = await UserIntegrationCredentials.findOne({
    where: { userId, integrationId, isActive: true }
  });
  if (userCreds && userCreds.credentials) {
    return encryption.decrypt(userCreds.credentials);
  }
  return null;
};

router.get('/integrations', optionalApiKey, async (req, res) => {
  try {
    const query = req.user ? { userId: req.user.id } : {};
    
    const integrations = await Integration.findAll({
      where: query,
      attributes: ['id', 'type', 'name', 'description', 'config', 'isActive', 'metadata'],
      order: [['createdAt', 'DESC']]
    });

    res.json(integrations.map(i => ({
      _id: i.id,
      type: i.type,
      name: i.name,
      description: i.description,
      baseUrl: i.config.baseUrl,
      isActive: i.isActive
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list integrations' });
  }
});

router.get('/integrations/:id', optionalApiKey, async (req, res) => {
  try {
    const integration = await Integration.findByPk(req.params.id);
    
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json({
      _id: integration.id,
      type: integration.type,
      name: integration.name,
      description: integration.description,
      baseUrl: integration.config.baseUrl,
      isActive: integration.isActive
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get integration' });
  }
});

router.post('/tools/:toolId/execute', optionalApiKey, async (req, res) => {
  try {
    const { error, value } = executeToolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const tool = await Tool.findByPk(req.params.toolId);
    
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    if (!tool.isActive) {
      return res.status(400).json({ error: 'Tool is disabled' });
    }

    const integration = await Integration.findByPk(tool.integrationId);
    
    if (!integration || !integration.isActive) {
      return res.status(400).json({ error: 'Integration is not active' });
    }

    if (tool.type === 'composite') {
      const userId = req.user?.id || (req.apiKey?.userId) || null;
      const result = await executeCompositeTool(tool, req.body.params || {}, userId);
      return res.json(result);
    }

    // Check if credentials are required
    const authType = integration.config?.auth?.type || 'none';
    const requiresCredentials = authType !== 'none';
    const hasIntegrationCredentials = !!(integration.config?.auth?.credentials || integration.config?.auth?.key);
    
    // Get user credentials if authenticated
    const userId = req.user?.id || (req.apiKey?.userId) || null;
    const userCreds = await getUserCredentials(userId, integration.id);
    
    // Check if this is a shared integration where user is not the owner
    const isSharedForUser = integration.visibility === 'shared' && 
                           integration.userId !== userId && 
                           req.user?.role !== 'admin';
    
    // For shared integrations, user MUST have their own credentials
    if (requiresCredentials && isSharedForUser && !userCreds) {
      return res.status(403).json({ 
        error: 'Credentials required',
        message: 'Please connect to this shared integration and add your credentials first.',
        integrationId: integration.id,
        integrationName: integration.name,
        authType
      });
    }
    
    // Validate credentials requirement for non-shared integrations
    if (requiresCredentials && !hasIntegrationCredentials && !userCreds) {
      return res.status(403).json({ 
        error: 'Credentials required',
        message: `This integration requires authentication. Please configure your credentials first.`,
        integrationId: integration.id,
        integrationName: integration.name,
        authType
      });
    }
    
    // For shared integrations where user is not owner, only use user credentials
    // For non-shared or owner, use integration credentials as fallback
    let config = { ...integration.config };
    if (isSharedForUser) {
      // Shared integration - MUST use user's own credentials
      if (userCreds) {
        config.auth = userCreds;
      } else {
        // Don't use integration credentials - force user to connect
        config.auth = { type: 'none' };
      }
    } else if (userCreds) {
      // Non-shared or owner - use user credentials if available
      config.auth = userCreds;
    }

    // Resolve secrets from external secret store (Infisical)
    if (secretStore.isInitialized()) {
      const credentials = config.auth?.credentials;
      if (credentials) {
        const resolveIfNeeded = async (cred) => {
          for (const [key, value] of Object.entries(cred)) {
            if (typeof value === 'string' && secretStore.isSecretRef(value)) {
              logger.info({ key, value }, 'Resolving Infisical secret');
              const resolved = await secretStore.resolveSecret(value);
              logger.info({ key, resolved: resolved?.substring(0, 20), fullLength: resolved?.length }, 'Resolved Infisical secret');
              if (resolved) cred[key] = resolved;
            }
          }
        };
        await resolveIfNeeded(credentials);
      }
    }
    
    if (integration.name === 'MCP Depot' || integration.name === 'MCP Depot Sessions' || integration.name === 'MCP Depot - AI Tools') {
      const apiKey = req.headers['x-api-key'];
      const jwt = req.headers['authorization'];
      if (apiKey) {
        config = { ...config, headers: { ...config.headers, 'x-api-key': apiKey } };
      } else if (jwt) {
        config = { ...config, headers: { ...config.headers, 'Authorization': jwt } };
      }
    }
    
    const adapter = AdapterFactory.create(integration.type, {
      ...config,
      integrationId: integration.id
    }, { userId: req.user?.id });
    
    const { params, headers, body } = req.body;
    const mergedParams = { ...tool.endpoint.params, ...params };
    const mergedHeaders = { ...tool.endpoint.headers, ...headers };

    let path = tool.endpoint.path;
    const pathParams = {};
    const queryParams = {};
    let bodyParams = body || tool.endpoint.body || {};
    const hasBodyTemplate = !!(tool.endpoint.body && Object.keys(tool.endpoint.body).length > 0);
    
    for (const [key, value] of Object.entries(mergedParams)) {
      if (value === null || value === undefined) continue;
      if (path.includes(`{${key}}`)) {
        pathParams[key] = value;
      } else if (['POST', 'PUT', 'PATCH'].includes(tool.endpoint.method)) {
        const bodyTemplateVars = new Set(
          (JSON.stringify(tool.endpoint.body || {}).match(/\{(\w+)\}/g) || [])
            .map(m => m.slice(1, -1))
        );
        if (!bodyTemplateVars.has(key) && !hasBodyTemplate) {
          bodyParams[key] = value;
        }
      } else {
        queryParams[key] = value;
      }
    }
    
    for (const [key, value] of Object.entries(pathParams)) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }
    
    if (typeof bodyParams === 'object' && bodyParams !== null) {
      bodyParams = JSON.parse(JSON.stringify(bodyParams)
        .replace(/"(\{\w+\})"/g, (match, placeholder) => {
          const key = placeholder.slice(1, -1);
          if (mergedParams[key] === undefined) return match;
          const coerced = coerceParam(mergedParams[key], tool.endpoint.params, key);
          return JSON.stringify(coerced);
        })
        .replace(/\{(\w+)\}/g, (match, key) => {
          if (mergedParams[key] === undefined) return 'null';
          const coerced = coerceParam(mergedParams[key], tool.endpoint.params, key);
          return String(coerced);
        }));
      bodyParams = pruneNulls(bodyParams);
    }
    
    let result;
    const startTime = Date.now();
    let callSuccess = true;
    let callError = null;
    let responseStatus = 200;

    try {
      if (tool.mockEnabled && tool.mockResponse) {
        let mockStr = JSON.stringify(tool.mockResponse);
        mockStr = mockStr.replace(/"\{(\w+)\}"/g, (match, key) =>
          mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : `"${key}"`
        );
        result = JSON.parse(mockStr);
      } else {
        switch (tool.endpoint.method) {
          case 'GET':
            result = await adapter.get(path, { params: queryParams, headers: mergedHeaders });
            break;
          case 'POST':
            result = await adapter.post(path, bodyParams, { params: queryParams, headers: mergedHeaders });
            break;
          case 'PUT':
            result = await adapter.put(path, bodyParams, { params: queryParams, headers: mergedHeaders });
            break;
          case 'PATCH':
            result = await adapter.patch(path, bodyParams, { params: queryParams, headers: mergedHeaders });
            break;
          case 'DELETE':
            result = await adapter.delete(path, { params: queryParams, headers: mergedHeaders });
            break;
        }
      }
    } catch (callError) {
      callSuccess = false;
      
      if (callError.message === 'CREDENTIALS_REQUIRED') {
        return res.status(403).json({
          error: 'Credentials required',
          message: 'Please connect to this shared integration and add your credentials first.',
          integrationId: integration.id,
          integrationName: integration.name,
          authType: integration.config.auth?.type
        });
      }
      
      responseStatus = callError.response?.status || 500;
      throw callError;
    } finally {
      const responseTime = Date.now() - startTime;
      
      const userId = req.user?.id || (req.apiKey?.userId) || null;
      const callerId = req.apiKey?.keyId || req.headers['x-mcp-client'] || req.ip;
      const callerType = req.apiKey
      ? 'api_key'
      : req.headers['x-mcp-client']
        ? 'mcp'
        : req.headers['x-caller'] === 'ui'
          ? 'ui'
          : 'rest';
      
      if (userId) {
        await logToolCall({
          toolId: tool.id,
          userId: userId,
          integrationId: integration.id,
          callerId,
          callerType,
          method: tool.endpoint.method,
          path: tool.endpoint.path,
          requestHeaders: req.headers,
          requestBody: req.body,
          queryParams: mergedParams,
          responseStatus,
          responseBody: result,
          responseTime,
          errorMessage: callError?.message,
          success: callSuccess,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
      }
    }

    tool.usageCount += 1;
    tool.lastUsedAt = new Date();
    await tool.save();

    if (req.user) {
      await audit.log({
        userId: req.user.id,
        action: 'execute_tool',
        integrationType: integration.type,
        integrationId: integration.id,
        details: { toolId: tool.id, toolName: tool.name, method: tool.endpoint.method },
        status: 'success'
      });
    }

    res.json(result);
  } catch (error) {
    if (req.user) {
      await audit.log({
        userId: req.user.id,
        action: 'execute_tool',
        details: { toolId: req.params.toolId, error: error.message },
        status: 'failure',
        errorMessage: error.message
      });
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/trigger', optionalApiKey, async (req, res) => {
  try {
    const { integrationId, method, path, data, params, headers } = req.body;

    if (!integrationId || !path) {
      return res.status(400).json({ error: 'integrationId and path are required' });
    }

    const integration = await Integration.findByPk(integrationId);
    
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    if (!integration.isActive) {
      return res.status(400).json({ error: 'Integration is not active' });
    }

    let config = { ...integration.config };
    if (integration.name === 'MCP Depot' || integration.name === 'MCP Depot Sessions' || integration.name === 'MCP Depot - AI Tools') {
      const apiKey = req.headers['x-api-key'];
      const jwt = req.headers['authorization'];
      if (apiKey) {
        config = { ...config, headers: { ...config.headers, 'x-api-key': apiKey } };
      } else if (jwt) {
        config = { ...config, headers: { ...config.headers, 'Authorization': jwt } };
      }
    }

    const adapter = AdapterFactory.create(integration.type, config);
    
    let result;
    const reqMethod = (method || 'GET').toUpperCase();

    switch (reqMethod) {
      case 'GET':
        result = await adapter.get(path, { params: params || {}, headers: headers || {} });
        break;
      case 'POST':
        result = await adapter.post(path, data, { params: params || {}, headers: headers || {} });
        break;
      case 'PUT':
        result = await adapter.put(path, data, { params: params || {}, headers: headers || {} });
        break;
      case 'PATCH':
        result = await adapter.patch(path, data, { params: params || {}, headers: headers || {} });
        break;
      case 'DELETE':
        result = await adapter.delete(path, { params: params || {}, headers: headers || {} });
        break;
      default:
        return res.status(400).json({ error: 'Invalid method' });
    }

    if (req.user) {
      await audit.log({
        userId: req.user.id,
        action: 'trigger_api',
        integrationType: integration.type,
        integrationId: integration.id,
        details: { method: reqMethod, path },
        status: 'success'
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
