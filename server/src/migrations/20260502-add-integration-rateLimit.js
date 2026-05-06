'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('integrations', 'rateLimit', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: { requestsPerMinute: 0, requestsPerHour: 0 }
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('integrations', 'rateLimit');
  }
};
