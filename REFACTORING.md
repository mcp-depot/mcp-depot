# MCPConnect — Refactoring Log

> **Review process (updated 2026-04-06):**
> Past review rounds have been collapsed into the commit table below — the full back-and-forth is in git history.
> Going forward: push your commit, then tell the reviewer the hash. The reviewer will run `git diff <prev>..<new>` and write a focused comment block — no full-file re-reads, no token waste.
>
> **Before every commit — local checklist:**
> ```
> # 1. Install deps if changed
> cd server && npm install
> cd ../client && npm install
>
> # 2. Run tests
> cd ../server && npm test
>
> # 3. Start the app and do a quick smoke test
> docker-compose up -d        # or: npm run dev in server/ and client/
> # - Can you log in?
> # - Can you add an integration and a tool?
> # - Does the MCP endpoint respond? curl http://localhost:3000/health
>
> # 4. Check for lint errors (if eslint is configured)
> npm run lint
> ```
> A commit that breaks the app locally will break it for every user who clones the repo. CI catches tests but not runtime startup errors — only a local run catches those.
>
> **⚠️ NEVER run `docker-compose down -v` — the `-v` flag deletes all volumes and permanently destroys all data (integrations, tools, credentials, history). There is no recovery.**
> - To restart services: `docker-compose restart`
> - To recreate containers only: `docker-compose down` then `docker-compose up -d` (no `-v`)
> - If you must wipe volumes: run the backup command first:
>   `docker exec mcpconnect-postgres pg_dump -U admin mcpconnect > mcpconnect_backup.sql`
>
> **Developer action needed — two items before public release:**
> - ✅ stdio-mcp.js tech debt done
> - ✅ Lucide icons added
> - ✅ README.md written with quickstart
> 1. **🔴 Fix role escalation in `auth.js`** — anyone can self-assign admin via `POST /auth/register`. Remove `role` from register schema.
> 2. **Add `ALLOW_REGISTRATION` env flag** — lets admins disable open registration for public-facing deployments.
>
> After these two: ready for GitHub public release.

---

## Developer Action — MCP tool calls not logged to monitoring (Issue 16)

**Problem:** Tool calls made via Claude Code (MCP path) are never recorded in the `tool_calls` table. The monitoring page stays empty even after many tool calls. Only REST calls via `consume.js` are logged.

**Root cause:** `server/src/mcp/server.js` `executeTool()` only calls `recordToolCall()` (Prometheus metrics) but never calls `logToolCall()` from `tool-logger.js`.

**Fix — add `logToolCall` to `mcp/server.js` `executeTool()`:**

```js
const { logToolCall } = require('../services/tool-logger');

// In executeTool(), after the API call completes:
const startTime = Date.now();
let success = true;
let responseStatus = null;
let result;

try {
  result = await adapter.execute(...);
  responseStatus = 200;
} catch (err) {
  success = false;
  responseStatus = err.response?.status || 500;
  throw err;
} finally {
  await logToolCall({
    toolId: tool.id,
    userId: tool.userId,
    integrationId: integration.id,
    callerId: clientId || null,
    callerType: 'mcp',
    method: tool.endpoint.method,
    path: tool.endpoint.path,
    responseStatus,
    responseTime: Date.now() - startTime,
    success,
  });
}
```

---

## Monitoring Page — Investigation Result (2026-04-08)

**Finding:** The monitoring API is working correctly. Both `/api/monitoring/stats` and `/api/monitoring/history` return valid responses with zero data — because the database was freshly wiped. This is expected, not a bug.

**Why it looks "broken":** The page shows "No calls recorded yet" and all stats at 0 because there is no tool call history. Once tools are exercised (via Claude Code or REST), data will appear.

**One genuine issue found:** If the user's session token expires while on the monitoring page, `fetchStats()` fails silently — `stats` stays `null` and the page shows "Unable to load monitoring data" with no explanation. The fix is to check for 401 in the catch block and redirect to login:

```js
// In fetchStats() and fetchHistory() catch blocks:
catch (err) {
  if (err.response?.status === 401) {
    window.location.href = '/login';
    return;
  }
  console.error('Failed to fetch stats:', err);
}
```

**Also noticed:** `demo@mcpconnect.io` exists in the DB despite `SEED_DEMO_DATA` not being set. This user registered via the open registration endpoint — confirms the role escalation bug (Issue 1 in the pre-release checklist) is still unfixed. Anyone can register an account.

---

## Open Review — commits `82a6c0f` → `2fadc80` (MCP logging, monitoring, Infisical UI, secret ref fix)

**Reviewer** *(2026-04-08)*: Four commits, many things fixed correctly. One new bug blocking Infisical - wrong API version.

