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
const logger = require('../services/logger');

const router = express.Router();

const integrationSchema = Joi.object({
  type: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string(),
  config: Joi.object({
    baseUrl: Joi.string().uri().required(),
    auth: Joi.object({
      type: Joi.string().valid('none', 'basic', 'bearer', 'apiKey', 'oauth2').default('none'),
      credentials: Joi.object()
    }).default({ type: 'none' }),
    headers: Joi.object().default({}),
    timeout: Joi.number().default(30000)
  }).required(),
  metadata: Joi.object().default({})
});

const toolSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string(),
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
    const whereClause = req.user.role === 'admin' ? {} : { userId: req.user.id };
    
    const integrations = await Integration.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

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
    const { UserIntegrationCredentials } = loadModels();
    let userCredsMap = {};
    if (req.user.role !== 'admin' && integrationIds.length > 0) {
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
    
    const sanitized = integrations.map(i => {
      const authType = i.config.auth?.type || 'none';
      const requiresCredentials = authType !== 'none';
      const hasUserCredentials = !!userCredsMap[i.id];
      const hasIntegrationCredentials = !!i.config.auth?.credentials;
      
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
        canUse: !requiresCredentials || hasUserCredentials || hasIntegrationCredentials,
        isActive: i.isActive,
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

router.get('/:id', auth, async (req, res) => {
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
      if (credentials.token && !credentials.token.startsWith('U2FsdGVk')) {
        credentials.token = encryption.encrypt(credentials.token);
      }
      if (credentials.username && !credentials.username.startsWith('U2FsdGVk')) {
        credentials.username = encryption.encrypt(credentials.username);
      }
      if (credentials.apiKey && !credentials.apiKey.startsWith('U2FsdGVk')) {
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

    const { name, description, config, metadata, isActive } = req.body;

    if (name !== undefined) integration.name = name;
    if (description !== undefined) integration.description = description;
    if (config !== undefined) integration.config = config;
    if (metadata !== undefined) integration.metadata = metadata;
    if (isActive !== undefined) integration.isActive = isActive;

    await integration.save();

    res.json(integration);
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
        credentialsAreEncrypted: integration.config?.auth?.credentials?.token ? integration.config.auth.token.startsWith('U2FsdGVk') : false
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
    const integrationWhereClause = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const integration = await Integration.findOne({
      where: integrationWhereClause
    });

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

    const tool = await Tool.create({
      userId: req.user.id,
      integrationId: integration.id,
      ...value
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

router.post('/discover', auth, async (req, res) => {
  try {
    const { baseUrl, openApiPath, auth: authConfig, specType, specUrl } = req.body;

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
        const parser = new OpenAPIParser(discoveryBaseUrl, discoveryAuth);
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
        const bodyParamNames = Object.keys(bodyParams);
        const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(ep.method);
        
        const tool = await Tool.create({
          userId: req.user.id,
          integrationId: integration.id,
          name: toolName.substring(0, 255),
          description: (ep.description || ep.summary || '').substring(0, 1000),
          endpoint: {
            path: ep.path,
            method: ep.method,
            params: ep.params?.reduce((acc, p) => {
              acc[p.name] = { required: p.required, type: p.type, description: p.description };
              return acc;
            }, {}) || {},
            headers: {},
            body: ep.body ? {} : null
          },
          inputSchema: ep.body ? { type: 'object', properties: { ...bodyParams, ...(ep.body.properties || {}) }, required: bodyParamNames } : {},
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

    if (process.env.MCP_STDIO_ENABLED === 'true' && createdTools.length > 0) {
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
    console.log('Export request - user.id:', req.user.id, 'userId type:', typeof req.user.id, 'integrationIds:', integrationIds);
    
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

module.exports = router;
