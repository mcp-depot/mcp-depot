const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SessionContext = sequelize.define('SessionContext', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    isShared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'SessionContext',
    timestamps: true
  });

  return SessionContext;
};
