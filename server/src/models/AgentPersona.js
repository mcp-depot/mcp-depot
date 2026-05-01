const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AgentPersona = sequelize.define('AgentPersona', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    systemPrompt: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    isShared: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    }
  }, {
    tableName: 'agent_personas'
  });

  return AgentPersona;
};
