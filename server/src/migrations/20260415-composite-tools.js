module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tools', 'type', {
      type: Sequelize.STRING(20),
      defaultValue: 'simple',
      comment: "Tool type: 'simple' or 'composite'"
    });
    
    await queryInterface.addColumn('tools', 'steps', {
      type: Sequelize.JSONB,
      defaultValue: null,
      comment: 'Composite tool steps array'
    });
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('tools', 'type');
    await queryInterface.removeColumn('tools', 'steps');
  }
};
