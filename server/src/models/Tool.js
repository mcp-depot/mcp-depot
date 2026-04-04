const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tool = sequelize.define('Tool', {
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
  integrationId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'integrations', key: 'id' }
  },
  name: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  endpoint: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  inputSchema: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  outputSchema: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  usageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastUsedAt: {
    type: DataTypes.DATE
  },
  // Phase 1: Core Enhancements
  rateLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // 0 = no limit, otherwise requests per minute
    comment: 'Requests per minute limit (0 = unlimited)'
  },
  cacheTTL: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // 0 = no cache, otherwise seconds
    comment: 'Cache TTL in seconds (0 = disabled)'
  },
  transformRequest: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Request transformation rules'
  },
  transformResponse: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Response transformation rules'
  }
}, {
  tableName: 'tools'
});

module.exports = Tool;
