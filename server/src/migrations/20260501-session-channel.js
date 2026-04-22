'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SessionChannel', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      channel: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      createdBy: {
        type: Sequelize.UUID,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('SessionChannel', ['channel', 'createdAt'], {
      name: 'idx_session_channel_channel_created'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SessionChannel');
  }
};