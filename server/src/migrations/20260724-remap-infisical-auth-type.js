'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() === 'postgres') {
      // config may be stored as either json or jsonb depending on when the
      // install was created (only tags/inputs/value were ever migrated to
      // jsonb - see 20260508-normalise-json-columns-to-jsonb.js). Casting to
      // jsonb for jsonb_set and back to json for the assignment works for
      // both column types.
      await sequelize.query(`
        UPDATE integrations
        SET config = (jsonb_set(config::jsonb, '{auth,type}', '"bearer"'))::json
        WHERE config->'auth'->>'type' = 'infisical'
      `);
    } else {
      await sequelize.query(`
        UPDATE integrations
        SET config = JSON_SET(config, '$.auth.type', 'bearer')
        WHERE JSON_EXTRACT(config, '$.auth.type') = 'infisical'
      `);
    }
  },

  async down() {
  }
};
