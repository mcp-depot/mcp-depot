'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('tools', ['userId'], { name: 'tools_user_id' });
    await queryInterface.addIndex('tools', ['integrationId'], { name: 'tools_integration_id' });
    await queryInterface.addIndex('SessionChannel', ['channel'], { name: 'session_channel_channel' });
    await queryInterface.addIndex('SessionChannel', ['createdAt'], { name: 'session_channel_created_at' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('tools', 'tools_user_id');
    await queryInterface.removeIndex('tools', 'tools_integration_id');
    await queryInterface.removeIndex('SessionChannel', 'session_channel_channel');
    await queryInterface.removeIndex('SessionChannel', 'session_channel_created_at');
  }
};
