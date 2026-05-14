const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Agent = sequelize.define('Agent', {
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
    tools: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]'
    },
    model: {
      type: DataTypes.STRING(100),
      allowNull: true
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

  return Agent;
};
