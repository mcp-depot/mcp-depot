'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('external_mcp_servers', 'sessionMode', {
      type: Sequelize.STRING,
      defaultValue: 'stateful',
      allowNull: false
    });
    await queryInterface.addColumn('external_mcp_servers', 'toolsHash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('external_mcp_servers', 'toolsHash');
    await queryInterface.removeColumn('external_mcp_servers', 'sessionMode');
  }
};
