'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tool_calls', 'callerVersion', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tool_calls', 'callerVersion');
  }
};
