const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PolicyRule = sequelize.define('PolicyRule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  resourceType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: "e.g. 'tool', 'session_context', 'session_channel', or '*' for every resource type"
  },
  resourceMatch: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: '*',
    comment: "Exact resource id/name, a prefix pattern (e.g. 'jira_*'), or '*' for all resources of this type"
  },
  action: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '*',
    comment: "Vocabulary is per-resourceType, e.g. tool: 'execute'; session_channel: 'post'|'read'|'clear'|'subscribe'"
  },
  subjectType: {
    type: DataTypes.ENUM('user', 'role', 'group', '*'),
    allowNull: false
  },
  subjectId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: "userId, role name ('admin'/'user'), or groupId depending on subjectType; null when subjectType is '*'"
  },
  effect: {
    type: DataTypes.ENUM('allow', 'deny', 'limit'),
    allowNull: false
  },
  limitConfig: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "{ maxPerHour, maxPerDay } - only meaningful when effect='limit'"
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Manual tie-break among rules of otherwise-equal specificity; higher wins'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Admin-facing note, e.g. 'block destructive Jira tools for interns'"
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  }
}, {
  tableName: 'policy_rules',
  indexes: [
    { fields: ['resourceType', 'action'] },
    { fields: ['subjectType', 'subjectId'] }
  ]
});

module.exports = PolicyRule;