| # | Severity | File | Issue | Status |
|---|---|---|---|---|
| 16 | ✅ | `mcp/server.js` | MCP tool calls now logged to `tool_calls` table | ✅ FIXED |
| 15 | ✅ | `routes/integrations.js` | Infisical refs skipped before encryption (POST + PUT) | ✅ FIXED |
| Auth 401 | ✅ | `Monitoring.jsx` | 401 response redirects to login | ✅ FIXED |
| Theme | ✅ | Multiple files | Hardcoded `#eee`/`#f5f5f5` colours replaced with CSS vars | ✅ FIXED |
| Schema | ✅ | `integrations.js` | `infisical` added as valid auth type in Joi schema | ✅ FIXED |
| UI | ✅ | `Integrations.jsx` | Infisical Secret option in auth type dropdown, secret ref input | ✅ FIXED |
| I | ✅ | `secret-store.js` | Wrong API endpoint — now uses `/api/v3/secrets/raw` v3 API | ✅ FIXED `53bb3ae` |
| II | ✅ | `mcp/server.js` | No double logging — catch logs only on error, finally logs only on success (guarded by `if (success)`) | ✅ Already correct |

---

### Issue I — Wrong Infisical API endpoint ✅ FIXED `53bb3ae`

Fixed — now uses `/api/v3/secrets/raw/{secretName}` with correct `workspaceId` param and `data.secret?.secretValue` response path.

---

### Developer Action — Switch to official Infisical SDK (security + maintainability)

The current implementation uses raw `fetch()` against the Infisical REST API. This works but has two weaknesses:

**Security:** `/api/v3/secrets/raw` returns **plaintext secret values** that travel over the network. For self-hosted Infisical on the Docker internal network (`http://mcpconnect-infisical:8080`), this is plain HTTP - secrets flow unencrypted over the Docker bridge. The official SDK uses **E2EE** - secrets are decrypted client-side, so only the encrypted blob ever crosses the wire. MITM or a compromised network segment cannot read the secret values.

**Maintainability:** Manual token acquisition, expiry tracking, and API version management. The SDK handles all of this automatically and absorbs future API changes.

**Fix — replace raw fetch with `@infisical/sdk`:**

```bash
cd server && npm install @infisical/sdk
```

Rewrite `server/src/services/secret-store.js`:

```js
const { InfisicalSDK } = require('@infisical/sdk');
const logger = require('./logger');

let client = null;
let config = null;
let initialized = false;

async function init(options) {
  if (!options?.enabled) { initialized = false; client = null; return; }

  config = {
    siteUrl: options.siteUrl,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    workspaceId: options.workspaceId,
    environment: options.environment || 'dev'
  };

  try {
    client = new InfisicalSDK({ siteUrl: config.siteUrl });
    await client.auth().universalAuth.login({
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });
    initialized = true;
    logger.info({ siteUrl: config.siteUrl }, 'Secret store initialized (Infisical SDK)');
  } catch (error) {
    initialized = false; client = null;
    logger.error({ err: error.message }, 'Failed to initialize secret store');
    throw error;
  }
}

async function resolveSecret(secretRef) {
  if (!isSecretRef(secretRef)) return secretRef;
  if (!initialized || !client) {
    logger.warn({ secretRef }, 'Secret store not initialized');
    return null;
  }

  const path = secretRef.replace('infisical://', '');
  const parts = path.split('/');
  let env, folderPath, secretName;
  if (parts.length >= 3) {
    env = parts[0]; folderPath = '/' + parts.slice(1, -1).join('/'); secretName = parts[parts.length - 1];
  } else if (parts.length === 2) {
    env = parts[0]; folderPath = '/'; secretName = parts[1];
  } else {
    logger.error({ secretRef }, 'Invalid secret ref format'); return null;
  }

  try {
    const secret = await client.secrets().getSecret({
      projectId: config.workspaceId,
      environment: env,
      secretName,
      secretPath: folderPath
    });
    return secret.secretValue || null;
  } catch (error) {
    logger.error({ err: error.message, secretRef }, 'Failed to resolve secret');
    return null;
  }
}

function isSecretRef(value) { return typeof value === 'string' && value.startsWith('infisical://'); }
function isInitialized() { return initialized; }
function getConfig() { return config; }

module.exports = { init, resolveSecret, isSecretRef, isInitialized, getConfig };
```

Benefits over raw fetch:
- SDK handles token acquisition and refresh automatically - removes `authenticate()`, `getAccessToken()`, `tokenExpiry` tracking entirely
- E2EE: secrets decrypted client-side, plaintext never on the wire
- Future Infisical API changes handled by `npm update`, not code changes
- ~60 lines vs ~130 lines

---

### Issue II — Double logging on successful MCP tool calls (`mcp/server.js`)

```js
} catch (error) {
  success = false;
  // ...
  await logToolCall({ success: false, ... });  // ← logs on error
  throw error;
} finally {
  if (success) {
    await logToolCall({ success: true, ... });  // ← logs on success
  }
}
```

This logic is correct - error path logs in `catch`, success path logs in `finally`. No double-logging for errors. Good.

**But:** if `logToolCall` in the `catch` block throws (e.g. DB error), the `finally` block still runs and tries to log again with `success = false` (since the variable was set in `catch`). This would cause a second DB write attempt. Minor and unlikely, but cleaner to use a flag:

```js
let logged = false;
} catch (error) {
  success = false;
  await logToolCall({ success: false, ... });
  logged = true;
  throw error;
} finally {
  if (!logged) {
    await logToolCall({ success: true, ... });
  }
}
```

---

