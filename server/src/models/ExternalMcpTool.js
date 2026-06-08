const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExternalMcpTool = sequelize.define('ExternalMcpTool', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  externalMcpServerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'external_mcp_servers', key: 'id' }
  },
  toolName: {
    type: DataTypes.STRING,
    allowNull: false,
    description: 'Original tool name from the external server'
  },
  namespacedName: {
    type: DataTypes.STRING,
    allowNull: false,
    description: 'ServerName__toolName format exposed to AI'
  },
  description: {
    type: DataTypes.TEXT,
    description: 'Tool description'
  },
  inputSchema: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    description: 'Last time this tool was discovered on the external server'
  }
}, {
  tableName: 'external_mcp_tools',
  indexes: [
    {
      unique: true,
      fields: ['externalMcpServerId', 'toolName']
    }
  ]
});

module.exports = ExternalMcpTool;
