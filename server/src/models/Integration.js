const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Integration = sequelize.define('Integration', {
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
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'custom'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.STRING
  },
  config: {
    type: DataTypes.JSON,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  visibility: {
    type: DataTypes.STRING(10),
    defaultValue: 'private'
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  rateLimit: {
    type: DataTypes.JSON,
    defaultValue: { requestsPerMinute: 0, requestsPerHour: 0 },
    comment: 'Integration-level rate limits: { requestsPerMinute, requestsPerHour }, 0 = unlimited'
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  }
}, {
  tableName: 'integrations',
  hooks: {
    beforeSave: (integration) => {
      if (integration.changed('config') && integration.config?.auth?.credentials) {
        const encryption = require('../services/encryption');
        const config = JSON.parse(JSON.stringify(integration.config));
        config.auth.credentials = encryption.encryptObject(config.auth.credentials);
        integration.config = config;
      }
    },
    afterFind: (result) => {
      const encryption = require('../services/encryption');
      const instances = Array.isArray(result) ? result : [result];
      for (const i of instances.filter(Boolean)) {
        if (i?.config?.auth?.credentials) {
          i.config = { ...i.config, auth: { ...i.config.auth,
            credentials: encryption.decryptObject(i.config.auth.credentials) } };
        }
      }
    }
  }
});

module.exports = Integration;