## Developer Action — Infisical modelled as auth type is a design flaw (Issue 17)

**Problem:** "Infisical Secret" is offered as an option in the auth type dropdown alongside "Bearer Token", "Basic Auth", "API Key". This is conceptually wrong and causes bugs.

**Why it's wrong:** Infisical is a **secret provider** — it describes *where* a credential value comes from, not *how* authentication works. The target API still uses Bearer / Basic / API Key. These two concerns are independent:

| Auth protocol | Secret source |
|---|---|
| Bearer Token | Plain text value |
| Bearer Token | `infisical://dev/JIRA_TOKEN` |
| Basic Auth | Plain text username + password |
| Basic Auth | username plain + `infisical://dev/JIRA_PASSWORD` |
| API Key | `infisical://dev/GITHUB_KEY` |

Selecting "Infisical" as auth type means the adapter never knows whether to send `Authorization: Bearer`, `Authorization: Basic`, or a custom header — it hits `default: return {}` and sends nothing. This is why tool calls return 401.

**Correct design — Infisical as a field-level value, not an auth type:**

1. **Remove** `infisical` from the auth type dropdown entirely (UI and Joi schema)
2. Keep auth type as Bearer / Basic / API Key (the protocol)
3. For each credential input field, show a hint that Infisical refs are accepted as values:
   - Token field placeholder: `paste token or infisical://env/SECRET_NAME`
   - Password field placeholder: `paste password or infisical://env/SECRET_NAME`
4. No new auth type needed — the backend `isSecretRef()` already checks field values, not the auth type

**Changes required:**

**`client/src/pages/Integrations.jsx`** — remove `infisical` option from both auth type dropdowns; add placeholder hint to token/password/apiKey fields:
```jsx
// Remove from options:
{ value: 'infisical', label: 'Infisical Secret' }

// Add placeholder to Bearer token input:
placeholder="Paste token or infisical://dev/SECRET_NAME"

// Add placeholder to Basic auth password input:
placeholder="Paste password or infisical://dev/SECRET_NAME"

// Add placeholder to API Key value input:
placeholder="Paste key or infisical://dev/SECRET_NAME"
```

**`server/src/routes/integrations.js`** — remove `'infisical'` from Joi schema valid values:
```js
type: Joi.string().valid('none', 'basic', 'bearer', 'apiKey', 'oauth2').default('none')
// remove 'infisical'
```

**No changes needed to:**
- `DynamicAdapter.js` — already handles bearer/basic/apiKey correctly
- `consume.js` secret resolution — already checks field values with `isSecretRef()`
- `mcp/server.js` secret resolution — same

**Migration for existing integrations saved with `type: 'infisical'`:**

Add a one-time migration in `connectDB()` to remap any stored `auth.type = 'infisical'` to `auth.type = 'bearer'` (since Infisical was only wired to the token field):

```js
// In database.js connectDB(), after sync:
await sequelize.query(`
  UPDATE integrations
  SET config = jsonb_set(config, '{auth,type}', '"bearer"')
  WHERE config->'auth'->>'type' = 'infisical'
`);
```

---

## Open Review — commit `2fb68aa` (remove admin123 default, fix mustResetPassword path)

**Reviewer** *(2026-04-07)*: Both issues from previous round fixed correctly. Clean commit.

| # | Severity | File | Issue | Status |
|---|---|---|---|---|
| G | ✅ | `docker-compose.yml` | `ADMIN_PASSWORD:-admin123` default removed | ✅ FIXED |
| H | ✅ | `auth.js` | Path corrected to `/api/v1/auth/change-password` in both middleware functions | ✅ FIXED |

---

## Developer Action — Infisical secret refs are encrypted on save (Issue 15)

**Problem:** When a credential field is set to `infisical://prod/JIRA_TOKEN`, the encryption logic in `routes/integrations.js` treats it as a plain credential and encrypts it. The `infisical://` prefix is destroyed. When `secret-store.js` calls `isSecretRef(value)` it checks `value.startsWith('infisical://')` — now false — so the encrypted blob is sent as the actual token. Secret is never resolved. Affects both POST (create) and PUT (update) routes.

**Fix — add `isSecretRef` guard in both routes (`server/src/routes/integrations.js`):**

```js
// Add at top of file (or import from secret-store.js):
const secretStore = require('../services/secret-store');

// POST route (~line 159) and PUT route (~line 229) — same fix in both:
if (credentials.token && !credentials.token.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.token)) {
  credentials.token = encryption.encrypt(credentials.token);
}
if (credentials.username && !credentials.username.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.username)) {
  credentials.username = encryption.encrypt(credentials.username);
}
if (credentials.apiKey && !credentials.apiKey.startsWith('U2FsdGVk') && !secretStore.isSecretRef(credentials.apiKey)) {
  credentials.apiKey = encryption.encrypt(credentials.apiKey);
}
```

---

## Open Review — commit `5260100` (production-readiness fixes)

**Reviewer** *(2026-04-07)*: Issues A, B, C, D, F all addressed. Two new bugs introduced.

