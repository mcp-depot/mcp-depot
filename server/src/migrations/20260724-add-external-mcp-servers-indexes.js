'use strict';

async function addIndexIfMissing(queryInterface, table, fields, name) {
  const existing = await queryInterface.showIndex(table);
  if (existing.some(i => i.name === name)) return;
  await queryInterface.addIndex(table, fields, { name });
}

module.exports = {
  async up(queryInterface) {
    await addIndexIfMissing(queryInterface, 'external_mcp_servers', ['userId'], 'idx_ems_userId');
    await addIndexIfMissing(queryInterface, 'external_mcp_servers', ['isActive'], 'idx_ems_isActive');
    await addIndexIfMissing(queryInterface, 'external_mcp_servers', ['userId', 'isActive'], 'idx_ems_userId_isActive');
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('external_mcp_servers', 'idx_ems_userId');
    await queryInterface.removeIndex('external_mcp_servers', 'idx_ems_isActive');
    await queryInterface.removeIndex('external_mcp_servers', 'idx_ems_userId_isActive');
  }
};
