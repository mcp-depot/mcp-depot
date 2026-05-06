const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PromptLibrary = sequelize.define('PromptLibrary', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    inputs: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    outputFormat: {
      type: DataTypes.ENUM('text', 'json', 'markdown'),
      defaultValue: 'text',
      field: 'outputformat'
    },
    isShared: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'isshared'
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    }
  }, {
    tableName: 'prompt_library'
  });

  return PromptLibrary;
};
