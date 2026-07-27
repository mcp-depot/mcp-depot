'use strict';

// zod/v3, matching this app's own package.json dependency - see the note
// in server.js's import for the real root cause (server.tool() vs
// server.registerTool(), not a zod version issue).
const { z } = require('zod/v3');
const { loadModels } = require('../config/database');
const { refreshToolsIfEnabled } = require('./server');
const { slugify, computeExposedName } = require('../utils/slugify');
const { BUILT_IN_INTEGRATION_NAMES, isBuiltInIntegration } = require('../utils/builtInIntegrations');
const { checkIntegrationPolicy } = require('../services/resource-policy');
const audit = require('../services/audit');
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

// Resolves who is actually calling a meta-tool, so actions like "share this
// company-wide" can be policy-checked against the real caller instead of a
// hardcoded admin. Two paths feed this: the live MCP session (stdio/SSE),
// where the API key or JWT presented at connect time already resolved a
// userId onto the session (see server.js's authenticateAndRun/_sessionClientMap
// - the same mechanism ordinary tool calls use for policy checks), and the
// REST convenience wrapper under /api/v1/mcp/*, which resolves req.user via
// checkMcpAuth and passes it straight through as extra.user. Returns null
// (never guesses) if neither source identifies a real user.
async function resolveCallerUser(extra, mcpServerInstance) {
  const { User } = loadModels();
  if (extra?.user) return extra.user;
  const sessionId = extra?.sessionId;
  const sessionData = sessionId && mcpServerInstance?._sessionClientMap?.get(sessionId);
  if (sessionData?.userId) {
    return User.findByPk(sessionData.userId);
  }
  return null;
}

function wrapHandler(handler) {
  return async (params, extra) => {
    const disabled = await guardIntegrationActive();
    if (disabled) return { content: [{ type: 'text', text: disabled }], isError: true };
    return handler(params, extra);
  };
}

// Real per-tool schemas - every handler below was previously registered
// with a hardcoded empty z.object({}), which made native MCP tools/call
// invocations (unlike the REST/AI-chat wrapper, which calls handlers
// directly) silently strip every argument to {} before the handler ever
// ran, since zod's z.object() strips unrecognized keys by default. These
// mirror what each handler actually reads from `params` below.
const metaToolSpecs = {
  mcp_list_integrations: {
    description: 'List all registered integrations with their type, tool count, source, and active status.',
    inputSchema: z.object({})
  },
  mcp_register_integration: {
    description: 'Register a new integration (an external API) that tools can then be added to via mcp_register_tool. Created private by default.',
    inputSchema: z.object({
      name: z.string().describe('Unique name for the new integration'),
      baseUrl: z.string().describe('Base URL of the API this integration will call'),
      description: z.string().optional().describe('Human-readable description of the integration'),
      type: z.string().optional().describe('Integration type (default: "custom")'),
      shared: z.boolean().optional().describe('Request company-wide shared visibility - only takes effect if the caller has admin sharing rights, otherwise the integration is created private with a note explaining why')
    })
  },
  mcp_register_tool: {
    description: 'Add a new tool (a single API endpoint) to an existing integration.',
    inputSchema: z.object({
      name: z.string().describe('Name for the new tool'),
      path: z.string().describe('API endpoint path - supports {placeholder} template variables filled from the tool\'s params'),
      integration: z.string().optional().describe('Name of the integration to add this tool to. Omit only if there is exactly one eligible (non-built-in) integration - otherwise this is required'),
      method: z.string().optional().describe('HTTP method (default: "GET")'),
      description: z.string().optional().describe('Description of what this tool does'),
      params: z.string().optional().describe('JSON object string describing query/path parameters, e.g. \'{"id": {"type": "string", "required": true}}\''),
      body: z.string().optional().describe('JSON string of the request body template - supports {placeholder} substitution from params'),
      responseFields: z.string().optional().describe('JSON array string of response field names to keep (response filtering)')
    })
  },
  mcp_describe_tool: {
    description: 'Get the full definition of a registered tool - its endpoint, input schema, response fields, and transformer.',
    inputSchema: z.object({
      name: z.string().describe('Tool name or exposed name to describe')
    })
  },
  mcp_remove_tool: {
    description: 'Remove a tool from an integration. Requires confirm: true to actually perform the deletion.',
    inputSchema: z.object({
      integration: z.string().describe('Name of the integration the tool belongs to'),
      name: z.string().describe('Name of the tool to remove'),
      confirm: z.boolean().optional().describe('Must be true to actually perform the deletion - a safety confirmation, calling without it returns an error instead of deleting')
    })
  }
};

