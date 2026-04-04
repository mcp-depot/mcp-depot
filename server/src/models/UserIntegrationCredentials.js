const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserIntegrationCredentials = sequelize.define('UserIntegrationCredentials', {
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
  credentials: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'User-specific credentials (encrypted)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'user_integration_credentials',
  indexes: [
    { fields: ['userId', 'integrationId'], unique: true }
  ]
});

module.exports = UserIntegrationCredentials;