| # | Severity | File | Issue | Status |
|---|---|---|---|---|
| A | ✅ | `database.js` | `sync({ force: false })` in production — fresh install works | ✅ FIXED |
| B | ✅ | `database.js` | Demo tools gated behind `SEED_DEMO_DATA=true` env flag | ✅ FIXED |
| C | ✅ | `database.js` | Admin email/password reads from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars | ✅ FIXED |
| D | ✅ | `database.js` | Retry logic with 5 attempts and 3s delay | ✅ FIXED |
| F | ✅ | `auth.js` | `mustResetPassword` enforced in both `auth` and `authWithApiKey` middleware | ✅ FIXED |
| G | ✅ | `docker-compose.yml` | Removed `ADMIN_PASSWORD` default — now auto-generates when unset | ✅ FIXED `2fb68aa` |
| H | ✅ | `auth.js` | Fixed path to `/change-password` — password reset now works | ✅ FIXED `2fb68aa` |

---

### Issue G — Hardcoded `admin123` default in `docker-compose.yml`

```yaml
# Current — WRONG
- ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
```

Two problems:
1. Every installation that doesn't set `ADMIN_PASSWORD` gets `admin123` as the admin password
2. Because `ADMIN_PASSWORD` is now set (to `admin123`), `mustResetPassword` is `false` — the user is never prompted to change it

This is **worse than before** the fix. Before: random password printed to logs, `mustResetPassword: true`. Now: well-known default password, no reset prompt.

**Fix:** Remove the default entirely — let `ADMIN_PASSWORD` be unset so `database.js` auto-generates a random password:

```yaml
# Correct — no default, auto-generates random password when unset
- ADMIN_EMAIL=${ADMIN_EMAIL:-admin@mcpconnect.io}
- ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
```

Or simply omit `ADMIN_PASSWORD` from `docker-compose.yml` env entirely — if it's not set in `.env`, `process.env.ADMIN_PASSWORD` will be `undefined` and `generatePassword()` runs as intended.

---

### Issue H — `mustResetPassword` check uses wrong path

In `server/src/middleware/auth.js`:
```js
// Current — wrong path
req.path !== '/api/v1/auth/password' && req.path !== '/api/auth/password'
```

The actual change-password route in `server/src/routes/auth.js` is:
```js
router.post('/change-password', ...)  // mounts at /api/v1/auth/change-password
```

So the guard path `/api/v1/auth/password` never matches — the change-password endpoint is **also blocked** when `mustResetPassword` is `true`. The user cannot change their password at all.

**Fix:**
```js
req.path !== '/api/v1/auth/change-password'
```

Also consider including `/api/v1/auth/logout` so the user can at least log out:
```js
const ALLOWED_PATHS = ['/api/v1/auth/change-password', '/api/v1/auth/logout'];
if (user.mustResetPassword && !ALLOWED_PATHS.includes(req.path)) {
  return res.status(403).json({ error: 'PASSWORD_RESET_REQUIRED', message: 'You must change your password before continuing' });
}
```

---

## Developer Action — Production-readiness: `server/src/config/database.js`

`database.js` has several issues that make it look like a demo project rather than a production-ready self-hosted app. Six items to fix before public release.

---

### Issue A — `sequelize.sync()` skipped in production (BLOCKER)

Tables created via Sequelize models (`users`, `integrations`, `tools`) are never created in production mode. Fresh install = instant crash.

**Fix:** Use `sync({ force: false })` in production — creates tables only if missing, never alters or drops:

```js
if (IS_DEV) {
  await sequelize.sync({ alter: true });
} else {
  await sequelize.sync({ force: false }); // CREATE TABLE IF NOT EXISTS — safe on live data
}
```

---

### Issue B — Demo tools seeded on every startup (remove or gate behind env flag)

`createDefaultTool()` runs unconditionally on every startup. It seeds demo integrations and tools pointing to `http://localhost:3000` for a `demo@mcpconnect.io` user. Problems:

- `demo@mcpconnect.io` is never created — this code silently does nothing, but it still runs a DB query on every boot
- If the demo user did exist, the seeded integration uses `http://localhost:3000` which is wrong inside Docker
- Real users don't want demo junk cluttering their installation

**Fix — remove `createDefaultTool()` entirely**, or gate it behind an env flag:

```js
// Only seed demo data if explicitly requested (e.g. for development/demos)
if (process.env.SEED_DEMO_DATA === 'true') {
  await createDefaultTool();
}
```

Remove the call to `createDefaultTool()` at line 391. The function itself can stay for now, just don't call it unconditionally.

---

### Issue C — Admin email hardcoded to `admin@mcpconnect.io`

Every MCPConnect installation in the world will have the same admin email. This is a security risk (email enumeration) and awkward for users who want their own email.

**Fix — read from env var with fallback:**

```js
// In createDefaultUser():
const adminEmail = process.env.ADMIN_EMAIL || 'admin@mcpconnect.io';
const adminExists = await User.findOne({ where: { email: adminEmail } });

if (!adminExists) {
  const defaultPassword = process.env.ADMIN_PASSWORD || generatePassword();
  await User.create({
    email: adminEmail,
    password: defaultPassword,
    name: 'Administrator',
    role: 'admin',
    mustResetPassword: !process.env.ADMIN_PASSWORD // only force reset if password was auto-generated
  });
  ...
}
```

