const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExternalMcpServer = sequelize.define('ExternalMcpServer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    description: 'Display name for the external MCP server'
  },
  runtime: {
    type: DataTypes.STRING,
    defaultValue: 'node',
    description: 'Runtime: node, python, etc.'
  },
  transportType: {
    type: DataTypes.STRING,
    defaultValue: 'http',
    description: 'Transport type: http, stdio, sse'
  },
  url: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'URL of the external MCP server (e.g., http://localhost:3001/api/mcp)'
  },
  command: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'Command to run for stdio transport (e.g., npx, node)'
  },
  args: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'Arguments for stdio command (JSON array as string, e.g., ["bitbucket-mcp"])'
  },
  env: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'Environment variables for stdio (JSON object as string)'
  },
  authType: {
    type: DataTypes.STRING,
    defaultValue: 'none',
    description: 'Authentication type: none, bearer, apiKey'
  },
  authToken: {
    type: DataTypes.STRING,
    description: 'Authentication token (will be encrypted)'
  },
  authHeader: {
    type: DataTypes.STRING,
    description: 'Custom auth header name (for X-API-Key style auth)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastFetchedAt: {
    type: DataTypes.DATE,
    description: 'Last successful tools fetch timestamp'
  },
  lastFetchError: {
    type: DataTypes.STRING(500),
    description: 'Last fetch error message'
  },
  sessionMode: {
    type: DataTypes.STRING,
    defaultValue: 'stateful',
    description: '"stateful" = reuse persistent connection; "stateless" = new connection per call'
  },
  toolsHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    description: 'SHA-256 hash of last fetched tool list for change detection'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'external_mcp_servers'
});

module.exports = ExternalMcpServer;
