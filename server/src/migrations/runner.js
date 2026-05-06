const path = require('path');
const fs = require('fs');
const logger = require('../services/logger');

async function runMigrations(sequelize) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const executed = await sequelize.query(
    'SELECT name FROM migrations',
    { type: sequelize.QueryTypes.SELECT }
  );
  const executedNames = new Set(executed.map(r => r.name));

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js') && !f.startsWith('.') && f !== 'runner.js')
    .sort();

  for (const file of files) {
    if (executedNames.has(file)) continue;

    try {
      const migration = require(path.join(migrationsDir, file));
      const Sequelize = require('sequelize');
      const queryInterface = sequelize.getQueryInterface();

      await migration.up(queryInterface, Sequelize.DataTypes);

      await sequelize.query(
        'INSERT INTO migrations (name) VALUES (:name)',
        { replacements: { name: file } }
      );
      logger.info({ migration: file }, 'Migration executed');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('already exist') || error.message.includes('duplicate column name')) {
        await sequelize.query(
          'INSERT OR IGNORE INTO migrations (name) VALUES (:name)',
          { replacements: { name: file } }
        );
        logger.info({ migration: file }, 'Migration skipped (already applied)');
      } else {
        logger.fatal({ migration: file, err: error.message }, 'Migration failed');
        process.exit(1);
      }
    }
  }
}

module.exports = { runMigrations };
