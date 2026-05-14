const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'user'),
    defaultValue: 'user'
  },
  mustResetPassword: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  apiKey: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  apiKeyEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'users',
  hooks: {
    beforeSave: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 12);
      }
      if (user.changed('apiKey') && user.apiKey) {
        user.apiKey = hashApiKey(user.apiKey);
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.validateApiKey = function(candidateKey) {
  return this.apiKey === hashApiKey(candidateKey);
};

User.prototype.generateApiKey = function() {
  const key = crypto.randomBytes(32).toString('hex');
  this._rawApiKey = `mcp_${key}`;
  this.apiKey = this._rawApiKey;
  return this._rawApiKey;
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  delete values.apiKey;
  return values;
};

module.exports = User;
