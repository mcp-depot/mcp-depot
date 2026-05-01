const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { sequelize, loadModels } = require('../config/database');
const Integration = require('../models/Integration');
const Tool = require('../models/Tool');
const { auth } = require('../middleware/auth');
const AdapterFactory = require('../adapters');
const audit = require('../services/audit');
const OpenAPIParser = require('../services/openapi-parser');
const WADLParser = require('../services/wadl-parser');
const encryption = require('../services/encryption');
const secretStore = require('../services/secret-store');
const logger = require('../services/logger');
const { executeComposite, executeCompositeTool } = require('../services/compositeExecutor');

const router = express.Router();

const integrationSchema = Joi.object({
  type: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  config: Joi.object({
    baseUrl: Joi.string().uri().required(),
    auth: Joi.object({
      type: Joi.string().valid('none', 'basic', 'bearer', 'token', 'custom', 'apiKey', 'oauth2').default('none'),
      credentials: Joi.object()
    }).default({ type: 'none' }),
    headers: Joi.object().default({}),
    timeout: Joi.number().default(30000)
  }).required(),
  metadata: Joi.object().default({})
});

const toolSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  endpoint: Joi.object({
    path: Joi.string().required(),
    method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').default('GET'),
    params: Joi.object().default({}),
    headers: Joi.object().default({}),
    body: Joi.any()
  }).required(),
  inputSchema: Joi.object().default({}),
  outputSchema: Joi.object().default({})
});

router.get('/', auth, async (req, res) => {
  try {
    let integrations;
    
    if (req.user.role === 'admin') {
      integrations = await Integration.findAll({
        order: [['createdAt', 'DESC']]
      });
    } else {
      const { User } = loadModels();
      const ownerIds = await User.findAll({
        where: { role: 'admin' },
        attributes: ['id'],
        raw: true
      });
      const adminIds = ownerIds.map(u => u.id);
      
      integrations = await Integration.findAll({
        where: {
          [Op.or]: [
            { userId: req.user.id },
            { visibility: 'shared', userId: { [Op.in]: adminIds } }
          ]
        },
        order: [['createdAt', 'DESC']]
      });
    }

    // Get tool counts for each integration
    const integrationIds = integrations.map(i => i.id);
    const toolCounts = await Tool.findAll({
      where: { integrationId: { [Op.in]: integrationIds } },
      attributes: ['integrationId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['integrationId'],
      raw: true
    });
    
    const toolCountMap = toolCounts.reduce((acc, tc) => {
      acc[tc.integrationId] = parseInt(tc.count);
      return acc;
    }, {});
    
    // Get user credentials status for each integration
    const { UserIntegrationCredentials, User } = loadModels();
    let userCredsMap = {};
    
    if (integrationIds.length > 0) {
      const userCreds = await UserIntegrationCredentials.findAll({
        where: {
          userId: req.user.id,
          integrationId: { [Op.in]: integrationIds },
          isActive: true
        },
        attributes: ['integrationId'],
        raw: true
      });
      userCredsMap = userCreds.reduce((acc, uc) => {
        acc[uc.integrationId] = true;
        return acc;
      }, {});
    }
    
    // Get owner names for shared integrations
    const ownerIds = [...new Set(integrations.filter(i => i.visibility === 'shared').map(i => i.userId))];
    const owners = ownerIds.length > 0 ? await User.findAll({
      where: { id: { [Op.in]: ownerIds } },
      attributes: ['id', 'name', 'email'],
      raw: true
    }) : [];
    const ownerMap = owners.reduce((acc, o) => { acc[o.id] = o; return acc; }, {});
    
    const sanitized = integrations.map(i => {
      const authType = i.config.auth?.type || 'none';
      const requiresCredentials = authType !== 'none';
      const hasUserCredentials = !!userCredsMap[i.id];
      const hasIntegrationCredentials = !!i.config.auth?.credentials;
      const isOwner = i.userId === req.user.id;
      const isShared = i.visibility === 'shared' && !isOwner;
      const owner = ownerMap[i.userId];
      
      return {
        _id: i.id,
        type: i.type,
        name: i.name,
        description: i.description,
        baseUrl: i.config.baseUrl,
        authType,
        requiresCredentials,
        hasUserCredentials,
        hasIntegrationCredentials,
        canUse: !requiresCredentials || hasUserCredentials || hasIntegrationCredentials || req.user.role === 'admin',
        isActive: i.isActive,
        visibility: i.visibility || 'private',
        isOwner,
        sharedByName: isShared ? (owner?.name || 'Admin') : null,
        sharedByEmail: isShared ? (owner?.email || '') : null,
        metadata: { 
          ...i.metadata,
          toolCount: toolCountMap[i.id] || 0
        },
        createdAt: i.createdAt,
        updatedAt: i.updatedAt
      };
    });

    res.json(sanitized);
  } catch (error) {
    logger.error({ err: error.message }, 'List integrations error');
    res.status(500).json({ error: 'Failed to list integrations' });
  }
});

router.get('/composite', auth, async (req, res) => {
  try {
    const { integrationId } = req.query;
    
    const where = { type: 'composite' };
    if (integrationId) {
      where.integrationId = integrationId;
    }
    
    const tools = await Tool.findAll({ where });
    
    res.json(tools.map(t => ({ ...t.toJSON(), _id: t.id })));
  } catch (error) {
    logger.error({ err: error.message }, 'Get composite tools error');
    res.status(500).json({ error: 'Failed to get composite tools' });
  }
});

router.post('/composite', auth, async (req, res) => {
  try {
    const { error, value } = compositeToolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { integrationId } = req.body;
    if (!integrationId) {
      return res.status(400).json({ error: 'integrationId is required' });
    }

    const integration = await Integration.findByPk(integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const simpleTools = await Tool.findAll({
      where: { integrationId, type: 'simple' }
    });
    const toolIds = simpleTools.map(t => t.id);
    
    for (const step of value.steps) {
      if (!toolIds.includes(step.toolId)) {
        return res.status(400).json({ 
          error: `Tool ${step.toolId} is not a valid simple tool in this integration` 
        });
      }
    }

    const tool = await Tool.create({
      userId: req.user.id,
      integrationId,
      name: value.name,
      description: value.description,
      endpoint: { path: '/composite', method: 'POST' },
      inputSchema: value.inputSchema,
      type: 'composite',
      steps: value.steps
    });

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.status(201).json(tool);
  } catch (error) {
    logger.error({ err: error.message }, 'Create composite tool error');
    res.status(500).json({ error: 'Failed to create composite tool' });
  }
});

router.get('/composite/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    const integration = await Integration.findByPk(tool.integrationId);
    
    res.json({
      ...tool.toJSON(),
      _id: tool.id,
      integration: integration ? {
        id: integration.id,
        name: integration.name,
        type: integration.type
      } : null
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Get composite tool error');
    res.status(500).json({ error: 'Failed to get composite tool' });
  }
});

router.put('/composite/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    const { error, value } = compositeToolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    await tool.update({
      name: value.name,
      description: value.description,
      inputSchema: value.inputSchema,
      steps: value.steps
    });

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json(tool);
  } catch (error) {
    logger.error({ err: error.message }, 'Update composite tool error');
    res.status(500).json({ error: 'Failed to update composite tool' });
  }
});

