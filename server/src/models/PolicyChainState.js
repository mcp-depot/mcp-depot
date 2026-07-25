const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Single-row table (id is always 1) holding the tip of the policy-decision
// hash chain. Locked inside a transaction on every write so concurrent
// requests can't read the same "previous hash" and fork the chain - see
// services/policy.js.
const PolicyChainState = sequelize.define('PolicyChainState', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    defaultValue: 1
  },
  lastHash: {
    type: DataTypes.STRING(64),
    allowNull: true
  }
}, {
  tableName: 'policy_chain_state',
  timestamps: false
});

module.exports = PolicyChainState;
