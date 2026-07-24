'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('integrations', 'tags', {
      type: Sequelize.JSON,
      defaultValue: []
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('integrations', 'tags');
  }
};