router.delete('/composite/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    await tool.destroy();

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error.message }, 'Delete composite tool error');
    res.status(500).json({ error: 'Failed to delete composite tool' });
  }
});

router.post('/composite/:id/test', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    const { inputs } = req.body;
    if (!inputs) {
      return res.status(400).json({ error: 'inputs are required' });
    }

    const result = await executeComposite(tool, inputs, req.user.id);
    
    res.json(result);
  } catch (error) {
    logger.error({ err: error.message }, 'Test composite tool error');
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    let integration;
    
    if (req.user.role === 'admin') {
      integration = await Integration.findOne({ where: { id: req.params.id } });
    } else {
      const { User } = loadModels();
      const adminIds = await User.findAll({
        where: { role: 'admin' },
        attributes: ['id'],
        raw: true
      }).then(admins => admins.map(a => a.id));
      
      integration = await Integration.findOne({
        where: {
          id: req.params.id,
          [Op.or]: [
            { userId: req.user.id },
            { visibility: 'shared', userId: { [Op.in]: adminIds } }
          ]
        }
      });
    }

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json({
      ...integration.toJSON(),
      _id: integration.id
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Get integration error');
    res.status(500).json({ error: 'Failed to get integration' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = integrationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { type, name, description, config, metadata } = value;

    let finalConfig = config;
    if (config && config.auth && config.auth.credentials && config.auth.type !== 'none') {
      const credentials = config.auth.credentials;
      if (credentials.token && !credentials.token.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.token)) {
        credentials.token = encryption.encrypt(credentials.token);
      }
      if (credentials.username && !credentials.username.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.username)) {
        credentials.username = encryption.encrypt(credentials.username);
      }
      if (credentials.apiKey && !credentials.apiKey.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.apiKey)) {
        credentials.apiKey = encryption.encrypt(credentials.apiKey);
      }
      finalConfig = config;
    }

    const integration = await Integration.create({
      userId: req.user.id,
      type,
      name,
      description,
      config: finalConfig,
      metadata
    });

    await audit.log({
      userId: req.user.id,
      action: 'create_integration',
      integrationType: type,
      integrationId: integration.id,
      details: { name, type },
      status: 'success'
    });

    res.status(201).json({
      _id: integration.id,
      type: integration.type,
      name: integration.name,
      description: integration.description,
      baseUrl: integration.config.baseUrl,
      authType: integration.config.auth?.type || 'none',
      isActive: integration.isActive,
      createdAt: integration.createdAt
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Create integration error');
    res.status(500).json({ error: 'Failed to create integration' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const integration = await Integration.findOne({
      where: whereClause
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const { name, description, config, metadata, isActive, visibility } = req.body;

    if (name !== undefined) integration.name = name;
    if (description !== undefined) integration.description = description;
    if (metadata !== undefined) integration.metadata = metadata;
    if (isActive !== undefined) integration.isActive = isActive;
    if (visibility !== undefined && ['private', 'shared'].includes(visibility)) {
      integration.visibility = visibility;
    }
    
    if (config !== undefined) {
      if (config.auth?.credentials && config.auth.type !== 'none') {
        const credentials = config.auth.credentials;
        if (credentials.token && !credentials.token.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.token)) {
          credentials.token = encryption.encrypt(credentials.token);
        }
        if (credentials.username && !credentials.username.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.username)) {
          credentials.username = encryption.encrypt(credentials.username);
        }
        if (credentials.apiKey && !credentials.apiKey.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.apiKey)) {
          credentials.apiKey = encryption.encrypt(credentials.apiKey);
        }
      }
      integration.config = config;
    }

    await integration.save();

    res.json({
      _id: integration.id,
      type: integration.type,
      name: integration.name,
      description: integration.description,
      baseUrl: integration.config?.baseUrl,
      authType: integration.config?.auth?.type || 'none',
      isActive: integration.isActive,
      updatedAt: integration.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update integration' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin' 
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const integration = await Integration.findOne({
      where: whereClause
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Delete associated tool_calls first (they reference tools)
    await sequelize.query(`
      DELETE FROM tool_calls WHERE "toolId" IN (SELECT id FROM tools WHERE "integrationId" = '${req.params.id}')
    `);
    
    // Delete associated tools
    await Tool.destroy({ where: { integrationId: req.params.id } });
    
    // Delete the integration
    await integration.destroy();

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json({ message: 'Integration deleted' });
  } catch (error) {
    logger.error({ err: error.message }, 'Delete integration error');
    res.status(500).json({ error: error.message || 'Failed to delete integration' });
  }
});

router.post('/:id/test', auth, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const integration = await Integration.findOne({
      where: whereClause
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const adapter = AdapterFactory.create(integration.type, integration.config);
    
    let authHeaders = {};
    let authError = null;
    
    try {
      authHeaders = adapter.getAuthHeaders();
    } catch (e) {
      authError = e.message;
    }
    
    const queryParams = adapter.getQueryParams();

    res.json({
      success: true,
      integration: {
        baseUrl: integration.baseUrl,
        authType: integration.config?.auth?.type || 'none',
        hasCredentials: !!(integration.config?.auth?.credentials),
        credentialsKeys: integration.config?.auth?.credentials ? Object.keys(integration.config.auth.credentials) : [],
        credentialsAreEncrypted: integration.config?.auth?.credentials?.token 
          ? integration.config.auth.credentials.token.startsWith('U2FsdGVk') 
          : false
      },
      computedAuth: {
        hasAuthHeader: !!authHeaders['Authorization'],
        authHeaderPreview: authHeaders['Authorization'] ? authHeaders['Authorization'].substring(0, 25) + '...' : 'None',
        queryParams: queryParams,
        authError: authError
      }
    });

    await audit.log({
      userId: req.user.id,
      action: 'test_integration',
      integrationType: integration.type,
      integrationId: integration.id,
      details: { authType: integration.config?.auth?.type },
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/tools', auth, async (req, res) => {
  try {
    let integration;
    
    if (req.user.role === 'admin') {
      integration = await Integration.findOne({ where: { id: req.params.id } });
    } else {
      const { User } = loadModels();
      const adminIds = await User.findAll({
        where: { role: 'admin' },
        attributes: ['id'],
        raw: true
      }).then(admins => admins.map(a => a.id));
      
      integration = await Integration.findOne({
        where: {
          id: req.params.id,
          [Op.or]: [
            { userId: req.user.id },
            { visibility: 'shared', userId: { [Op.in]: adminIds } }
          ]
        }
      });
    }

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const tools = await Tool.findAll({
      where: { integrationId: req.params.id }
    });

    res.json(tools.map(t => ({ ...t.toJSON(), _id: t.id })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

router.post('/:id/tools', auth, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const integration = await Integration.findOne({
      where: whereClause
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const { error, value } = toolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const endpoint = value.endpoint || {};
    const bodyTemplateVars = (JSON.stringify(endpoint.body || {})
      .match(/\{(\w+)\}/g) || [])
      .map(m => m.slice(1, -1));

    let enrichedEndpoint = { ...endpoint };

    if (bodyTemplateVars.length > 0) {
      const allParams = { ...(endpoint.params || {}) };
      bodyTemplateVars.forEach(varName => {
        if (!allParams[varName]) {
          allParams[varName] = { required: true, type: 'string', description: `Body parameter: ${varName}` };
        }
      });
      enrichedEndpoint.params = allParams;
    }

    const tool = await Tool.create({
      userId: req.user.id,
      integrationId: integration.id,
      name: value.name,
      description: value.description,
      endpoint: enrichedEndpoint,
      inputSchema: value.inputSchema,
      outputSchema: value.outputSchema
    });

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.status(201).json(tool);
  } catch (error) {
    logger.error({ err: error.message }, 'Create tool error');
    res.status(500).json({ error: 'Failed to create tool' });
  }
});

router.put('/:id/tools/:toolId', auth, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin'
      ? { id: req.params.toolId, integrationId: req.params.id }
      : { id: req.params.toolId, integrationId: req.params.id, userId: req.user.id };
    
    const tool = await Tool.findOne({
      where: whereClause
    });

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    const { name, description, endpoint, isActive, enabled } = req.body;
    const updates = {};
    
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (endpoint !== undefined) updates.endpoint = endpoint;
    if (isActive !== undefined) updates.isActive = isActive;
    if (enabled !== undefined) updates.isActive = enabled;

    await tool.update(updates);

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json(tool);
  } catch (error) {
    logger.error({ err: error.message }, 'Update tool error');
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

router.delete('/:id/tools/:toolId', auth, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin'
      ? { id: req.params.toolId, integrationId: req.params.id }
      : { id: req.params.toolId, integrationId: req.params.id, userId: req.user.id };
    
    const tool = await Tool.findOne({
      where: whereClause
    });

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    await tool.destroy();

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json({ message: 'Tool deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete tool' });
  }
});

router.patch('/:id/tools/bulk', auth, async (req, res) => {
  try {
    const { ids, action } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Tool IDs required' });
    }

    if (!['enable', 'disable', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const whereClause = req.user.role === 'admin'
      ? { id: { [Op.in]: ids }, integrationId: req.params.id }
      : { id: { [Op.in]: ids }, integrationId: req.params.id, userId: req.user.id };

    const tools = await Tool.findAll({ where: whereClause });

    if (tools.length === 0) {
      return res.status(404).json({ error: 'No tools found' });
    }

    if (action === 'delete') {
      await Tool.destroy({ where: { id: { [Op.in]: tools.map(t => t.id) } } });
    } else {
      const updates = action === 'enable' ? { isActive: true } : { isActive: false };
      await Tool.update(updates, { where: { id: { [Op.in]: tools.map(t => t.id) } } });
    }

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json({ message: `${tools.length} tools ${action}d` });
  } catch (error) {
    res.status(500).json({ error: `Failed to ${action} tools` });
  }
});

router.post('/discover', auth, async (req, res) => {
  try {
    const { baseUrl, openApiPath, auth: authConfig, specType, specUrl, filter } = req.body;

    if (!baseUrl) {
      return res.status(400).json({ error: 'baseUrl is required' });
    }

    let result;
    const specTypeToTry = specType || 'auto';
    
    const discoveryBaseUrl = specUrl || baseUrl;
    const discoveryAuth = specUrl ? null : authConfig;

    if (specTypeToTry === 'wadl' || specTypeToTry === 'auto') {
      try {
        const wadlParser = new WADLParser(discoveryBaseUrl, discoveryAuth);
        result = await wadlParser.discover();
        return res.json({ success: true, specType: 'wadl', ...result });
      } catch (wadlError) {
        if (specTypeToTry === 'wadl') {
          return res.status(400).json({ success: false, error: `WADL discovery failed: ${wadlError.message}` });
        }
      }
    }

    if (specTypeToTry === 'openapi' || specTypeToTry === 'auto') {
      try {
        const parser = new OpenAPIParser(discoveryBaseUrl, discoveryAuth, filter);
        if (openApiPath) {
          result = await parser.discover(openApiPath);
        } else {
          result = await parser.discover();
        }
        logger.debug({ result: JSON.stringify(result).substring(0, 500) }, 'OpenAPI discovery result');
        return res.json({ success: true, specType: 'openapi', ...result });
      } catch (openApiError) {
        if (specTypeToTry === 'openapi') {
          return res.status(400).json({ success: false, error: `OpenAPI discovery failed: ${openApiError.message}` });
        }
      }
    }

    res.status(400).json({ 
      success: false, 
      error: 'Could not discover API specification. Try specifying the spec type explicitly (openapi or wadl).' 
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Discovery error');
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

router.post('/:id/import-tools', auth, async (req, res) => {
  logger.debug({ id: req.params.id, endpointsCount: req.body.endpoints?.length }, 'Import tools request');
  
  try {
    const whereClause = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const integration = await Integration.findOne({
      where: whereClause
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const { endpoints } = req.body;
    
    if (!endpoints || !Array.isArray(endpoints)) {
      return res.status(400).json({ error: 'endpoints array is required' });
    }

    const createdTools = [];
    const errors = [];

    for (const ep of endpoints) {
      try {
        let toolName = ep.operationId || '';
        
        if (toolName) {
          toolName = toolName.replace(/([a-z])([A-Z])/g, '$1 $2');
          toolName = toolName.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
          toolName = toolName.split(/[\s_-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }
        
        if (!toolName) {
          const pathParts = ep.path.split('/').filter(p => p && !p.startsWith('{'));
          const lastPart = pathParts[pathParts.length - 1] || 'api';
          const cleanName = lastPart.replace(/[^a-zA-Z0-9]/g, ' ');
          const words = cleanName.split(' ').filter(w => w);
          
          if (words.length > 0) {
            toolName = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
        
        if (ep.summary) {
          toolName = ep.summary;
        } else if (toolName) {
          const methodPrefix = { GET: 'Get', POST: 'Create', PUT: 'Update', PATCH: 'Modify', DELETE: 'Delete' };
          const prefix = methodPrefix[ep.method] || ep.method;
          if (!toolName.toLowerCase().startsWith(prefix.toLowerCase())) {
            toolName = `${prefix} ${toolName}`;
          }
        }
        
        if (!toolName) {
          toolName = 'Unnamed Tool';
        }
        
        logger.debug({ path: ep.path, method: ep.method, params: JSON.stringify(ep.params).substring(0, 200) }, 'Processing endpoint');
        logger.debug({ name: toolName, description: ep.description || ep.summary }, 'Creating tool');
        
        const bodyParams = ep.body?.properties || {};
        const bodyTemplateVars = ep.bodyTemplate ? Object.keys(ep.bodyTemplate).reduce((acc, k) => {
          const extractVarNames = (obj, prefix = '') => {
            for (const [key, val] of Object.entries(obj)) {
              if (typeof val === 'string' && val.startsWith('{')) {
                acc.push(val.slice(1, -1));
              } else if (typeof val === 'object') {
                extractVarNames(val, key);
              }
            }
          };
          extractVarNames(k);
          return acc;
        }, []) : [];
        const bodyParamNames = [...Object.keys(bodyParams), ...bodyTemplateVars];
        const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(ep.method);
        
        const allParams = { ...(ep.params?.reduce((acc, p) => {
          acc[p.name] = { required: p.required, type: p.type, description: p.description };
          return acc;
        }, {}) || {}) };
        
        // Extract vars from body template
        if (isBodyMethod && ep.bodyTemplate) {
          const extractVars = (obj) => {
            for (const [k, v] of Object.entries(obj)) {
              if (typeof v === 'string' && v.startsWith('{')) {
                const varName = v.slice(1, -1);
                if (!allParams[varName]) {
                  const isRequired = (ep.body?.required || []).includes(varName);
                  const propType = ep.body?.properties?.[varName]?.type || 'string';
                  const propDesc = ep.body?.properties?.[varName]?.description || `Body parameter: ${varName}`;
                  allParams[varName] = { required: isRequired, type: propType, description: propDesc };
                }
              } else if (typeof v === 'object') {
                extractVars(v);
              }
            }
          };
          extractVars(ep.bodyTemplate);
        } else if (isBodyMethod && bodyParams) {
          const VALID_KEY = /^[a-zA-Z0-9_\-]{1,64}$/;
          const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);
          Object.entries(bodyParams).forEach(([key, val]) => {
            if (OPENAPI_KEYWORDS.has(key) || !VALID_KEY.test(key)) return;
            if (!allParams[key]) {
              allParams[key] = { required: bodyParamNames.includes(key), type: val.type || 'string', description: val.description || '' };
            }
          });
        }
        
        const tool = await Tool.create({
          userId: req.user.id,
          integrationId: integration.id,
          name: toolName.substring(0, 255),
          description: (ep.description || ep.summary || '').substring(0, 1000),
          endpoint: {
            path: ep.path,
            method: ep.method,
            params: allParams,
            headers: {},
            body: ep.bodyTemplate || (ep.body ? {} : null)
          },
          inputSchema: ep.bodyTemplate || ep.body ? {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries({ ...(ep.body?.properties || {}) })
                .filter(([key]) => !new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']).has(key))
            ),
            required: ep.body?.required || []
          } : {},
          outputSchema: {},
          isActive: true
        });
        logger.info({ toolId: tool.id, name: tool.name }, 'Tool created');
        createdTools.push(tool);
      } catch (e) {
        logger.error({ err: e.message, endpoint: ep.path }, 'Tool create failed');
        errors.push({ endpoint: ep.path, error: e.message });
      }
    }

    if (process.env.MCP_ENABLED === 'true' && createdTools.length > 0) {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json({
      success: true,
      created: createdTools.length,
      tools: createdTools.map(t => ({ ...t.toJSON(), _id: t.id })),
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Import tools error');
    res.status(500).json({ error: error.message });
  }
});

router.post('/export', auth, async (req, res) => {
  try {
    const { includeTools, integrationIds } = req.body;
    logger.debug({ userId: req.user.id, integrationIds }, 'Export request');
    
    const where = req.user.role === 'admin' ? {} : { userId: req.user.id };
    if (integrationIds && Array.isArray(integrationIds) && integrationIds.length > 0) {
      where.id = { [Op.in]: integrationIds };
    } else if (req.user.role !== 'admin') {
      where.userId = req.user.id;
    }
    
    const integrations = await Integration.findAll({ where });
    
    const result = [];
    for (const int of integrations) {
      const { credentials, ...authWithoutCredentials } = int.config.auth || {};
      const data = {
        name: int.name,
        type: int.type,
        description: int.description,
        baseUrl: int.config.baseUrl,
        auth: authWithoutCredentials,
        metadata: int.metadata
      };
      
      if (includeTools) {
        const tools = await Tool.findAll({
          where: { integrationId: int.id }
        });
        data.tools = tools.map(t => ({
          name: t.name,
          description: t.description,
          endpoint: t.endpoint,
          isActive: t.isActive
        }));
      }
      
      result.push(data);
    }
    
    res.json({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      count: result.length,
      integrations: result
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Export error');
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', auth, async (req, res) => {
  try {
    const { integrations, includeTools, mode } = req.body;
    
    if (!integrations || !Array.isArray(integrations)) {
      return res.status(400).json({ error: 'integrations array is required' });
    }
    
    const results = [];
    const errors = [];
    
    for (const intData of integrations) {
      try {
        let existingIntegration = null;
        if (mode === 'update' || mode === 'skip') {
          existingIntegration = await Integration.findOne({
            where: { userId: req.user.id, name: intData.name }
          });
        }
        
        if (mode === 'skip' && existingIntegration) {
          results.push({ name: intData.name, status: 'skipped', reason: 'already exists' });
          continue;
        }
        
        let integration;
        if (existingIntegration && mode === 'update') {
          await existingIntegration.update({
            description: intData.description,
            config: {
              baseUrl: intData.baseUrl,
              auth: intData.auth
            },
            metadata: intData.metadata
          });
          integration = existingIntegration;
        } else {
          integration = await Integration.create({
            userId: req.user.id,
            name: intData.name,
            type: intData.type || 'custom',
            description: intData.description || '',
            config: {
              baseUrl: intData.baseUrl,
              auth: intData.auth
            },
            metadata: intData.metadata,
            isActive: true
          });
        }
        
        let toolsImported = 0;
        if (includeTools && intData.tools && Array.isArray(intData.tools)) {
          for (const toolData of intData.tools) {
            try {
              await Tool.create({
                userId: req.user.id,
                integrationId: integration.id,
                name: toolData.name,
                description: toolData.description || '',
                endpoint: toolData.endpoint,
                isActive: toolData.isActive !== false
              });
              toolsImported++;
            } catch (te) {
              errors.push({ tool: toolData.name, integration: intData.name, error: te.message });
            }
          }
        }
        
        results.push({ name: intData.name, status: 'created', integrationId: integration.id, toolsImported });
      } catch (e) {
        errors.push({ integration: intData.name, error: e.message });
      }
    }
    
    res.json({
      success: true,
      imported: results.filter(r => r.status !== 'skipped').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }
  } catch (error) {
    logger.error({ err: error.message }, 'Import error');
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/visibility', auth, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const integration = await Integration.findOne({ where: whereClause });
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const { visibility } = req.body;
    if (!['private', 'shared'].includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility value' });
    }

    await integration.update({ visibility });
    res.json({ success: true, visibility: integration.visibility });
  } catch (error) {
    logger.error({ err: error.message }, 'Update visibility error');
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

router.patch('/:id/credentials', auth, async (req, res) => {
  try {
    const integration = await Integration.findByPk(req.params.id);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    
    const { credentials } = req.body;
    if (!credentials) {
      return res.status(400).json({ error: 'Credentials are required' });
    }
    
    const isOwnerOrAdmin = integration.userId === req.user.id || req.user.role === 'admin';
    const isSharedForOthers = integration.visibility === 'shared' && !isOwnerOrAdmin;
    
    if (isSharedForOthers) {
      const { UserIntegrationCredentials } = loadModels();
      const encryptedCreds = encryption.encrypt(JSON.stringify(credentials));
      
      await UserIntegrationCredentials.upsert({
        userId: req.user.id,
        integrationId: integration.id,
        credentials: encryptedCreds,
        isActive: true
      });
      
      logger.info({ userId: req.user.id, integrationId: integration.id }, 'User connected to shared integration');
      res.json({ success: true, message: 'Credentials saved successfully' });
    } else if (isOwnerOrAdmin) {
      const config = { ...integration.config };
      config.auth.credentials = encryption.encryptCredentials(credentials);
      await integration.update({ config });
      
      logger.info({ integrationId: integration.id }, 'Integration credentials updated');
      res.json({ success: true, message: 'Credentials updated successfully' });
    } else {
      return res.status(403).json({ error: 'Not authorized to update credentials for this integration' });
    }
  } catch (error) {
    logger.error({ err: error.message }, 'Update credentials error');
    res.status(500).json({ error: 'Failed to update credentials' });
  }
});

router.delete('/:id/credentials', auth, async (req, res) => {
  try {
    const integration = await Integration.findByPk(req.params.id);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    
    const { UserIntegrationCredentials } = loadModels();
    const isOwnerOrAdmin = integration.userId === req.user.id || req.user.role === 'admin';
    
    if (isOwnerOrAdmin) {
      const config = { ...integration.config };
      delete config.auth.credentials;
      await integration.update({ config });
    }
    
    await UserIntegrationCredentials.destroy({
      where: { userId: req.user.id, integrationId: integration.id }
    });
    
    logger.info({ userId: req.user.id, integrationId: integration.id }, 'User disconnected from integration');
    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (error) {
    logger.error({ err: error.message }, 'Disconnect error');
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

router.get('/:id/users', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const integration = await Integration.findByPk(req.params.id);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const userCreds = await UserIntegrationCredentials.findAll({
      where: { integrationId: req.params.id },
      attributes: ['userId', 'updatedAt']
    });

    const { User } = loadModels();
    const users = await Promise.all(
      userCreds.map(async (uc) => {
        const user = await User.findByPk(uc.userId, { attributes: ['id', 'name', 'email'] });
        return { user: user?.toJSON(), lastConnected: uc.updatedAt };
      })
    );

    res.json({ sharedCount: userCreds.length, users });
  } catch (error) {
    logger.error({ err: error.message }, 'Get integration users error');
    res.status(500).json({ error: error.message });
  }
});

const compositeToolSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  inputSchema: Joi.object().default({}),
  integrationId: Joi.string().uuid().optional(),
  steps: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    label: Joi.string().required(),
    toolId: Joi.string().uuid().required(),
    inputMappings: Joi.object().default({}),
    extractors: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      arrayPath: Joi.string().required(),
      filterField: Joi.string().required(),
      filterValue: Joi.string().required(),
      selectField: Joi.string().required()
    })).default([])
  })).min(1).required()
});

router.get('/composite', auth, async (req, res) => {
  try {
    const { integrationId } = req.query;
    
    const where = { type: 'composite' };
    if (integrationId) {
      where.integrationId = integrationId;
    }
    
    const tools = await Tool.findAll({ where });
    
    res.json(tools.map(t => ({ ...t.toJSON(), _id: t.id })));
  } catch (error) {
    logger.error({ err: error.message }, 'Get composite tools error');
    res.status(500).json({ error: 'Failed to get composite tools' });
  }
});

router.post('/composite', auth, async (req, res) => {
  try {
    const { error, value } = compositeToolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { integrationId } = req.body;
    if (!integrationId) {
      return res.status(400).json({ error: 'integrationId is required' });
    }

    const integration = await Integration.findByPk(integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const simpleTools = await Tool.findAll({
      where: { integrationId, type: 'simple' }
    });
    const toolIds = simpleTools.map(t => t.id);
    
    for (const step of value.steps) {
      if (!toolIds.includes(step.toolId)) {
        return res.status(400).json({ 
          error: `Tool ${step.toolId} is not a valid simple tool in this integration` 
        });
      }
    }

    const tool = await Tool.create({
      userId: req.user.id,
      integrationId,
      name: value.name,
      description: value.description,
      endpoint: { path: '/composite', method: 'POST' },
      inputSchema: value.inputSchema,
      type: 'composite',
      steps: value.steps
    });

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.status(201).json(tool);
  } catch (error) {
    logger.error({ err: error.message }, 'Create composite tool error');
    res.status(500).json({ error: 'Failed to create composite tool' });
  }
});

router.get('/composite/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    const integration = await Integration.findByPk(tool.integrationId);
    
    res.json({
      ...tool.toJSON(),
      _id: tool.id,
      integration: integration ? {
        id: integration.id,
        name: integration.name,
        type: integration.type
      } : null
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Get composite tool error');
    res.status(500).json({ error: 'Failed to get composite tool' });
  }
});

router.put('/composite/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    const { error, value } = compositeToolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    await tool.update({
      name: value.name,
      description: value.description,
      inputSchema: value.inputSchema,
      steps: value.steps
    });

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json(tool);
  } catch (error) {
    logger.error({ err: error.message }, 'Update composite tool error');
    res.status(500).json({ error: 'Failed to update composite tool' });
  }
});

router.delete('/composite/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    await tool.destroy();

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error.message }, 'Delete composite tool error');
    res.status(500).json({ error: 'Failed to delete composite tool' });
  }
});

router.post('/composite/:id/test', auth, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ error: 'Composite tool not found' });
    }

    if (tool.type !== 'composite') {
      return res.status(400).json({ error: 'Tool is not a composite tool' });
    }

    const { inputs } = req.body;
    if (!inputs) {
      return res.status(400).json({ error: 'inputs are required' });
    }

    const result = await executeComposite(tool, inputs, req.user.id);
    
    res.json(result);
  } catch (error) {
    logger.error({ err: error.message }, 'Test composite tool error');
    res.status(500).json({ error: error.message });
  }
});

// Postman Collection Import
router.post('/postman-import', auth, async (req, res) => {
  try {
    const { name, baseUrl, auth, tools } = req.body;
    
    if (!baseUrl) {
      return res.status(400).json({ error: 'Base URL is required' });
    }
    
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return res.status(400).json({ error: 'At least one tool is required' });
    }
    
    // Create the integration
    const integration = await Integration.create({
      userId: req.user.id,
      type: 'custom',
      name: name || 'Postman Import',
      description: `Imported from Postman collection - ${tools.length} tools`,
      config: {
        baseUrl,
        auth: auth || { type: 'none' },
        headers: {},
        timeout: 30000
      },
      isActive: true
    });
    
    // Create tools from Postman requests
    const createdTools = [];
    for (const toolDef of tools) {
      const tool = await Tool.create({
        userId: req.user.id,
        integrationId: integration.id,
        name: toolDef.name,
        description: toolDef.description || toolDef.name,
        endpoint: {
          path: toolDef.path || toolDef.url || '/',
          method: toolDef.method || 'GET',
          params: toolDef.params || {},
          headers: {},
          body: toolDef.body || null
        },
        isActive: true
      });
      createdTools.push(tool);
    }
    
    await audit.log({
      userId: req.user.id,
      action: 'postman_import',
      integrationId: integration.id,
      details: { toolCount: tools.length }
    });
    
    res.status(201).json({
      integration: {
        _id: integration.id,
        name: integration.name,
        type: integration.type,
        baseUrl: integration.config.baseUrl
      },
      tools: createdTools.map(t => ({ _id: t.id, name: t.name, method: t.endpoint.method, path: t.endpoint.path }))
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Postman import error');
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
