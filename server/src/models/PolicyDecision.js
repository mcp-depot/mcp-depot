const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Append-only, tamper-evident record of every policy decision (allow/deny),
// written before the protected action executes - see services/policy.js for
// the hash-chain writer and scripts/verify-policy-chain.js for the verifier.
// updatedAt is disabled deliberately: these records must never be mutated.
const PolicyDecision = sequelize.define('PolicyDecision', {
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
  resourceType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  resourceId: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  action: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  decision: {
    type: DataTypes.ENUM('allow', 'deny'),
    allowNull: false
  },
  matchedRuleId: {
    type: DataTypes.UUID,
    allowNull: true,
    // Deliberately NOT a real foreign key (no `references`) - this is a
    // hash-chained, immutable record, and a rule an admin later deletes must
    // not retroactively change what's already been written and hashed here.
    // An enforced FK with Sequelize's default ON DELETE SET NULL did exactly
    // that: deleting a PolicyRule silently nulled matchedRuleId on every
    // PolicyDecision that had referenced it, breaking that record's hash and
    // making ordinary rule cleanup indistinguishable from tampering. See
    // migrations/20260725-drop-policy-decisions-matchedrule-fk.js for the
    // matching fix on installs that already have the old constraint.
    comment: 'Null when no rule matched and the default (allow) applied. Soft reference only - the referenced rule may no longer exist.'
  },
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  requestContext: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    comment: 'Small sanitized context only - never full request body or credentials'
  },
  previousHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: "Prior record's hash in the chain; null only for the very first record ever written"
  },
  recordHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'HMAC-SHA256(POLICY_SIGNING_KEY, previousHash + canonical(this record)) - see services/policy.js'
  }
}, {
  tableName: 'policy_decisions',
  updatedAt: false,
  indexes: [
    { fields: ['userId', 'createdAt'] },
    { fields: ['resourceType', 'resourceId'] },
    { fields: ['decision'] }
  ]
});

module.exports = PolicyDecision;
