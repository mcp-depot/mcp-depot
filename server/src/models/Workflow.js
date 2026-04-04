const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Workflow = sequelize.define('Workflow', {
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
    allowNull: false
  },
  description: {
    type: DataTypes.STRING
  },
  trigger: {
    type: DataTypes.JSONB,
    defaultValue: { type: 'manual' }
  },
  actions: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastExecutedAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'workflows'
});

module.exports = Workflow;