Add to `.env.example`:
```bash
# Initial admin account (created on first start if not exists)
ADMIN_EMAIL=admin@mcpconnect.io
ADMIN_PASSWORD=          # leave blank to auto-generate a random password (printed to logs)
```

---

### Issue D — `process.exit(1)` on any DB error, no retry

If PostgreSQL is slow to start, the server crashes permanently instead of retrying. Docker restarts the container, but this causes a crash loop during startup.

**Fix — add retry logic:**

```js
const connectDB = async (retries = 5, delay = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate();
      // ... rest of setup
      return;
    } catch (error) {
      if (attempt === retries) {
        logger.fatal({ err: error.message }, 'Database connection failed after retries');
        process.exit(1);
      }
      logger.warn(`Database connection attempt ${attempt}/${retries} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
```

---

### Issue E — Inconsistent schema management (Sequelize models + raw SQL mixed)

Some tables are managed by Sequelize models (`users`, `integrations`, `tools`). Others are created by raw `CREATE TABLE IF NOT EXISTS` SQL (`tool_calls`, `user_integration_credentials`, `external_mcp_servers`, `prompt_library`, `system_settings`). This means:

- In dev mode: Sequelize tables are auto-synced, raw SQL tables are created manually
- In production mode (before Issue A fix): Sequelize tables never exist, raw SQL tables are created — completely broken

**Fix (long term):** Move all tables to Sequelize models with proper associations. This enables `sync({ force: false })` to handle everything consistently and removes the fragile raw SQL blocks.

**Fix (short term, acceptable for v1):** After applying Issue A fix, both paths work. But document this technical debt clearly — raw SQL table management should be migrated to Sequelize models before v2.

---

### Issue F — `must_reset_password` / `mustResetPassword` not enforced in auth middleware

`mustResetPassword: true` is set on the auto-created admin user, but there is no middleware that blocks API calls until the password is reset. The flag exists in the DB but is never checked.

**Fix — add a check in the auth middleware (`server/src/middleware/auth.js`):**

```js
if (req.user.mustResetPassword && req.path !== '/api/auth/change-password') {
  return res.status(403).json({
    error: 'PASSWORD_RESET_REQUIRED',
    message: 'You must change your password before continuing'
  });
}
```

---

### Developer Action — Document backup and restore for self-hosted users

MCPConnect stores everything (integrations, tools, credentials, tool call history) in PostgreSQL. Users have no way to back up or restore their data unless the docs tell them how. This must be documented before public release.

**Backup command** (add to docs):
```bash
# Backup all MCPConnect data to a timestamped SQL file
docker exec mcpconnect-postgres pg_dump -U admin mcpconnect > mcpconnect_backup_$(date +%Y%m%d_%H%M%S).sql
```

**Restore command**:
```bash
# Restore from a backup file
docker exec -i mcpconnect-postgres psql -U admin mcpconnect < mcpconnect_backup_20260407_120000.sql
```

**What to document:**
- Run backup before `docker-compose down -v` or any destructive operation
- Store backups outside the Docker volume (the SQL file goes to the host, not the container)
- Recommended: add a weekly cron job or reminder in the README

**Also add to BACKLOG.md:** a scheduled auto-backup feature — a small cron container that runs `pg_dump` nightly and keeps the last N backups on the host. Low effort, high value for self-hosters.

---

## Developer Action — Server crashes on fresh install (`relation "users" does not exist`)

**Problem:** `docker-compose.yml` sets `NODE_ENV=production`. In production mode, `server/src/config/database.js` skips `sequelize.sync()` entirely. On a fresh database (e.g. after `docker-compose down -v`), no tables exist and the server immediately fatals:

```
Production mode: NOT running sequelize.sync() - use migrations!
relation "users" does not exist
Database connection error
```

**Root cause:** The app has no migration system. The only way tables are created is via `sequelize.sync()` in development mode. A fresh production install is permanently broken unless the developer manually switches to dev mode.

**Fix — use `sync({ force: false })` in production:**

In `server/src/config/database.js`, change the production branch to run a safe sync (creates tables if missing, never drops or alters):

```js
// Before
if (IS_DEV) {
  logger.warn('Development mode: running sequelize.sync({ alter: true })');
  await sequelize.sync({ alter: true });
} else {
  logger.warn('Production mode: NOT running sequelize.sync() - use migrations!');
  // nothing — fresh installs are broken
}

// After
if (IS_DEV) {
  logger.warn('Development mode: running sequelize.sync({ alter: true })');
  await sequelize.sync({ alter: true });
} else {
  logger.warn('Production mode: running sequelize.sync({ force: false }) to create missing tables');
  await sequelize.sync({ force: false }); // CREATE TABLE IF NOT EXISTS — safe on existing data
}
```

`{ force: false }` only creates tables that don't exist. It never drops or alters existing tables, so it is safe to run on a live database. This makes fresh installs work without a migration system.

**Immediate workaround for the developer** (while testing locally): the database tables still exist in the postgres volume — the issue only happens after `docker-compose down -v`. To recreate tables without changing code:

```bash
# Option A: temporary switch to dev mode
# In docker-compose.yml, change NODE_ENV=production → NODE_ENV=development, then restart
docker-compose restart server

