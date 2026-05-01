const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { loadModels } = require('../config/database');
const { recordToolCall } = require('../services/metrics');
const { logToolCall } = require('../services/tool-logger');
const AdapterFactory = require('../adapters');
const encryption = require('../services/encryption');
const logger = require('../services/logger');
const { executeCompositeTool } = require('../services/compositeExecutor');
const { pruneNulls } = require('../services/body-utils');
const { deriveAnnotations } = require('../services/annotations');
const { checkRateLimit: checkToolRateLimit } = require('../services/rate-limiter');
const { filterFields } = require('../utils/fieldFilter');
const { isBinary, isImage, buildBinaryResult } = require('../services/binaryResponse');
const transformerLoader = require('../transformers/loader');
const { renderTemplate, applyDefaults, validateRequired } = require('../prompts/renderer');
const { z } = require('zod/v3');

function coerceParam(value, paramDefs, key) {
  const type = paramDefs?.[key]?.type;
  if (type === 'number' || type === 'integer') return Number(value);
  if (type === 'boolean') return value === 'true' || value === true;
  return value;
}

const { randomUUID } = require('crypto');

const VALID_SCHEMA_KEY = /^[a-zA-Z0-9_\-]{1,64}$/;
const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);

function buildZodSchema(schema, required = []) {
  const shape = {};
  for (const [key, prop] of Object.entries(schema)) {
    if (OPENAPI_KEYWORDS.has(key) || !VALID_SCHEMA_KEY.test(key)) continue;
    let zType;
    switch (prop.type) {
      case 'number':
      case 'integer':
        zType = z.number();
        break;
      case 'boolean':
        zType = z.boolean();
        break;
      default:
        zType = z.string();
    }
    if (!required.includes(key)) {
      zType = zType.optional();
    }
    shape[key] = zType;
  }
  return shape;
}

class MCPDepotServer {
  constructor() {
    this.server = null;
    this.toolsMap = new Map();
  }

  async initialize() {
    const { Tool, Integration, PromptLibrary, AgentPersona } = loadModels();
    
    const tools = await Tool.findAll({
      where: { isActive: true },
      include: [{ model: Integration, as: 'integration', where: { isActive: true } }]
    });

    if (!this.server) {
      this.server = new McpServer({
        name: 'mcp-depot',
        version: '1.0.0'
      });
    }

    for (const tool of tools) {
      this.registerTool(tool);
    }

    const skills = await PromptLibrary.findAll();
    for (const skill of skills) {
      this.registerSkill(skill);
    }

    const personas = await AgentPersona.findAll();
    for (const persona of personas) {
      this.registerPersona(persona);
    }

    this.registerPersonaTools();

    this.registerPrompts();

    this.registerMetaTools();

    this.registerWatchUntilDone();

    logger.info({ toolCount: tools.length, skillCount: skills.length, personaCount: personas.length }, 'MCP Server initialized');
  }

