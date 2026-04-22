const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SessionChannel = sequelize.define('SessionChannel', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    channel: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'SessionChannel',
    timestamps: true,
    updatedAt: false
  });

  return SessionChannel;
};