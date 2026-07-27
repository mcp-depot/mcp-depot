'use strict';

// zod/v3, matching this app's own package.json dependency - see the note
// in server.js's import for the real root cause (server.tool() vs
// server.registerTool(), not a zod version issue).
const { z } = require('zod/v3');
const { checkToolPolicy } = require('../services/tool-policy');
const { checkRateLimit: checkToolRateLimit } = require('../services/rate-limiter');
const { isToolVisibleToCaller } = require('../utils/builtInIntegrations');
const audit = require('../services/audit');
const logger = require('../services/logger');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function matchesQuery(query, ...fields) {
  const q = query.toLowerCase();
  return fields.some(f => typeof f === 'string' && f.toLowerCase().includes(q));
}

async function resolveCaller(extra, mcpServerInstance) {
  const sessionId = extra?.sessionId || 'stdio';
  const sessionData = mcpServerInstance._sessionClientMap.get(sessionId) ?? {};
  const callerUserId = sessionData.userId ?? null;
  let callerRole = null;
  if (callerUserId) {
    const { User } = require('../config/database').loadModels();
    const caller = await User.findByPk(callerUserId);
    callerRole = caller?.role ?? null;
  }
  return { callerUserId, callerRole, sessionId, sessionData };
}

// search_tools/execute_tool - an alternative to exposing every catalog tool
// individually, for orgs whose tool count makes that expensive on AI
// context. Covers regular + composite Tools and Skills only - the same set
// _installToolsListFilter already shows/hides today. Deliberately excludes
// meta/authoring tools (mcp_register_integration etc. stay individually
// visible/callable, they're a small fixed set, not the source of bloat)
// and External MCP server tools (not reachable by native MCP sessions at
// all today - a separate, real gap, not this feature).
//
// Registered unconditionally (same convention as registerMetaTools) -
// compactToolMode (checked in _installToolsListFilter) only controls
// whether these two show up in tools/list, not whether they work if called
// directly.
function registerCatalogTools(server, toolsMap, mcpServerInstance) {
  server.registerTool(
    'search_tools',
    {
      description: 'Search the tool catalog (registered tools and skills) by keyword. Returns matching tools with their input schema, so you can call execute_tool with the right params. Use this instead of scanning a long tool list.',
      inputSchema: z.object({
        query: z.string().describe('Keyword to search for, matched against each tool\'s name, description, and integration'),
        limit: z.number().optional().describe(`Max results to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`)
      })
    },
    async (params, extra) => {
      try {
        const { callerUserId, callerRole } = await resolveCaller(extra, mcpServerInstance);
        const limit = Math.min(Math.max(1, params.limit || DEFAULT_LIMIT), MAX_LIMIT);
        const query = (params.query || '').trim();
        if (!query) {
          return { content: [{ type: 'text', text: 'query is required' }], isError: true };
        }

        const matches = [];
        for (const [name, entry] of toolsMap.entries()) {
          if (entry.tool) {
            const tool = entry.tool;
            if (!tool.isActive) continue;
            if (!isToolVisibleToCaller(tool.integration, callerUserId, callerRole)) continue;
            if (!matchesQuery(query, tool.name, tool.description, tool.exposedName, tool.title, tool.integration?.name, ...(tool.integration?.tags || []))) continue;
            const { schema, required } = mcpServerInstance.buildToolInputSchemaDescriptor(tool);
            matches.push({
              name,
              description: tool.description || tool.title || name,
              inputSchema: { type: 'object', properties: schema, required }
            });
          } else if (entry.skill) {
            const skill = entry.skill;
            if (!skill.isShared && skill.userId !== callerUserId && callerRole !== 'admin') continue;
            if (!matchesQuery(query, skill.name, skill.description)) continue;
            matches.push({
              name,
              description: skill.description || skill.name,
              inputSchema: {
                type: 'object',
                properties: Object.fromEntries((skill.inputs || []).map(i => [i.name, { type: i.type || 'string', description: i.label || i.name }])),
                required: (skill.inputs || []).filter(i => i.required).map(i => i.name)
              }
            });
          }
        }

        const totalMatches = matches.length;
        const truncated = totalMatches > limit;
        return {
          content: [{ type: 'text', text: JSON.stringify({ matches: matches.slice(0, limit), totalMatches, truncated }, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  toolsMap.set('search_tools', { type: 'catalog-search' });

  server.registerTool(
    'execute_tool',
    {
      description: 'Execute a tool or skill from the catalog by name (the exact name returned by search_tools). Runs the same policy/rate-limit checks as calling that tool directly.',
      // params is a JSON-object *string* (parsed by hand below), not a
      // nested Zod shape/record - matches the rest of this codebase's
      // schema-building convention (buildZodSchema only ever builds flat
      // primitive fields, even for composite tools' richer param sets).
      inputSchema: z.object({
        name: z.string().describe('The tool or skill name, exactly as returned by search_tools'),
        params: z.string().optional().describe('JSON object string of parameters to pass to the tool, matching its inputSchema - e.g. \'{"key": "value"}\'. Omit for tools that take no parameters.')
      })
    },
    async (params, extra) => {
      const startTime = Date.now();
      let toolParams = {};
      if (params.params) {
        try {
          toolParams = JSON.parse(params.params);
        } catch (e) {
          return { content: [{ type: 'text', text: `params must be valid JSON: ${e.message}` }], isError: true };
        }
      }
      const { callerUserId, callerRole, sessionId } = await resolveCaller(extra, mcpServerInstance);
      const entry = toolsMap.get(params.name);

      if (!entry) {
        return { content: [{ type: 'text', text: `Tool "${params.name}" not found - use search_tools to find the exact name` }], isError: true };
      }
      if (entry.type === 'catalog-search' || entry.type === 'meta') {
        return { content: [{ type: 'text', text: `"${params.name}" is not part of the searchable catalog - call it directly` }], isError: true };
      }

      if (entry.skill) {
        return mcpServerInstance.invokeSkill(params.name, toolParams, extra);
      }

      // Mirrors registerTool's own handler chain exactly (server.js) - the
      // same checks an individual tool call would run, just parameterized
      // by a name resolved here instead of closed over at registration.
      const currentTool = entry.tool;
      const sessionData = mcpServerInstance._sessionClientMap.get(sessionId) ?? { clientName: 'unknown', clientVersion: null };
      const clientInfo = { clientName: sessionData.clientName, clientVersion: sessionData.clientVersion };

      try {
        const policyResult = await checkToolPolicy({ userId: callerUserId, tool: currentTool });
        if (policyResult.decision === 'deny') {
          return { content: [{ type: 'text', text: `Access denied: ${policyResult.reason}` }], isError: true };
        }

        const toolLimit = currentTool.rateLimit || 0;
        const intLimit = currentTool.integration?.rateLimit || {};
        const rateCheck = await checkToolRateLimit(
          currentTool.id, currentTool.userId, toolLimit,
          intLimit.requestsPerMinute || 0, intLimit.requestsPerHour || 0, currentTool.integration?.id
        );
        if (!rateCheck.allowed) {
          return { content: [{ type: 'text', text: `Rate limit exceeded for ${currentTool.name}. Retry in ${rateCheck.resetInSeconds}s.` }], isError: true };
        }

        const result = await mcpServerInstance.executeTool(currentTool, toolParams, clientInfo, callerUserId);
        mcpServerInstance._updateSession(sessionId, params.name, true);
        require('../services/metrics').recordToolCall(params.name, Date.now() - startTime, true);

        // execute_tool is a new, more generic surface than any single
        // registered tool - unlike today's native-MCP tool-call handler
        // (which only writes the fine-grained tool_calls row via
        // executeTool's own logToolCall), this also writes the coarser
        // audit_logs entry, matching the shape routes/consume.js already
        // uses for the same conceptual action - closing a pre-existing gap
        // where that entry only ever came from one of three call paths.
        await audit.log({
          userId: callerUserId,
          action: 'execute_tool',
          integrationType: currentTool.integration?.type,
          integrationId: currentTool.integrationId,
          details: { toolId: currentTool.id, toolName: currentTool.name, method: currentTool.endpoint?.method },
          status: 'success'
        }).catch(err => logger.warn({ err: err.message, toolName: params.name }, 'execute_tool: audit log failed'));

        return {
          content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
          meta: {
            rateLimit: {
              toolRemaining: rateCheck.remaining !== Infinity ? rateCheck.remaining : null,
              integrationRemaining: rateCheck.integrationRemaining !== Infinity ? rateCheck.integrationRemaining : null,
              resetInSeconds: rateCheck.resetInSeconds
            }
          }
        };
      } catch (error) {
        mcpServerInstance._updateSession(sessionId, params.name, false);
        require('../services/metrics').recordToolCall(params.name, Date.now() - startTime, false);
        await audit.log({
          userId: callerUserId,
          action: 'execute_tool',
          integrationType: currentTool.integration?.type,
          integrationId: currentTool.integrationId,
          details: { toolId: currentTool.id, toolName: currentTool.name, error: error.message },
          status: 'failure',
          errorMessage: error.message
        }).catch(err => logger.warn({ err: err.message, toolName: params.name }, 'execute_tool: audit log failed'));
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  toolsMap.set('execute_tool', { type: 'catalog-search' });

  logger.info('search_tools/execute_tool registered');
}

module.exports = { registerCatalogTools };
