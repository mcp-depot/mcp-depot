const { McpServer, StdioServerTransport } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport: StdioTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { loadModels } = require('../config/database');
const { recordToolCall } = require('../services/metrics');
const AdapterFactory = require('../adapters');
const encryption = require('../services/encryption');
const logger = require('../services/logger');

const { randomUUID } = require('crypto');

class MCPConnectServer {
  constructor() {
    this.server = null;
    this.toolsMap = new Map();
    this.httpTransports = new Set();
  }

  async initialize() {
    const { Tool, Integration } = loadModels();
    
    const tools = await Tool.findAll({
      where: { isActive: true },
      include: [{ model: Integration, where: { isActive: true } }]
    });

    this.server = new McpServer({
      name: 'mcpconnect',
      version: '1.0.0'
    });

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
      schema[key] = {
        type: param.type || 'string',
        description: param.description || key
      };
      if (param.required) {
        required.push(key);
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

    const method = (endpoint.method || 'GET').toUpperCase();
    
    try {
      if (method === 'GET') {
        const result = await adapter.get(path, { params: remainingParams });
        return result.data;
      } else if (method === 'POST') {
        const result = await adapter.post(path, remainingParams);
        return result.data;
      } else if (method === 'PUT') {
        const result = await adapter.put(path, remainingParams);
        return result.data;
      } else if (method === 'DELETE') {
        const result = await adapter.delete(path, { params: remainingParams });
        return result.data;
      } else if (method === 'PATCH') {
        const result = await adapter.patch(path, remainingParams);
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
    
    this.httpTransports.add(transport);
    
    app.post('/mcp', (req, res) => transport.handleRequest(req, res));
    app.get('/mcp', (req, res) => transport.handleRequest(req, res));
    app.delete('/mcp', (req, res) => transport.handleRequest(req, res));
    
    await this.server.connect(transport);
    logger.info('MCP Server started with HTTP+SSE transport');
  }

  async refreshTools() {
    this.toolsMap.clear();
    await this.initialize();
    
    await this.server.sendToolListChanged();
    
    logger.info('Tools refreshed');
  }
}

const mcpServerInstance = new MCPConnectServer();

async function refreshToolsIfEnabled() {
  if (process.env.MCP_STDIO_ENABLED === 'true') {
    try {
      await mcpServerInstance.refreshTools();
    } catch (err) {
      logger.warn({ err: err.message }, 'Tool refresh failed');
    }
  }
}

module.exports = mcpServerInstance;
module.exports.refreshToolsIfEnabled = refreshToolsIfEnabled;