# Option B: manual sync (one-time)
docker exec mcpconnect-server node -e "
  const { sequelize } = require('./src/config/database');
  sequelize.sync({ force: false }).then(() => { console.log('done'); process.exit(0); });
"
```

---

## Open Review — commit `1c17bf4` (init-db.sh, image tag fix)

**Reviewer** *(2026-04-07)*: Two of three action items addressed correctly. One new security issue introduced.

| # | Severity | File | Issue | Status |
|---|---|---|---|---|
| 1 | ✅ | `docker-compose.yml` | Image tag fixed to `latest-postgres` | ✅ FIXED |
| 2 | ✅ | `docker/init-db.sh` | Auto-creates `infisical` DB on first postgres start | ✅ FIXED |
| 3 | ✅ | `docker-compose.yml` | ENCRYPTION_KEY removed hardcoded fallback | ✅ FIXED |
| 5 | ✅ | `docker-compose.yml` | Redis has profiles: [secret-store] | ✅ Already fixed |
| 7 | ✅ | `consume.js` | require at top-level | ✅ Already fixed |
| 6 | ✅ | `secret-store.js` | Token TTL from Infisical response | ✅ Already fixed |
| 5 | ✅ | `integrations.js` | description allows empty string | ✅ FIXED |
| 6 | ✅ | `integrations.js` | body uses endpoint.body directly | ✅ Already works |
| 7 | ✅ | `mcp/server.js` | getMcpClients returns 1 when enabled | ✅ FIXED |
| 8 | 🔴 Bug | `21580e8`+`93fedd7` | `routes/consume.js` | Mock Mode template substitution dead code — `mockResponse` is `JSONB` so Sequelize returns object, never string; `typeof === 'string'` branch never executes; `{varName}` substitution silently skipped | ✅ FIXED `62d0f0a` |
| 9 | 🟡 Minor | `1df8965` | `mcp/server.js` | `VALID_SCHEMA_KEY` and `OPENAPI_KEYWORDS` defined inside `registerTool()` — recreated on every tool registration; move to module-level constants | ✅ FIXED `62d0f0a` |
| 10 | 🟡 Pre-existing | `integrations.js` line 716 | `routes/integrations.js` | Import-tools route uses `MCP_STDIO_ENABLED` while every other route uses `MCP_ENABLED` — MCP does not refresh after import | ✅ FIXED `62d0f0a` |

---

### Issue 8 detail — Mock Mode template substitution fix

`mockResponse` is defined as `DataTypes.JSONB` — Sequelize always deserialises it to a JS object before your code runs. `typeof tool.mockResponse === 'string'` is always `false`. The template substitution (`{varName}` → param value) never executes.

Fix in `routes/consume.js`:

```js
// Before (dead code path)
result = typeof tool.mockResponse === 'string'
  ? JSON.parse(tool.mockResponse.replace(/\{(\w+)\}/g, (match, key) => JSON.stringify(mergedParams[key] || match)))
  : tool.mockResponse;

