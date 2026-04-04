const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio');
const { Integration } = require('./models/Integration');
const Tool = require('./models/Tool');
const AdapterFactory = require('./adapters');

class MCPConnectClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.tools = [];
  }

  async loadTools() {
    try {
      const tools = await Tool.findAll({
        where: { isActive: true },
        include: [{ model: Integration, where: { isActive: true } }]
      });

      this.tools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object',
          properties: this.extractParams(tool.endpoint.path),
          required: this.extractRequiredParams(tool.endpoint.path)
        }
      }));

      console.log(`Loaded ${this.tools.length} tools for MCP`);
      return this.tools;
    } catch (error) {
      console.error('Failed to load tools:', error.message);
      return [];
    }
  }

  extractParams(path) {
    const params = {};
    const matches = path.match(/\{([^}]+)\}/g);
    if (matches) {
      matches.forEach(match => {
        const paramName = match.replace(/[{}]/g, '');
        params[paramName] = { type: 'string', description: `Parameter: ${paramName}` };
      });
    }
    return params;
  }

  extractRequiredParams(path) {
    const matches = path.match(/\{([^}]+)\}/g);
    if (matches) {
      return matches.map(m => m.replace(/[{}]/g, ''));
    }
    return [];
  }

  async executeTool(toolName, args) {
    const tool = await Tool.findOne({
      where: { name: toolName, isActive: true },
      include: [{ model: Integration, where: { isActive: true } }]
    });

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const integration = tool.Integration;
    const adapter = AdapterFactory.create(integration.type, integration.config);

    let path = tool.endpoint.path;
    for (const [key, value] of Object.entries(args || {})) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }

    const result = await adapter.get(path, { params: {}, headers: {} });
    
    tool.usageCount += 1;
    tool.lastUsedAt = new Date();
    await tool.save();

    return result.data;
  }
}

module.exports = MCPConnectClient;