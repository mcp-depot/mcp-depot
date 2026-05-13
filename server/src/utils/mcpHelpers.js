function refreshMcpTools() {
  if (process.env.MCP_ENABLED === 'true') {
    const { refreshToolsIfEnabled } = require('../mcp/server');
    refreshToolsIfEnabled();
  }
}

module.exports = { refreshMcpTools };