  registerTool(tool) {
    if (tool.type === 'meta') return;

    const toolName = this.sanitizeToolName(tool.name);
    const endpoint = tool.endpoint || {};

    let schema = {};
    let required = [];

    if (tool.type === 'composite' && tool.inputSchema) {
      schema = this.buildSchemaFromInputSchema(tool.inputSchema);
      required = tool.inputSchema.required || [];
    } else {
      const params = endpoint.params || {};
      for (const [key, param] of Object.entries(params)) {
        if (OPENAPI_KEYWORDS.has(key) || !VALID_SCHEMA_KEY.test(key)) continue;
        schema[key] = {
          type: param.type || 'string',
          description: param.description || key
        };
        if (param.required) {
          required.push(key);
        }
      }

      const bodyTemplateVars = (JSON.stringify(endpoint.body || {})
        .match(/\{(\w+)\}/g) || [])
        .map(m => m.slice(1, -1));
      for (const varName of bodyTemplateVars) {
        if (OPENAPI_KEYWORDS.has(varName) || !VALID_SCHEMA_KEY.test(varName)) continue;
        if (!schema[varName]) {
          schema[varName] = { type: 'string', description: `Body parameter: ${varName}` };
          required.push(varName);
        }
      }
    }

    const adapter = tool.Integration ? AdapterFactory.create(
      tool.Integration.type,
      { ...tool.Integration.config, integrationId: tool.Integration.id }
    ) : null;

    this.toolsMap.set(toolName, { tool, adapter });

    const inputSchema = z.object(buildZodSchema(schema, required));

    const annotations = endpoint.annotations || deriveAnnotations(endpoint.method);

    this.server.tool(
      toolName,
      {
        description: tool.description || toolName,
        inputSchema,
        annotations
      },
      async (params) => {
        const startTime = Date.now();
        try {
          const toolLimit = tool.rateLimit || 0;
          const intLimit = tool.Integration?.rateLimit || {};
          const integrationLimitRpm = intLimit.requestsPerMinute || 0;
          const integrationLimitRph = intLimit.requestsPerHour || 0;
          const rateCheck = checkToolRateLimit(tool.id, tool.userId, toolLimit, integrationLimitRpm, integrationLimitRph);
          if (!rateCheck.allowed) {
            return {
              content: [{
                type: 'text',
                text: `Rate limit exceeded for ${tool.name}. Retry in ${rateCheck.resetInSeconds}s.`
              }],
              isError: true
            };
          }

          const result = await this.executeTool(tool, params);
          recordToolCall(toolName, Date.now() - startTime, true);
          return {
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }],
            meta: {
              rateLimit: {
                toolRemaining: rateCheck.toolRemaining !== Infinity ? rateCheck.toolRemaining : null,
                integrationRemaining: rateCheck.integrationRemaining !== Infinity ? rateCheck.integrationRemaining : null,
                resetInSeconds: rateCheck.resetInSeconds
              }
            }
          };
        } catch (error) {
          recordToolCall(toolName, Date.now() - startTime, false);
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    logger.debug({ tool: toolName }, 'Tool registered');
  }

  async executeTool(tool, params) {
    if (tool.type === 'composite') {
      const result = await executeCompositeTool(tool, params, tool.userId);
      return result;
    }

    const endpoint = tool.endpoint || {};
    const integration = tool.Integration;
    
    if (!integration) {
      throw new Error('Tool has no associated integration');
    }

    const secretStore = require('../services/secret-store');
    let resolvedConfig = integration.config;
    if (secretStore.isInitialized()) {
      const credentials = resolvedConfig.auth?.credentials;
      if (credentials) {
        for (const [key, value] of Object.entries(credentials)) {
          if (typeof value === 'string' && secretStore.isSecretRef(value)) {
            const resolved = await secretStore.resolveSecret(value);
            if (resolved) {
              resolvedConfig = { ...resolvedConfig };
              resolvedConfig.auth = { ...resolvedConfig.auth };
              resolvedConfig.auth.credentials = { ...credentials };
              resolvedConfig.auth.credentials[key] = resolved;
            }
          }
        }
      }
    }

    const adapter = AdapterFactory.create(integration.type, resolvedConfig);
    
    const originalPath = endpoint.path || '';
    let path = originalPath;
    
    for (const [key, value] of Object.entries(params || {})) {
      if (originalPath.includes(`{${key}}`)) {
        path = path.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    const remainingParams = {};
    for (const [key, value] of Object.entries(params || {})) {
      if (!originalPath.includes(`{${key}}`)) {
        remainingParams[key] = value;
      }
    }

    let bodyParams = endpoint.body || {};
    if (typeof bodyParams === 'object' && bodyParams !== null) {
      bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/"\{(\w+)\}"/g, (match, key) => {
        if (params?.[key] === undefined) return 'null';
        const coerced = coerceParam(params[key], endpoint.params, key);
        return JSON.stringify(coerced);
      }));
      bodyParams = pruneNulls(bodyParams);
    }

    const method = (endpoint.method || 'GET').toUpperCase();
    const startTime = Date.now();
    let success = true;
    let responseStatus = 200;
    let errorMessage = null;
    
    try {
      const fields = endpoint.responseFields || tool.responseFields;
      const binaryOpt = endpoint.binaryResponse;
      let data;
      let result;
      if (binaryOpt) {
        result = await adapter.fetchBinary(path, { params: remainingParams });
        const contentType = result.headers['content-type'] || '';
        if (isBinary(contentType)) {
          const b64 = Buffer.from(result.data).toString('base64');
          return buildBinaryResult(b64, contentType);
        }
        data = result.data;
      } else {
        if (method === 'GET') {
          result = await adapter.get(path, { params: remainingParams });
          data = result.data;
        } else if (method === 'POST') {
          result = await adapter.post(path, bodyParams);
        data = result.data;
        } else if (method === 'PUT') {
          result = await adapter.put(path, bodyParams);
          data = result.data;
        } else if (method === 'DELETE') {
          result = await adapter.delete(path, { params: remainingParams });
          data = result.data;
        } else if (method === 'PATCH') {
          result = await adapter.patch(path, bodyParams);
          data = result.data;
        } else {
          throw new Error(`Unsupported method: ${method}`);
        }
        const contentType = result.headers?.['content-type'] || '';
        if (isBinary(contentType)) {
          const buf = Buffer.from(JSON.stringify(data));
          const b64 = buf.toString('base64');
          return buildBinaryResult(b64, contentType);
        }
      }
      const transformerName = endpoint.responseTransformer || tool.responseTransformer;
      const filtered = Array.isArray(data)
        ? data.map(item => filterFields(item, fields))
        : filterFields(data, fields);
      if (transformerName) {
        const fn = transformerLoader.get(transformerName);
        if (fn) return fn(filtered);
        logger.warn({ tool: tool.name, transformer: transformerName }, 'Response transformer not found');
      }
      return filtered;
    } catch (error) {
      success = false;
      responseStatus = error.response?.status || 500;
      errorMessage = error.message;
      logger.error({ tool: tool.name, error: error.message }, 'Tool execution failed');
      
      await logToolCall({
        toolId: tool.id,
        userId: tool.userId,
        integrationId: integration.id,
        callerId: null,
        callerType: 'mcp',
        method,
        path: endpoint.path,
        requestHeaders: {},
        requestBody: bodyParams,
        queryParams: remainingParams,
        responseStatus,
        responseBody: { error: errorMessage },
        responseTime: Date.now() - startTime,
        success: false,
        errorMessage,
      });
      
      throw error;
    } finally {
      if (success) {
        await logToolCall({
          toolId: tool.id,
          userId: tool.userId,
          integrationId: integration.id,
          callerId: null,
          callerType: 'mcp',
          method,
          path: endpoint.path,
          requestHeaders: {},
          requestBody: bodyParams,
          queryParams: remainingParams,
          responseStatus,
          responseBody: null,
          responseTime: Date.now() - startTime,
          success: true,
        });
      }
    }
  }

  buildSchemaFromInputSchema(inputSchema) {
    const schema = {};
    const properties = inputSchema.properties || {};

    for (const [key, prop] of Object.entries(properties)) {
      if (OPENAPI_KEYWORDS.has(key) || !VALID_SCHEMA_KEY.test(key)) continue;
      schema[key] = {
        type: prop.type || 'string',
        description: prop.description || key
      };
    }

    return schema;
  }

  sanitizeToolName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
  }

