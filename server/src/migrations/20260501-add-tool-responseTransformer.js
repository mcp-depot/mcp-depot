'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tools', 'responseTransformer', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tools', 'responseTransformer');
  }
};
