'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('prompt_library', ['userId'], { name: 'idx_pl_userId' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('prompt_library', 'idx_pl_userId');
  }
};
