const { McpServer, StdioServerTransport } = require('@modelcontextprotocol/sdk/server');
const { loadModels } = require('../config/database');
const { recordToolCall } = require('./metrics');
const AdapterFactory = require('../adapters');
const encryption = require('../services/encryption');
const logger = require('../services/logger');

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
    
    let path = endpoint.path || '';
    
    for (const [key, value] of Object.entries(params || {})) {
      if (path.includes(`{${key}}`)) {
        path = path.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    const queryParams = {};
    for (const [key, value] of Object.entries(params || {})) {
      if (!path.includes(`{${key}}`)) {
        queryParams[key] = value;
      }
    }

    const method = (endpoint.method || 'GET').toUpperCase();
    
    try {
      if (method === 'GET') {
        const result = await adapter.get(path, { params: queryParams });
        return result.data;
      } else if (method === 'POST') {
        const result = await adapter.post(path, params);
        return result.data;
      } else if (method === 'PUT') {
        const result = await adapter.put(path, params);
        return result.data;
      } else if (method === 'DELETE') {
        const result = await adapter.delete(path, { params: queryParams });
        return result.data;
      } else if (method === 'PATCH') {
        const result = await adapter.patch(path, params);
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

  refreshTools() {
    this.toolsMap.clear();
    this.initialize();
    logger.info('Tools refreshed');
  }
}

module.exports = new MCPConnectServer();