  registerSkill(skill) {
    const skillName = 'skill_' + this.sanitizeToolName(skill.name);
    const schema = {};
    const required = [];

    const inputs = skill.inputs || [];
    for (const input of inputs) {
      if (!VALID_SCHEMA_KEY.test(input.name)) continue;
      schema[input.name] = {
        type: input.type || 'string',
        description: input.label || input.name
      };
      if (input.required) {
        required.push(input.name);
      }
    }

    this.toolsMap.set(skillName, { skill, type: 'skill' });

    const zodSchema = z.object(buildZodSchema(schema, required));

    this.server.tool(
      skillName,
      {
        description: skill.description || `Skill: ${skill.name}`,
        inputSchema: zodSchema
      },
      async (params) => {
        try {
          const renderedPrompt = this.renderSkillPrompt(skill, params);
          
          let result;
          if (skill.outputFormat === 'json') {
            try {
              result = JSON.parse(renderedPrompt);
            } catch {
              result = { output: renderedPrompt };
            }
          } else if (skill.outputFormat === 'markdown') {
            result = { format: 'markdown', content: renderedPrompt };
          } else {
            result = renderedPrompt;
          }

          return {
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    logger.debug({ skill: skillName }, 'Skill registered');
  }

  registerPersona(persona) {
    const personaName = this.sanitizeToolName(`get-${persona.name}`);

    this.server.tool(
      personaName,
      {
        description: `Retrieve the ${persona.role} persona system prompt`,
        inputSchema: { type: 'object', properties: {} }
      },
      async () => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name: persona.name,
              role: persona.role,
              description: persona.description,
              systemPrompt: persona.systemPrompt
            }, null, 2)
          }]
        };
      }
    );
  }

  async registerPersonaTools() {
    const { AgentPersona } = require('../config/database').loadModels();

    this.server.tool(
      'list-personas',
      {
        description: 'List all available agent personas. Each persona is a named system prompt that can be applied to any MCP client session.',
        inputSchema: z.object({})
      },
      async () => {
        try {
          const personas = await AgentPersona.findAll({ order: [['name', 'ASC']] });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(personas.map(p => ({
                name: p.name,
                role: p.role,
                description: p.description
              })), null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      'get-persona',
      {
        description: 'Retrieve the system prompt and metadata for a named persona.',
        inputSchema: z.object({ name: z.string().describe('Persona name, e.g. "security-reviewer"') })
      },
      async (params) => {
        try {
          const persona = await AgentPersona.findOne({ where: { name: params.name } });
          if (!persona) {
            return {
              content: [{ type: 'text', text: `Persona "${params.name}" not found` }],
              isError: true
            };
          }
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                name: persona.name,
                role: persona.role,
                description: persona.description,
                systemPrompt: persona.systemPrompt
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      'store-persona',
      {
        description: 'Save or update an agent persona. Use to create new personas or update existing ones.',
        inputSchema: z.object({
          name: z.string().describe('Persona key, e.g. "security-reviewer"'),
          role: z.string().describe('Short display label, e.g. "Security Reviewer"'),
          systemPrompt: z.string().describe('Full system prompt for this persona'),
          description: z.string().optional().describe('One-line summary'),
          shared: z.boolean().optional().describe('If true, visible to all team members')
        })
      },
      async (params) => {
        try {
          const [persona, created] = await AgentPersona.findOrCreate({
            where: { name: params.name },
            defaults: {
              name: params.name,
              role: params.role,
              systemPrompt: params.systemPrompt,
              description: params.description || '',
              isShared: params.shared || false
            }
          });
          if (!created) {
            await persona.update({
              role: params.role,
              systemPrompt: params.systemPrompt,
              description: params.description !== undefined ? params.description : persona.description,
              isShared: params.shared !== undefined ? params.shared : persona.isShared
            });
          }
          return {
            content: [{
              type: 'text',
              text: `Persona "${params.name}" ${created ? 'created' : 'updated'}.`
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }
    );

    logger.debug('Persona tools registered');
  }

  async registerPrompts() {
    const { PromptLibrary } = require('../config/database').loadModels();

    this.server.prompt('list', async () => {
      try {
        const prompts = await PromptLibrary.findAll({
          where: { isShared: true },
          order: [['name', 'ASC']],
          attributes: ['name', 'description', 'inputs']
        });
        return {
          prompts: prompts.map(p => ({
            name: p.name,
            description: p.description || '',
            arguments: (p.inputs || []).map(i => ({
              name: i.name,
              description: i.description || '',
              required: !!i.required
            }))
          }))
        };
      } catch (error) {
        logger.error({ err: error.message }, 'prompts/list failed');
        return { prompts: [] };
      }
    });

    this.server.prompt('get', async ({ name, arguments: args }) => {
      try {
        const prompt = await PromptLibrary.findOne({ where: { name } });
        if (!prompt) {
          throw new Error(`Prompt not found: ${name}`);
        }
        const inputs = prompt.inputs || [];
        const missing = validateRequired(inputs, args || {});
        if (missing.length > 0) {
          throw new Error(`Missing required arguments: ${missing.join(', ')}`);
        }
        const merged = applyDefaults(inputs, args);
        const text = renderTemplate(prompt.prompt, merged);
        return {
          description: prompt.description || '',
          messages: [{ role: 'user', content: { type: 'text', text } }]
        };
      } catch (error) {
        throw new Error(error.message);
      }
    });

    logger.debug('MCP Prompts registered');
  }

  registerMetaTools() {
    const { registerMetaTools } = require('./meta-tools');
    // Always register — each handler checks isActive at call time
    registerMetaTools(this.server, this.toolsMap);
  }

  registerWatchUntilDone() {
    const { loadAdapter, KNOWN } = require('../watchers/adapters');
    const { runWatcher } = require('../watchers/engine');
    const { Integration } = loadModels();
    const secretStore = require('../services/secret-store');

    const sourcesDesc = `Available sources: ${KNOWN.join(', ')}. ` +
      'Requires an integrationId pointing to a configured Jenkins, GitHub, or Bitbucket integration.';

    const watchSchema = z.object({
      integrationId: z.string().describe('UUID of the integration that holds credentials for this watcher'),
      trigger: z.object({}).passthrough().describe('Adapter-specific trigger parameters (e.g. { job: "my-job", build: "42" } for jenkins)'),
      pollIntervalSeconds: z.number().optional().describe('Seconds between polls (default provided by adapter)'),
      timeoutSeconds: z.number().optional().describe('Maximum watch duration in seconds (default 3600)')
    });

    this.server.tool('watch_until_done', {
      description: 'Wait for an asynchronous external process (CI build, deployment, pipeline) to complete. Polls internally and sends progress notifications. Returns structured summary on completion.',
      inputSchema: watchSchema
    }, async (args, extra) => {
      const startTime = Date.now();
      const watchId = `watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      try {
        const integration = await Integration.findByPk(args.integrationId);
        if (!integration) {
          throw new Error(`Integration ${args.integrationId} not found`);
        }

        let resolvedConfig = integration.config;
        if (secretStore.isInitialized()) {
          const credentials = resolvedConfig.auth?.credentials;
          if (credentials) {
            for (const [key, value] of Object.entries(credentials)) {
              if (typeof value === 'string' && secretStore.isSecretRef(value)) {
                const resolved = await secretStore.resolveSecret(value);
                if (resolved) {
                  resolvedConfig = { ...resolvedConfig };
                  resolvedConfig.auth = { ...resolvedConfig.auth };
                  resolvedConfig.auth.credentials = { ...credentials };
                  resolvedConfig.auth.credentials[key] = resolved;
                }
              }
            }
          }
        }

        const adapter = await loadAdapter(integration.type);

        const result = await runWatcher({
          watchId,
          adapter,
          trigger: args.trigger,
          credentials: resolvedConfig,
          integrationType: integration.type,
          meta: { pollIntervalSeconds: args.pollIntervalSeconds, timeoutSeconds: args.timeoutSeconds },
          signal: extra?.signal,
          onProgress: ({ status, progress, elapsed }) => {
            if (extra?.progressToken) {
              this.server.server.notification({
                method: 'notifications/progress',
                params: {
                  progressToken: extra.progressToken,
                  progress: elapsed,
                  total: args.timeoutSeconds ?? 3600,
                  message: `${status}${progress ? ` - ${progress}` : ''} (${elapsed}s)`
                }
              }).catch(() => {});
            }
          }
        });

        recordToolCall('watch_until_done', Date.now() - startTime, true);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        recordToolCall('watch_until_done', Date.now() - startTime, false);
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });

    logger.info('watch_until_done tool registered');
  }

  renderSkillPrompt(skill, inputValues) {
    let rendered = skill.prompt || '';
    
    Object.entries(inputValues || {}).forEach(([key, value]) => {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(placeholder, value !== undefined && value !== null ? String(value) : '');
      
      const conditionalStart = new RegExp(`\\{\\{#${key}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
      rendered = rendered.replace(conditionalStart, (match, content) => {
        return (value && String(value).trim()) ? content : '';
      });
      
      const conditionalInverse = new RegExp(`\\{\\{\\^{${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
      rendered = rendered.replace(conditionalInverse, (match, content) => {
        return (!value || !String(value).trim()) ? content : '';
      });
    });
    
    return rendered;
  }

  async startStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Server started with stdio transport');
  }

  async startHttp(app) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID()
    });
    
    app.post('/mcp', (req, res) => transport.handleRequest(req, res));
    app.get('/mcp', (req, res) => transport.handleRequest(req, res));
    app.delete('/mcp', (req, res) => transport.handleRequest(req, res));
    
    await this.server.connect(transport);
    logger.info('MCP Server started with HTTP+SSE transport');
  }

  async refreshTools() {
    this.toolsMap.clear();
    
    const { Tool, Integration, PromptLibrary, AgentPersona } = loadModels();
    const tools = await Tool.findAll({
      where: { isActive: true },
      include: [{ model: Integration, where: { isActive: true } }]
    });

    for (const tool of tools) {
      this.registerTool(tool);
    }

    const skills = await PromptLibrary.findAll();
    for (const skill of skills) {
      this.registerSkill(skill);
    }

    const personas = await AgentPersona.findAll();
    for (const persona of personas) {
      this.registerPersona(persona);
    }
    
    this.registerPersonaTools();
    
    this.registerPrompts();
    
    this.registerMetaTools();

    this.registerWatchUntilDone();
    
    await this.server.sendToolListChanged();
    
    logger.info({ toolCount: tools.length, skillCount: skills.length, personaCount: personas.length }, 'Tools refreshed');
  }
}

const mcpServerInstance = new MCPDepotServer();

async function refreshToolsIfEnabled() {
  if (process.env.MCP_ENABLED === 'true') {
    try {
      await mcpServerInstance.refreshTools();
    } catch (err) {
      logger.warn({ err: err.message }, 'Tool refresh failed');
    }
  }
}

let mcpEnabled = false;
let mcpStartTime = null;

function getMcpClients() {
  // Return 1 if MCP is enabled and has started, 0 otherwise
  // For stdio mode, there's no connection tracking - this indicates server availability
  // For HTTP mode, actual connection tracking would require SSE session management
  return mcpEnabled && mcpStartTime ? 1 : 0;
}

function setMcpEnabled(enabled) {
  mcpEnabled = enabled;
  if (enabled && !mcpStartTime) {
    mcpStartTime = Date.now();
  }
}

module.exports = mcpServerInstance;
module.exports.refreshToolsIfEnabled = refreshToolsIfEnabled;
module.exports.getMcpClients = getMcpClients;
module.exports.setMcpEnabled = setMcpEnabled;
