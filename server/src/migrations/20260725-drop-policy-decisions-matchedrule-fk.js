'use strict';

// PolicyDecision.matchedRuleId used to be a real FK to policy_rules with
// Sequelize's default ON DELETE SET NULL. That meant deleting a PolicyRule
// silently nulled matchedRuleId on every historical PolicyDecision that had
// referenced it - breaking that record's hash in the tamper-evident chain
// through ordinary rule cleanup, not tampering. The model no longer declares
// this as a real FK (see models/PolicyDecision.js); this drops the
// constraint on installs that already have it from before that fix. Guarded
// by an existence check since a fresh install's sync() never creates this
// constraint in the first place.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;

    const [rows] = await sequelize.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'policy_decisions'::regclass
        AND contype = 'f'
        AND conname = 'policy_decisions_matchedRuleId_fkey'
    `);
    if (rows.length > 0) {
      await queryInterface.removeConstraint('policy_decisions', 'policy_decisions_matchedRuleId_fkey');
    }
  },

  async down() {
  }
};
