const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { loadModels } = require('../config/database');
const { recordToolCall } = require('../services/metrics');
const AdapterFactory = require('../adapters');
const encryption = require('../services/encryption');
const logger = require('../services/logger');

const { randomUUID } = require('crypto');

const VALID_SCHEMA_KEY = /^[a-zA-Z0-9_\-]{1,64}$/;
const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);

class MCPConnectServer {
  constructor() {
    this.server = null;
    this.toolsMap = new Map();
  }

  async initialize() {
    const { Tool, Integration } = loadModels();
    
    const tools = await Tool.findAll({
      where: { isActive: true },
      include: [{ model: Integration, where: { isActive: true } }]
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
    const params = endpoint.params || {};
    
    const schema = {};
    const required = [];

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

    const adapter = tool.Integration ? AdapterFactory.create(
      tool.Integration.type,
      tool.Integration.config
    ) : null;

    this.toolsMap.set(toolName, { tool, adapter });

    this.server.tool(
      toolName,
      {
        description: tool.description || toolName,
        inputSchema: {
          type: 'object',
          properties: schema,
          required: required.length > 0 ? required : undefined
        }
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
    const endpoint = tool.endpoint || {};
    const integration = tool.Integration;
    
    if (!integration) {
      throw new Error('Tool has no associated integration');
    }

    const adapter = AdapterFactory.create(integration.type, integration.config);
    
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
      bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/\{(\w+)\}/g, (match, key) => {
        return params?.[key] !== undefined ? JSON.stringify(params[key]) : match;
      }));
    }

    const method = (endpoint.method || 'GET').toUpperCase();
    
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
      logger.error({ tool: tool.name, error: error.message }, 'Tool execution failed');
      throw error;
    }
  }

  sanitizeToolName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
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
    
    const { Tool, Integration } = loadModels();
    const tools = await Tool.findAll({
      where: { isActive: true },
      include: [{ model: Integration, where: { isActive: true } }]
    });

    for (const tool of tools) {
      this.registerTool(tool);
    }
    
    await this.server.sendToolListChanged();
    
    logger.info({ toolCount: tools.length }, 'Tools refreshed');
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

function getMcpClients() {
  return 0;
}

module.exports = mcpServerInstance;
module.exports.refreshToolsIfEnabled = refreshToolsIfEnabled;
module.exports.getMcpClients = getMcpClients;
