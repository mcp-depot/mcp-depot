'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query(`
        UPDATE integrations
        SET config = jsonb_set(config, '{auth,type}', '"bearer"')
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
