'use strict';

// PolicyRule.subjectType gained a fourth value, 'group', alongside the
// existing user/role/*. Postgres ENUMs must be altered explicitly on
// installs that already have the type - sync({force:false}) never changes
// an existing ENUM's allowed values. The type name is looked up dynamically
// rather than hardcoded (Sequelize's default naming is
// enum_policy_rules_subjectType, but this avoids relying on that holding
// forever). SQLite (dev) doesn't enforce ENUM membership at the DB level,
// so nothing to do there.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;

    const [rows] = await sequelize.query(`
      SELECT pg_type.typname
      FROM pg_type
      JOIN pg_attribute ON pg_attribute.atttypid = pg_type.oid
      WHERE pg_attribute.attrelid = 'policy_rules'::regclass
        AND pg_attribute.attname = 'subjectType'
    `);
    if (rows.length === 0) return;

    const typeName = rows[0].typname;
    await sequelize.query(`ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS 'group'`);
  },

  async down() {
  }
};
