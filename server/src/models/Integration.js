const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Integration = sequelize.define('Integration', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'custom'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.STRING
  },
  config: {
    type: DataTypes.JSON,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  visibility: {
    type: DataTypes.STRING(10),
    defaultValue: 'private'
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  rateLimit: {
    type: DataTypes.JSON,
    defaultValue: { requestsPerMinute: 0, requestsPerHour: 0 },
    comment: 'Integration-level rate limits: { requestsPerMinute, requestsPerHour }, 0 = unlimited'
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  slug: {
    type: DataTypes.STRING(32),
    allowNull: true,
    comment: 'URL-friendly identifier used for tool name namespacing'
  }
}, {
  tableName: 'integrations',
  hooks: {
    beforeSave: encryptCredentialsIfChanged,
    afterFind: decryptCredentialsAfterFind
  }
});

// Extracted (rather than left as inline hook closures) so they can be unit
// tested directly with plain mock objects, with no DB/Sequelize instance
// needed. This exact logic caused a real incident: beforeSave used to
// re-encrypt unconditionally, stacking a second layer on top of whatever the
// route layer had already encrypted, silently corrupting stored credentials
// over repeated saves.
function encryptCredentialsIfChanged(integration) {
  if (!integration.changed('config') || !integration.config?.auth?.credentials) return;
  const encryption = require('../services/encryption');
  const secretStore = require('../services/secret-store');
  const config = JSON.parse(JSON.stringify(integration.config));
  const credentials = config.auth.credentials;
  // Guard against double-encryption: only encrypt fields that aren't
  // already ciphertext and aren't an external secret-store reference.
  // Route handlers may have already encrypted a field before calling
  // save/update - encrypting it again here would make it undecryptable.
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === 'string' && value && !encryption.isEncrypted(value) && !secretStore.isSecretRef(value)) {
      credentials[key] = encryption.encrypt(value);
    }
  }
  integration.config = config;
}

function decryptCredentialsAfterFind(result) {
  const encryption = require('../services/encryption');
  const instances = Array.isArray(result) ? result : [result];
  for (const i of instances.filter(Boolean)) {
    if (i?.config?.auth?.credentials) {
      i.config = { ...i.config, auth: { ...i.config.auth,
        credentials: encryption.decryptObject(i.config.auth.credentials) } };
    }
  }
}

Integration.encryptCredentialsIfChanged = encryptCredentialsIfChanged;
Integration.decryptCredentialsAfterFind = decryptCredentialsAfterFind;

module.exports = Integration;
