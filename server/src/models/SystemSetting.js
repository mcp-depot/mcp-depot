const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SystemSetting = sequelize.define('SystemSetting', {
  key: {
    type: DataTypes.STRING(100),
    primaryKey: true,
    allowNull: false
  },
  value: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  description: {
    type: DataTypes.STRING(500)
  }
}, {
  tableName: 'system_settings'
});

module.exports = SystemSetting;
