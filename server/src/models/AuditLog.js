const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
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
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  integrationType: {
    type: DataTypes.STRING
  },
  integrationId: {
    type: DataTypes.UUID
  },
  details: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  status: {
    type: DataTypes.ENUM('success', 'failure', 'pending'),
    defaultValue: 'pending'
  },
  errorMessage: {
    type: DataTypes.STRING
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'audit_logs'
});

module.exports = AuditLog;
