const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ToolCall = sequelize.define('ToolCall', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  toolId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'tools', key: 'id' }
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  integrationId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'integrations', key: 'id' }
  },
  callerId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Identifier of the caller (MCP client, IP, etc.)'
  },
  callerType: {
    type: DataTypes.ENUM('mcp', 'rest', 'api_key', 'unknown'),
    defaultValue: 'unknown'
  },
  method: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  path: {
    type: DataTypes.STRING(1000),
    allowNull: false
  },
  requestHeaders: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Sanitized request headers (no credentials)'
  },
  requestBody: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Request body (sanitized)'
  },
  queryParams: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Query parameters'
  },
  responseStatus: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  responseBody: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Response body (truncated if too large)'
  },
  responseTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Response time in milliseconds'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if call failed'
  },
  success: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: 'Client IP address'
  },
  userAgent: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Client user agent'
  }
}, {
  tableName: 'tool_calls',
  indexes: [
    { fields: ['toolId'] },
    { fields: ['userId'] },
    { fields: ['integrationId'] },
    { fields: ['createdAt'] },
    { fields: ['success'] },
    { fields: ['callerType'] }
  ]
});

module.exports = ToolCall;