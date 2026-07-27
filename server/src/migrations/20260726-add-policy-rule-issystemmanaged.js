'use strict';

module.exports = {
  async up(queryInterface, DataTypes) {
    const table = await queryInterface.describeTable('policy_rules');
    if (table.isSystemManaged) return;

    await queryInterface.addColumn('policy_rules', 'isSystemManaged', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('policy_rules');
    if (!table.isSystemManaged) return;
    await queryInterface.removeColumn('policy_rules', 'isSystemManaged');
  }
};
