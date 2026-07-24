'use strict';

async function addIndexIfMissing(queryInterface, table, fields, name) {
  const existing = await queryInterface.showIndex(table);
  if (existing.some(i => i.name === name)) return;
  await queryInterface.addIndex(table, fields, { name });
}

module.exports = {
  async up(queryInterface) {
    await addIndexIfMissing(queryInterface, 'tool_calls', ['userId', 'createdAt'], 'idx_tool_calls_userId_createdAt');
    await addIndexIfMissing(queryInterface, 'tool_calls', ['integrationId', 'success'], 'idx_tool_calls_integrationId_success');
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('tool_calls', 'idx_tool_calls_userId_createdAt');
    await queryInterface.removeIndex('tool_calls', 'idx_tool_calls_integrationId_success');
  }
};
