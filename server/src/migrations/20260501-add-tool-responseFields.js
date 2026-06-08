'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tools', 'responseFields', {
      type: Sequelize.JSON,
      defaultValue: null,
      comment: 'Array of dot-notation paths to filter response fields (null = no filtering)'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tools', 'responseFields');
  }
};
