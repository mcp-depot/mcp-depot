'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'agent_personas';

    await queryInterface.addColumn(tableName, 'tools', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: '[]'
    });

    await queryInterface.addColumn(tableName, 'model', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
  },

  async down(queryInterface) {
    const tableName = 'agent_personas';
    await queryInterface.removeColumn(tableName, 'tools');
    await queryInterface.removeColumn(tableName, 'model');
  }
};
