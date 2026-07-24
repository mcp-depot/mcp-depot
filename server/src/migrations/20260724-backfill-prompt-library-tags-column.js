'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('prompt_library', 'tags', {
      type: Sequelize.JSON,
      defaultValue: []
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('prompt_library', 'tags');
  }
};
