'use strict';

const { z } = require('zod/v3');
const { loadModels } = require('../config/database');
const { refreshToolsIfEnabled } = require('./server');
const logger = require('../services/logger');

const INTEGRATION_NAME = 'MCP Depot - AI Tools';

async function guardIntegrationActive() {
  const { Integration } = loadModels();
  const integration = await Integration.findOne({ where: { name: INTEGRATION_NAME } });
  if (!integration || !integration.isActive) {
    return 'Meta-tools are disabled. Enable the "MCP Depot - AI Tools" integration in the UI to use them.';
  }
  return null;
}

function wrapHandler(handler) {
  return async (params) => {
    const disabled = await guardIntegrationActive();
    if (disabled) return { content: [{ type: 'text', text: disabled }], isError: true };
    return handler(params);
  };
}

function registerMetaTools(server, toolsMap) {
  const handlerMap = {};

  handlerMap.mcp_list_integrations = wrapHandler(async () => {
    const { Integration, Tool } = loadModels();
    const { Op } = require('sequelize');
    const integrations = await Integration.findAll({ order: [['name', 'ASC']] });
    const intIds = integrations.map(i => i.id);
    const toolCounts = intIds.length > 0
      ? await Tool.findAll({
          where: { integrationId: { [Op.in]: intIds }, isActive: true },
          attributes: ['integrationId', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
          group: ['integrationId'],
          raw: true
        })
      : [];
    const countMap = toolCounts.reduce((acc, tc) => { acc[tc.integrationId] = parseInt(tc.count); return acc; }, {});
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(integrations.map(i => ({
          name: i.name, type: i.type, baseUrl: i.config?.baseUrl,
          authType: i.config?.auth?.type || 'none', toolCount: countMap[i.id] || 0,
          source: i.metadata?.source || 'manual', isActive: i.isActive
        })), null, 2)
      }]
    };
  });

  handlerMap.mcp_register_integration = wrapHandler(async (params) => {
    const { Integration, User } = loadModels();
    const existing = await Integration.findOne({ where: { name: params.name } });
    if (existing) {
      return { content: [{ type: 'text', text: `Integration "${params.name}" already exists. Use mcp_register_tool to add tools to it.` }], isError: true };
    }
    const admin = await User.findOne({ where: { role: 'admin' } });
    const integration = await Integration.create({
      userId: admin ? admin.id : null, type: params.type || 'custom', name: params.name,
      description: params.description || '',
      config: { baseUrl: params.baseUrl, auth: { type: 'none' }, headers: {}, timeout: 30000 },
      metadata: { source: 'ai-generated' },
      visibility: params.shared ? 'shared' : 'private'
    });
    return {
      content: [{
        type: 'text',
        text: `Integration "${params.name}" created (ID: ${integration.id}). Now call mcp_register_tool to add tools to it. Remember to configure credentials in the MCP Depot UI if the API requires authentication.`
      }]
    };
  });

  handlerMap.mcp_register_tool = wrapHandler(async (params) => {
    const { Integration, Tool, User } = loadModels();
    const integration = await Integration.findOne({ where: { name: params.integration } });
    if (!integration) {
      return { content: [{ type: 'text', text: `Integration "${params.integration}" not found. Create it first with mcp_register_integration.` }], isError: true };
    }
    const existing = await Tool.findOne({ where: { integrationId: integration.id, name: params.name } });
    if (existing) {
      return { content: [{ type: 'text', text: `Tool "${params.name}" already exists in integration "${params.integration}".` }], isError: true };
    }
    let parsedParams = {};
    if (params.params) {
      try { parsedParams = JSON.parse(params.params); } catch {
        return { content: [{ type: 'text', text: `Invalid JSON in params parameter.` }], isError: true };
      }
    }
    let responseFields = null;
    if (params.responseFields) {
      try { responseFields = JSON.parse(params.responseFields); } catch {
        return { content: [{ type: 'text', text: `Invalid JSON in responseFields parameter.` }], isError: true };
      }
    }
    const admin = await User.findOne({ where: { role: 'admin' } });
    const tool = await Tool.create({
      userId: admin ? admin.id : null, integrationId: integration.id, name: params.name,
      description: params.description,
      endpoint: {
        path: params.path, method: (params.method || 'GET').toUpperCase(),
        params: parsedParams, headers: {}, body: null, responseFields
      },
      inputSchema: {}, outputSchema: {}, isActive: true, metadata: { source: 'ai-generated' }
    });
    await refreshToolsIfEnabled();
    return {
      content: [{
        type: 'text',
        text: `Tool "${params.name}" added to integration "${params.integration}" (ID: ${tool.id}). It is now available for AI clients to call.`
      }]
    };
  });

  handlerMap.mcp_describe_tool = wrapHandler(async (params) => {
    const { Tool, Integration } = loadModels();
    const tool = await Tool.findOne({
      where: { name: params.name, isActive: true },
      include: [{ model: Integration, as: 'integration' }]
    });
    if (!tool) {
      return { content: [{ type: 'text', text: `Tool "${params.name}" not found.` }], isError: true };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: tool.name, description: tool.description,
          integration: tool.Integration?.name, endpoint: tool.endpoint,
          inputSchema: tool.inputSchema, responseFields: tool.responseFields,
          responseTransformer: tool.responseTransformer, source: tool.metadata?.source || 'manual'
        }, null, 2)
      }]
    };
  });

  handlerMap.mcp_remove_tool = wrapHandler(async (params) => {
    if (!params.confirm) {
      return { content: [{ type: 'text', text: `Deletion not confirmed. Call again with confirm: true to remove tool "${params.name}" from "${params.integration}".` }], isError: true };
    }
    const { Integration, Tool } = loadModels();
    const integration = await Integration.findOne({ where: { name: params.integration } });
    if (!integration) {
      return { content: [{ type: 'text', text: `Integration "${params.integration}" not found.` }], isError: true };
    }
    const tool = await Tool.findOne({ where: { integrationId: integration.id, name: params.name } });
    if (!tool) {
      return { content: [{ type: 'text', text: `Tool "${params.name}" not found in "${params.integration}".` }], isError: true };
    }
    await tool.destroy();
    await refreshToolsIfEnabled();
    return { content: [{ type: 'text', text: `Tool "${params.name}" removed from "${params.integration}".` }] };
  });

  // Register on MCP server for stdio/SSE transport
  Object.entries(handlerMap).forEach(([name, handler]) => {
    try {
      server.tool(
        name,
        {
          description: handler._description || `Meta-tool: ${name}`,
          inputSchema: z.object({})
        },
        handler
      );
    } catch (e) {
      // MCP SDK throws on duplicate name (called again during refreshTools) — ignore
    }
    // Always populate toolsMap so REST execute route can find the handler
    toolsMap.set(name, { handler, type: 'meta' });
  });

  logger.info('Meta-tools registered under "MCP Depot - AI Tools"');
}

module.exports = { registerMetaTools, INTEGRATION_NAME };
