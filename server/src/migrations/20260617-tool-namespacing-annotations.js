'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('integrations', 'slug', {
      type: Sequelize.STRING(32),
      allowNull: true,
      comment: 'URL-friendly identifier used for tool name namespacing'
    });

    await queryInterface.addIndex('integrations', ['userId', 'slug'], {
      name: 'integrations_user_id_slug',
      unique: true,
      where: { slug: { [Sequelize.Op.ne]: null } }
    });

    await queryInterface.addColumn('tools', 'exposedName', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: 'MCP-exposed tool name: {integration.slug}_{tool.name}, truncated to 64 chars'
    });

    await queryInterface.addColumn('tools', 'title', {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment: 'Human-readable display name for the tool'
    });

    await queryInterface.addColumn('tools', 'readOnlyHint', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Tool has no side effects - safe to auto-approve'
    });

    await queryInterface.addColumn('tools', 'destructiveHint', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Tool may delete or irreversibly modify data'
    });

    await queryInterface.addColumn('tools', 'idempotentHint', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Repeated calls with same params produce same result'
    });

    await queryInterface.addColumn('tools', 'openWorldHint', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Tool interacts with external systems'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('integrations', 'integrations_user_id_slug');
    await queryInterface.removeColumn('integrations', 'slug');
    await queryInterface.removeColumn('tools', 'exposedName');
    await queryInterface.removeColumn('tools', 'title');
    await queryInterface.removeColumn('tools', 'readOnlyHint');
    await queryInterface.removeColumn('tools', 'destructiveHint');
    await queryInterface.removeColumn('tools', 'idempotentHint');
    await queryInterface.removeColumn('tools', 'openWorldHint');
  }
};
