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

class MCPConnectServer {
  constructor() {
    this.server = null;
    this.toolsMap = new Map();
  }

  async initialize() {
    const { Tool, Integration, PromptLibrary } = loadModels();
    
    const tools = await Tool.findAll({
      where: { isActive: true },
      include: [{ model: Integration, as: 'integration', where: { isActive: true } }]
    });

    if (!this.server) {
      this.server = new McpServer({
        name: 'mcpconnect',
        version: '1.0.0'
      });
    }

    for (const tool of tools) {
      this.registerTool(tool);
    }

    logger.info({ toolCount: tools.length }, 'MCP Server initialized');
  }

  registerTool(tool) {
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

    this.server.tool(
      toolName,
      {
        description: tool.description || toolName,
        inputSchema
      },
      async (params) => {
        const startTime = Date.now();
        try {
          const result = await this.executeTool(tool, params);
          recordToolCall(toolName, Date.now() - startTime, true);
          return {
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }]
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
      if (method === 'GET') {
        const result = await adapter.get(path, { params: remainingParams });
        return result.data;
      } else if (method === 'POST') {
        const result = await adapter.post(path, bodyParams);
        return result.data;
      } else if (method === 'PUT') {
        const result = await adapter.put(path, bodyParams);
        return result.data;
      } else if (method === 'DELETE') {
        const result = await adapter.delete(path, { params: remainingParams });
        return result.data;
      } else if (method === 'PATCH') {
        const result = await adapter.patch(path, bodyParams);
        return result.data;
      }
      
      throw new Error(`Unsupported method: ${method}`);
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

    this.server.tool(
      skillName,
      {
        description: skill.description || `Skill: ${skill.name}`,
        inputSchema: {
          type: 'object',
          properties: schema,
          required: required.length > 0 ? required : undefined
        }
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
    
    const { Tool, Integration, PromptLibrary } = loadModels();
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
    
    await this.server.sendToolListChanged();
    
    logger.info({ toolCount: tools.length, skillCount: skills.length }, 'Tools refreshed');
  }
}

const mcpServerInstance = new MCPConnectServer();

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
