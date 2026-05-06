'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('external_mcp_tools', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      externalMcpServerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'external_mcp_servers', key: 'id' }
      },
      toolName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      namespacedName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      inputSchema: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      lastSeenAt: {
        type: Sequelize.DATE
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addConstraint('external_mcp_tools', {
      type: 'unique',
      fields: ['externalMcpServerId', 'toolName']
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('external_mcp_tools');
  }
};
