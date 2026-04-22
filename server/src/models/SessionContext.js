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
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    tableName: 'SessionContext',
    timestamps: true
  });

  SessionContext.associate = (models) => {
    SessionContext.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
  };

  return SessionContext;
};