function registerMetaTools(server, toolsMap, mcpServerInstance) {
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

  handlerMap.mcp_register_integration = wrapHandler(async (params, extra) => {
    const { Integration, User } = loadModels();
    const existing = await Integration.findOne({ where: { name: params.name } });
    if (existing) {
      return { content: [{ type: 'text', text: `Integration "${params.name}" already exists. Use mcp_register_tool to add tools to it.` }], isError: true };
    }
    // Attribute to the real caller when the session/REST request identifies
    // one; fall back to an admin only when it can't be resolved (e.g. a
    // stdio session with no API key/JWT), so headless setups keep working.
    const caller = await resolveCallerUser(extra, mcpServerInstance);
    const owner = caller || await User.findOne({ where: { role: 'admin' } });
    // Always created private first - sharing company-wide is a privileged
    // action gated by the same 'share' policy the REST visibility-toggle
    // route enforces, evaluated below against the real caller once the
    // integration (and therefore its id) exists.
    const integration = await Integration.create({
      userId: owner ? owner.id : null, type: params.type || 'custom', name: params.name,
      description: params.description || '',
      config: { baseUrl: params.baseUrl, auth: { type: 'none' }, headers: {}, timeout: 30000 },
      metadata: { source: 'ai-generated' },
      visibility: 'private'
    });

    let sharedNote = '';
    if (params.shared) {
      if (!caller) {
        sharedNote = ' It was requested as company-wide shared, but the caller could not be identified from this session, so it was created private instead.';
      } else {
        const policyResult = await checkIntegrationPolicy({ user: { id: caller.id, role: caller.role }, action: 'share', integrationId: integration.id });
        if (policyResult.decision === 'allow') {
          await integration.update({ visibility: 'shared' });
          await audit.log({
            userId: caller.id,
            action: 'update_visibility',
            integrationType: integration.type,
            integrationId: integration.id,
            details: { visibility: 'shared', via: 'ai-chat' },
            status: 'success'
          });
        } else {
          sharedNote = ` It was requested as company-wide shared, but only admins can share an integration company-wide (${policyResult.reason || 'denied by policy'}), so it was created private instead.`;
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: `Integration "${params.name}" created (ID: ${integration.id}).${sharedNote} Now call mcp_register_tool to add tools to it. Remember to configure credentials in the MCP Depot UI if the API requires authentication.`
      }]
    };
  });

  handlerMap.mcp_register_tool = wrapHandler(async (params, extra) => {
    const { Integration, Tool, User } = loadModels();
    const { Op } = require('sequelize');
    let integration;
    if (params.integration) {
      integration = await Integration.findOne({ where: { name: params.integration } });
      if (!integration) {
        return { content: [{ type: 'text', text: `Integration "${params.integration}" not found. Create it first with mcp_register_integration.` }], isError: true };
      }
      if (isBuiltInIntegration(integration)) {
        return { content: [{ type: 'text', text: `"${integration.name}" is a built-in integration and is system-managed - tools cannot be added to it.` }], isError: true };
      }
    } else {
      const candidates = await Integration.findAll({
        where: { isActive: true, name: { [Op.notIn]: BUILT_IN_INTEGRATION_NAMES } }
      });
      if (candidates.length === 0) {
        return { content: [{ type: 'text', text: 'No integration found. Create one first with mcp_register_integration.' }], isError: true };
      }
      if (candidates.length === 1) {
        integration = candidates[0];
      } else {
        const names = candidates.map(i => i.name).join(', ');
        return { content: [{ type: 'text', text: `Multiple integrations found — specify one: ${names}` }], isError: true };
      }
    }
    const existing = await Tool.findOne({ where: { integrationId: integration.id, name: params.name } });
    if (existing) {
      return { content: [{ type: 'text', text: `Tool "${params.name}" already exists in integration "${integration.name}".` }], isError: true };
    }
    let parsedParams = {};
    if (params.params) {
      try { parsedParams = JSON.parse(params.params); } catch {
        return { content: [{ type: 'text', text: `Invalid JSON in params parameter.` }], isError: true };
      }
    }
    let parsedBody = null;
    if (params.body) {
      try { parsedBody = JSON.parse(params.body); } catch {
        return { content: [{ type: 'text', text: `Invalid JSON in body parameter.` }], isError: true };
      }
    }
    let responseFields = null;
    if (params.responseFields) {
      try { responseFields = JSON.parse(params.responseFields); } catch {
        return { content: [{ type: 'text', text: `Invalid JSON in responseFields parameter.` }], isError: true };
      }
    }
    const inputSchema = Object.keys(parsedParams).length > 0 ? {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(parsedParams).map(([key, param]) => [
          key,
          {
            type: (param && param.type) || 'string',
            ...(param && param.description ? { description: param.description } : {})
          }
        ])
      ),
      required: Object.entries(parsedParams)
        .filter(([, p]) => p && p.required)
        .map(([key]) => key)
    } : {};
    const caller = await resolveCallerUser(extra, mcpServerInstance);
    const owner = caller || await User.findOne({ where: { role: 'admin' } });
    const exposedName = computeExposedName(integration.slug || slugify(integration.name), params.name);
    const tool = await Tool.create({
      userId: owner ? owner.id : null, integrationId: integration.id, name: params.name,
      description: params.description,
      endpoint: {
        path: params.path, method: (params.method || 'GET').toUpperCase(),
        params: parsedParams, headers: {}, body: parsedBody, responseFields
      },
      inputSchema, outputSchema: {}, isActive: true, metadata: { source: 'ai-generated' },
      exposedName
    });
    await refreshToolsIfEnabled();
    return {
      content: [{
        type: 'text',
        text: `Tool "${params.name}" added to integration "${integration.name}" (ID: ${tool.id}). Run /mcp to reconnect and it will be available in this session.`
      }]
    };
  });

  handlerMap.mcp_describe_tool = wrapHandler(async (params) => {
    const { Tool, Integration } = loadModels();
    let tool = await Tool.findOne({
      where: { name: params.name, isActive: true },
      include: [{ model: Integration, as: 'integration' }]
    });
    if (!tool) {
      tool = await Tool.findOne({
        where: { exposedName: params.name, isActive: true },
        include: [{ model: Integration, as: 'integration' }]
      });
    }
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
    if (isBuiltInIntegration(integration)) {
      return { content: [{ type: 'text', text: `"${integration.name}" is a built-in integration and is system-managed - its tools cannot be removed.` }], isError: true };
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
    const spec = metaToolSpecs[name] || { description: `Meta-tool: ${name}`, inputSchema: z.object({}) };
    try {
      server.registerTool(
        name,
        {
          description: spec.description,
          inputSchema: spec.inputSchema
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
