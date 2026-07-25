const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Plain relational membership data, not policy rules - mirrors how
// Integration.userId is a plain column rather than something derived from
// PolicyRule. The policy engine's job is the "who bypasses normal
// membership rules" dimension (manage_others), not membership itself.
const GroupMembership = sequelize.define('GroupMembership', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'groups', key: 'id' }
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  role: {
    type: DataTypes.ENUM('member', 'admin'),
    allowNull: false,
    defaultValue: 'member',
    comment: 'Group-scoped role - an "admin" here can manage this one group\'s membership/settings, distinct from the system-wide User.role'
  },
  addedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  }
}, {
  tableName: 'group_memberships',
  indexes: [
    { fields: ['groupId', 'userId'], unique: true },
    { fields: ['userId'] }
  ]
});

module.exports = GroupMembership;
