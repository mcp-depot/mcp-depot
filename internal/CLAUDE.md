# MCP Depot Development

## After Fix - Rebuild Docker

⚠️ **IMPORTANT:** After applying ANY fix, rebuild WITHOUT cache and restart ALL containers:

```bash
# First attempt - may fail with cache integrity error on Python packages
docker-compose build --no-cache && docker-compose down && docker-compose up -d

# If first attempt fails, retry with regular build
docker-compose build && docker-compose up -d
```

## After Fix - Commit

- Do NOT upgrade package version
- Commit message format: `Fix: Issue N - brief description`

## Database Migrations

Every time a Sequelize model changes (new column, new table, index, etc), create a migration file:

1. **Location:** `server/src/migrations/`
2. **Naming:** `YYYYMMDD-descriptive-name.js` (sorted alphabetically, runs in order)
3. **Format:** Standard Sequelize migration with `up()` and `down()`:

```js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // e.g. add column
    await queryInterface.addColumn('tableName', 'columnName', {
      type: Sequelize.STRING(100),
      allowNull: true,
      defaultValue: null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tableName', 'columnName');
  }
};
```

4. **Runner:** `server/src/migrations/runner.js` auto-runs all migrations on startup, tracks executed ones in a `migrations` table, and safely skips already-applied migrations.
5. **Do NOT** add raw `ALTER TABLE` in `database.js` — always use the migrations directory.

## Common Issues

- Session context TTL issues: Check both `server/src/routes/mcp.js` AND `server/src/routes/session-context.js`
- UI issues: Check both React component AND CSS in `client/src/index.css`
- Always verify with git log that previous commits are correct