// After — stringify first, substitute, parse back
let mockStr = JSON.stringify(tool.mockResponse);
mockStr = mockStr.replace(/"?\{(\w+)\}"?/g, (match, key) =>
  mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : `"${key}"`
);
result = JSON.parse(mockStr);
```

---

### Issue 6 detail — Select All checkbox

`toggleAllToolsSelect(tools)` exists in `Tools.jsx` but is never rendered. Add a checkbox to the header row of the tool list when `showBulkActions` is true:

```jsx
{showBulkActions && (
  <input
    type="checkbox"
    checked={selectedTools.size === tools.length && tools.length > 0}
    onChange={() => toggleAllToolsSelect(tools)}
    title="Select all"
  />
)}
```

---

### Issue 9 detail — module-level constants

Move out of `registerTool()` in `mcp/server.js`:

```js
// At module level, before class definition
const VALID_SCHEMA_KEY = /^[a-zA-Z0-9_\-]{1,64}$/;
const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);
```

Remove the duplicated `const` declarations inside `registerTool()`.

---

### Issue 10 detail — inconsistent MCP env var

In `routes/integrations.js` line ~716 (import-tools route):
```js
// Change
if (process.env.MCP_STDIO_ENABLED === 'true' && createdTools.length > 0) {
// To
if (process.env.MCP_ENABLED === 'true' && createdTools.length > 0) {
```

---

## Open Review — commits `41a7b94` → `9bba242` (MCP schema fixes, tool edit/create fixes)

**Reviewer** *(2026-04-07)*: Seven commits reviewed covering MCP schema correctness, tool save bugs, and UI improvements.

| # | Severity | File | Issue | Status |
|---|---|---|---|---|
| 1 | 🔴 Bug | `mcp/server.js` | Body template vars (`{varName}`) never added to MCP schema — Claude couldn't see POST params | ✅ FIXED `5cd087a` |
| 2 | 🔴 Bug | `routes/mcp.js` GET `/tools` | Same body template vars missing from the tools listing Claude receives | ✅ FIXED `ea07a0e` |
| 3 | 🟡 Bug | `routes/mcp.js` GET `/tools` | Non-required query/body params silently dropped from tools listing | ✅ FIXED `41a7b94` |
| 4 | 🔴 Bug | `client/Tools.jsx` | Edit tool from All Tools (`/tools`) page sent `PUT /integrations/undefined/tools/:id` → Postgres UUID error → 500 | ✅ FIXED `0b7930b` |
| 5 | 🔴 Bug | `routes/integrations.js` POST `/:id/tools` | `description: Joi.string()` rejects empty string — tool create fails if description left blank | ⬜ Open — see FIX_SUGGESTED.md Issue 3-A |
| 6 | 🔴 Bug | `routes/integrations.js` POST `/:id/tools` | Body template enrichment uses `endpoint.body?.properties` (wrong — same root cause as #1) — body vars not saved to `endpoint.params` on create | ⬜ Open — see FIX_SUGGESTED.md Issue 3-B |
| 7 | 🟢 UX | `client/Tools.jsx` | Generic "Failed to save tool" on JSON parse errors replaced with per-field messages | ✅ FIXED `9bba242` |
| 8 | 🟢 UX | `client/Tools.jsx` | Params/body fields now show schema format hint and `{varName}` body template hint | ✅ FIXED `1dad15a` |

**Action needed:** Items 5 and 6 — see `FIX_SUGGESTED.md` Issue 3 for exact code.

---

## Open Review — User Management Security (`auth.js`)

**Reviewer** *(2026-04-06)*: No UI for adding users is fine for v1 self-hosted. Two issues found in the existing registration flow that must be fixed before going public.

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🔴 Security | `auth.js` | `role` accepted in register body — anyone can self-assign admin ✅ FIXED |
| 2 | 🟡 Missing | `auth.js` | No way to disable open registration for public deployments ✅ FIXED |
| 3 | 🟢 Minor | `auth.js` | `console.error` on line 66 — should use pino logger ✅ FIXED |

All issues fixed in commit `5cf823a`.

---

## Open Review — commits `83b8da1` + `1b18a7f` + `2c0191b` + `3c79849` (stdio, icons, README, final fixes)

**Reviewer** *(2026-04-06)*: All issues from previous round are now fixed.

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🔴 Wrong | `README.md` | Hardcoded `Demo@123` password doesn't exist ✅ FIXED |
| 2 | 🟢 Incomplete | `Dashboard.jsx` | 3rd stat card and quick action icons ✅ FIXED |
| 3 | 🟢 Minor | `README.md` | `your-org` placeholder in clone URL ✅ FIXED |

All issues resolved in commit `3c79849`.

---

## Phase Status

**Reviewer** *(2026-04-06)*: Joi validation added across all routes — good coverage. Four issues found.

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🟡 Bug | `system.js` | Import loop reads `req.body` after validating into `value` ✅ FIXED |
| 2 | 🟡 Bug | `workflows.js` | `isActive` check removed from execute route — disabled workflows now run ✅ FIXED |
| 3 | 🟡 Logic | `workflows.js` | PUT uses full `workflowSchema` (all required) — partial updates rejected ✅ FIXED |
| 4 | 🟡 Logic | `mcp.js` | Neither `toolId` nor `toolName` required — missing both gives confusing downstream error ✅ FIXED |

All issues fixed in commit `57f090a`.

---

## Phase Status

| Phase | Items | Status | Last Commit |
|---|---|---|---|
| 0 — Pre-launch security | 0-A, 0-B, 0-C, 0-D | ✅ All done | `43fc79d` |
| 1 — Stabilize foundation | 1-A through 1-J (excl. 1-I) | ✅ Done / deferred noted | `5fe631a` |
| 1-G | Joi validation | ✅ Done | `5fe631a` |
| 2 — MCP Protocol | 2-A (native server), 2-B, 2-C, 2-D | ✅ Done | `d8f3a12` |
| 3 — Engineering grade | 3-B (logging), 3-D (security), 3-E (metrics) | ✅ Done | `da7d228` |
| 3-C | Test coverage | ✅ Done | `3bb1ced` |
| 4 — Feature completeness | 4-A (OpenAPI import), 4-F (retry backoff) | ✅ Done | `da7d228` |
| 5 — Open-source launch | 5-A (AGPL-3.0), 5-B (CI, CONTRIBUTING) | ✅ Done | `da7d228` |
| Pre-launch cleanup | Artifacts, `.gitignore` | ✅ Done | `43fc79d` |

---

## Resolved Review Rounds

| Commit | What changed | Outcome |
|---|---|---|
| `32f0ade`–`da7d228` | Phases 0–5 initial implementation | 18 issues found across security, logging, metrics, MCP protocol |
| `43fc79d` | Security fixes, cleanup, prod secret validation | All critical issues closed |
| `85bf93b` | Native `McpServer` implementation | 8 issues found (2 crash, 1 bug, 3 missing, 2 minor) |
| `7d1b148` | SDK imports, HTTP transport, refresh hooks, CORS | 5 of 8 fixed; 2 new critical found, 3 minor found |
| `d8f3a12` | stdio import, server singleton, console.*, env rename, httpTransports | All 5 remaining issues closed |
| `bf33c3b` | Phase 2-A follow-up review fixes | 2 new crashes introduced (try block, httpTransports) |
| `5892aed` | Fix two crashes from review | All issues resolved |
| `4f685d1` | docs/connect/ integration guides | All major AI clients covered |
| `5fe631a` | Joi validation (1-G) | Consistent input validation on all routes |

---

## Open Items

### Technical debt (deferred — not blocking launch)

| ID | Area | Issue |
|---|---|---|
| 1-G | Input validation | ✅ DONE - Joi validation applied to all routes |
| 1-I | UX | `lastFetchError` display, `responseTime` surface in UI |
| 2-B-1 | `stdio-mcp.js` | ✅ DONE - buildCommand takes args, handles runtime |
| 2-B-2 | `stdio-mcp.js` | ✅ DONE - proc.kill() now uses SIGKILL |
| 2-B-3 | `stdio-mcp.js` | ✅ DONE - validateJsonRpcResponse checks undefined/null |
| 2-B-4 | `stdio-mcp.js` | ✅ DONE - console.error replaced with pino |
| 3-C | Testing | ✅ DONE - Added encryption, validation, logger, rate-limiter tests |
| rate-limiter | Cleanup | `setInterval` never cleared — use `.unref()` |
| metrics | Precision | `Date.now()` for histograms — use `process.hrtime.bigint()` |

### Deferred (future phases)

| ID | Item |
|---|---|
| 3-A | TypeScript migration + Prisma |
| 4-B | Workflow execution engine |
| 4-C | GraphQL support |
| 4-D | File upload / multipart |
| 4-E | Pagination helper |

### `mcp-connect-wrapper` — promote before open-source

The wrapper is a working stdio MCP bridge — it should be moved to `packages/mcp-client/` and published to npm, not deleted. Five issues to fix before promotion:

| # | Issue |
|---|---|
| 1 | SDK path resolution walks directory tree — fragile outside dev. Add proper `package.json` dep |
| 2 | API key stored plaintext in `config.json` — use OS keychain (`keytar`) or warn user |
| 3 | Tools fetched once at startup — no live updates when tools change in UI |
| 4 | All params typed as `string` — loses number/boolean type info from tool definition |
| 5 | `login()` uses `return` at top level — should be `process.exit(0)` |

---

## Next Steps (pre-launch)

1. ✅ **1-G** — Joi validation done
2. ✅ **docs/connect/** — Integration guides done
3. ✅ **3-C** — Test coverage done
4. ✅ **2-B** — stdio-mcp.js tech debt done
5. **UI: Lucide icons** — Replace text placeholders with icons
6. **README.md** — Write proper README with quickstart
7. **`mcp-client` package** — Promote wrapper, fix 5 issues, publish to npm
8. **`3-A`** — TypeScript + Prisma (large effort, own branch)

---

## Docs Request — Client Integration Guides

**Reviewer** *(2026-04-06)*: Before open-source launch, MCPConnect needs a clear `docs/connect/` section showing users how to wire it up with the AI tools they already use. This is what drives adoption — if someone can't add it to Claude Code in 2 minutes, they won't try.

Suggested structure:
```
docs/
  connect/
    README.md          ← overview + compatibility table
    claude-code.md
    cursor.md
    windsurf.md
    open-webui.md      ← covers Ollama + Open WebUI
    zed.md
    generic-mcp.md     ← for any MCP-compatible client
```

**Each guide should cover two transport modes:**

**HTTP (recommended — no local process needed):**
```json
// ~/.claude.json  (Claude Code example)
{
  "mcpServers": {
    "mcpconnect": {
      "type": "http",
      "url": "http://your-server:3000/mcp",
      "headers": { "x-api-key": "your-api-key" }
    }
  }
}
```

**stdio (via `mcp-client` wrapper — for clients that only support stdio):**
```bash
npx mcpconnect-mcp --url http://your-server:3000 --login
```
Then add to the client's MCP config:
```json
{
  "mcpServers": {
    "mcpconnect": {
      "command": "npx",
      "args": ["mcpconnect-mcp", "--url", "http://your-server:3000"]
    }
  }
}
```

**Compatibility table for the README.md:**

| Client | HTTP transport | stdio transport | Notes |
|---|---|---|---|
| Claude Code | ✅ | ✅ | HTTP preferred; use `/mcp add` |
| Cursor | ✅ | ✅ | Add via Settings → MCP |
| Windsurf | ✅ | ✅ | Add via `~/.codeium/windsurf/mcp_config.json` |
| Open WebUI + Ollama | ✅ | ❌ | HTTP only; add via Admin → Tools |
| Zed | ❌ | ✅ | stdio only currently |
| VS Code (Copilot) | ✅ | ✅ | Via `.vscode/mcp.json` |

**Developer note:** The HTTP transport (`/mcp`) is already live as of commit `5892aed`. The stdio wrapper needs the 5 fixes in the `mcp-client` section above before the stdio guide can be published accurately.
