// Rotates ENCRYPTION_KEY safely: re-encrypts every stored credential from
// the currently-active key to a new one, while the app is STILL RUNNING
// with the OLD key. Only after this completes should you update
// ENCRYPTION_KEY in your environment/secret store and restart.
//
// Running this in the wrong order (changing ENCRYPTION_KEY and restarting
// BEFORE migrating the data) is exactly the incident this tool exists to
// prevent - the app would immediately fail to decrypt every stored
// credential, because the key needed to decrypt them no longer matches what
// they were encrypted with.
//
// Usage (run inside the running server container/environment):
//   NEW_ENCRYPTION_KEY=<new-key> node scripts/rotate-encryption-key.js            (dry run - reports only)
//   NEW_ENCRYPTION_KEY=<new-key> node scripts/rotate-encryption-key.js --commit   (persists the rotation)
//
// After a successful --commit run: update ENCRYPTION_KEY to the new value
// and restart the application.

const { sequelize } = require('../src/config/database');
const { QueryTypes } = require('sequelize');
const encryption = require('../src/services/encryption'); // singleton = the CURRENTLY active key
const { EncryptionService } = require('../src/services/encryption');
const { rotateCredentialsDeep } = require('../src/services/key-rotation');

const COMMIT = process.argv.includes('--commit');

const KNOWN_DEFAULTS = [
  'mcp-secret-key-change-in-production',
  'mcp-32-byte-encryption-key!',
  'your-32-byte-encryption-key-here',
  'change-this-secret-key'
];

function mask(value) {
  if (!value) return '(empty)';
  return value.length <= 8 ? '*'.repeat(value.length) : `${value.slice(0, 3)}...${value.slice(-3)}`;
}

async function main() {
  const newKey = process.env.NEW_ENCRYPTION_KEY;
  if (!newKey) {
    console.error('FATAL: set NEW_ENCRYPTION_KEY to the key you want to rotate to.');
    process.exit(1);
  }
  if (KNOWN_DEFAULTS.includes(newKey)) {
    console.error('FATAL: NEW_ENCRYPTION_KEY must not be a known default/placeholder value.');
    process.exit(1);
  }
  if (newKey === process.env.ENCRYPTION_KEY) {
    console.error('FATAL: NEW_ENCRYPTION_KEY is identical to the currently active ENCRYPTION_KEY - nothing to rotate.');
    process.exit(1);
  }

  const newEncryptor = new EncryptionService(newKey);
  console.log(`${COMMIT ? 'COMMIT' : 'DRY RUN'} - rotating stored credentials to new key (${mask(newKey)})\n`);

  await sequelize.authenticate();

  let totalRowsChanged = 0, totalRotated = 0, totalFailed = 0;

  const integrations = await sequelize.query(
    `SELECT id, name, config FROM integrations WHERE config->'auth'->'credentials' IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  for (const row of integrations) {
    const result = rotateCredentialsDeep(row.config.auth.credentials, encryption, newEncryptor);
    totalRotated += result.rotatedCount;
    totalFailed += result.failedCount;
    if (result.rotatedCount > 0) {
      totalRowsChanged++;
      const status = result.failedCount ? `${result.failedCount} FAILED to decrypt` : 'ok';
      console.log(`  [integration] ${row.name} - ${result.rotatedCount} field(s) rotated (${status})`);
      if (COMMIT) {
        const newConfig = { ...row.config, auth: { ...row.config.auth, credentials: result.value } };
        await sequelize.query(
          `UPDATE integrations SET config = :config::jsonb, "updatedAt" = now() WHERE id = :id`,
          { replacements: { config: JSON.stringify(newConfig), id: row.id } }
        );
      }
    }
  }

  const userCreds = await sequelize.query(
    `SELECT id, credentials FROM user_integration_credentials WHERE credentials IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  for (const row of userCreds) {
    const result = rotateCredentialsDeep(row.credentials, encryption, newEncryptor);
    totalRotated += result.rotatedCount;
    totalFailed += result.failedCount;
    if (result.rotatedCount > 0) {
      totalRowsChanged++;
      const status = result.failedCount ? `${result.failedCount} FAILED to decrypt` : 'ok';
      console.log(`  [user-credentials] ${row.id} - ${result.rotatedCount} field(s) rotated (${status})`);
      if (COMMIT) {
        await sequelize.query(
          `UPDATE user_integration_credentials SET credentials = :credentials::jsonb, "updatedAt" = now() WHERE id = :id`,
          { replacements: { credentials: JSON.stringify(result.value), id: row.id } }
        );
      }
    }
  }

  const servers = await sequelize.query(
    `SELECT id, name, "authToken" FROM external_mcp_servers WHERE "authToken" IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  for (const row of servers) {
    const result = rotateCredentialsDeep(row.authToken, encryption, newEncryptor);
    totalRotated += result.rotatedCount;
    totalFailed += result.failedCount;
    if (result.rotatedCount > 0) {
      totalRowsChanged++;
      const status = result.failedCount ? 'FAILED to decrypt' : 'ok';
      console.log(`  [external-mcp-server] ${row.name} - token rotated (${status})`);
      if (COMMIT) {
        await sequelize.query(
          `UPDATE external_mcp_servers SET "authToken" = :token, "updatedAt" = now() WHERE id = :id`,
          { replacements: { token: result.value, id: row.id } }
        );
      }
    }
  }

  console.log(`\n${COMMIT ? 'Committed' : 'Dry run'} complete. rows-changed=${totalRowsChanged} fields-rotated=${totalRotated} fields-failed=${totalFailed}`);

  if (totalFailed > 0) {
    console.error('\nOne or more fields failed to decrypt with the current key - nothing involving them was changed. Investigate before retrying.');
  } else if (COMMIT && totalRowsChanged > 0) {
    console.log('\nNext steps:');
    console.log('  1. Update ENCRYPTION_KEY in your environment/secret store to the new value.');
    console.log('  2. Restart the application - it will now decrypt everything correctly under the new key.');
  } else if (!COMMIT) {
    console.log('\nThis was a dry run - nothing was written. Re-run with --commit to persist.');
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
