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

## Developer Action — Infisical secrets resolved but never applied to HTTP call (Issue 17)

**Problem:** Tool calls via UI return 401/auth error even though secrets are fetched from Infisical successfully (status 200 visible in logs).

**Root cause — two bugs working together:**

**Bug A (`DynamicAdapter.js`):** `getAuthHeaders()` has no `case 'infisical':` in the switch statement. When auth type is `'infisical'`, it falls to `default: return {}` — no auth header is set on the outgoing HTTP request. The resolved token is silently ignored.

**Bug B (`consume.js`):** Even if the adapter handled `'infisical'`, the secret is resolved into `credentials.token` (a plain string) but the auth `type` remains `'infisical'`. The adapter would need to know that `'infisical'` means "use the token as Bearer" — which is not obvious or documented.

**Fix — remap auth type to `bearer` after resolution in `consume.js`:**

After resolving the secret, treat it as a plain Bearer token. The adapter already knows how to handle `bearer`. No changes needed to `DynamicAdapter.js`:

```js
// In consume.js, after the secret store resolution block:

if (secretStore.isInitialized()) {
  const credentials = config.auth?.credentials;
  if (credentials) {
    const resolveIfNeeded = async (cred) => {
      for (const [key, value] of Object.entries(cred)) {
        if (typeof value === 'string' && secretStore.isSecretRef(value)) {
          const resolved = await secretStore.resolveSecret(value);
          if (resolved) cred[key] = resolved;
        }
      }
    };
    await resolveIfNeeded(credentials);
    
    // ↓ ADD THIS: remap infisical auth type to bearer now that secret is resolved
    if (config.auth?.type === 'infisical') {
      config.auth = { ...config.auth, type: 'bearer' };
    }
  }
}
```

Same fix also needed in `mcp/server.js` `executeTool()` — it resolves secrets too but the same type remapping is missing:

```js
// In mcp/server.js, after the secretStore resolution block:
if (secretStore.isInitialized()) {
  // ... existing resolution loop ...
  
  // ↓ ADD THIS:
  if (resolvedConfig.auth?.type === 'infisical') {
    resolvedConfig.auth = { ...resolvedConfig.auth, type: 'bearer' };
  }
}
```

This keeps `DynamicAdapter.js` clean - it never needs to know about `'infisical'`. By the time the adapter is created, all secret refs are resolved and the auth type is a standard `bearer`.

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
| 3 | 🔴 Security | `docker-compose.yml` | `ENCRYPTION_KEY` and `AUTH_SECRET` both hardcoded to the same base64 value as default — see below | ⬜ Open |

### Issue 3 — Hardcoded default secrets in `docker-compose.yml`

```yaml
# Current — WRONG: real base64 key hardcoded as default, same value for both
- ENCRYPTION_KEY=${INFISICAL_ENCRYPTION_KEY:-spk1YCToTuXlVe3XIp/FQDokRqi9Nr+NJRS3ueO+HdM=}
- AUTH_SECRET=${INFISICAL_AUTH_SECRET:-spk1YCToTuXlVe3XIp/FQDokRqi9Nr+NJRS3ueO+HdM=}
```

Two problems:
1. **Same value for both keys** — `ENCRYPTION_KEY` and `AUTH_SECRET` must be different. Using the same value weakens both.
2. **Hardcoded fallback in a public repo** — anyone who clones and runs `docker-compose --profile secret-store up` without setting these env vars will silently use a publicly known key. All their Infisical-encrypted data is compromised from day one.

Fix — use clearly broken placeholder strings that force the user to set real values:

```yaml
- ENCRYPTION_KEY=${INFISICAL_ENCRYPTION_KEY:?Set INFISICAL_ENCRYPTION_KEY in .env (run: openssl rand -base64 32)}
- AUTH_SECRET=${INFISICAL_AUTH_SECRET:?Set INFISICAL_AUTH_SECRET in .env (run: openssl rand -base64 32)}
```

The `:?` syntax makes Docker Compose fail with the message if the variable is unset or empty — no silent fallback. Add both to `.env.example` with generation instructions:

```bash
# Required when using --profile secret-store
# Generate with: openssl rand -base64 32
INFISICAL_ENCRYPTION_KEY=
INFISICAL_AUTH_SECRET=
```

---

## Developer Action — Fix wrong Infisical Docker image tag

**Problem:** `docker-compose.yml` has `image: infisical/infisical:0.99.0` — this tag does not exist on Docker Hub. Docker will fail with:
```
Error response from daemon: failed to resolve reference "docker.io/infisical/infisical:0.99.0": not found
```

**Fix:** Change the image tag in `docker-compose.yml`:
```yaml
# Wrong — tag does not exist
image: infisical/infisical:0.99.0

# Correct — PostgreSQL-backed version
image: infisical/infisical:latest-postgres
```

The PostgreSQL-backed images follow the naming convention `latest-postgres` (floating) or `v<version>-postgres` for pinned versions (e.g. `infisical/infisical:v0.94.0-postgres`). The plain `latest` tag is MongoDB-backed and will not work with the PostgreSQL connection string in the compose file.

**Fix Applied ✅** (in commit `3bc8d96` and later):
- Image tag reverted to `infisical/infisical:latest-postgres`
- Added `docker/init-db.sh` that auto-creates the `infisical` database on first start

---

## Developer Action — Auto-create Infisical database on first run

**Problem:** When starting with `--profile secret-store`, the `infisical` PostgreSQL database does not exist. Infisical starts, can't connect to the DB, and the UI hangs at a loading screen with no obvious error unless you check logs manually.

**Root cause:** The postgres service only creates the `mcpconnect` database (via `POSTGRES_DB=mcpconnect`). The `infisical` database in `DB_CONNECTION_URI=postgres://...@postgres:5432/infisical` must also exist before Infisical starts.

**Fix Applied ✅** (in commit `3bc8d96` and later):
- Added `docker/init-db.sh` that auto-creates the `infisical` database on first start
- Mounted into postgres service: `./docker/init-db.sh:/docker-entrypoint-initdb.d/init-db.sh:ro`

---

## Developer Action — Secret Store documentation needed

**Please create:** `docs/secret-store.md` covering:
- How to set up Infisical Cloud (free tier, no infrastructure)
- How to set up Infisical self-hosted (`docker-compose --profile secret-store up`)
- How to try it without losing current DB credentials (opt-in per integration)
- How to switch back to DB credentials
- Secret reference format: `infisical://env/SECRET_NAME`
- Security model — what Claude can and cannot see

**Also update:**
- `README.md` — add Secret Store to Features list + link to the new doc
- `.env.example` — add a comment above the secret store vars pointing to the doc

---

## Open Review — commit `3bc8d96` (Valkey, profile fix, token TTL, top-level import)

**Reviewer** *(2026-04-07)*: Issues 5, 6, 7 all fixed correctly. One new bug introduced — wrong URL scheme for Valkey.

| # | Severity | File | Issue | Status |
|---|---|---|---|---|
| 5 | ✅ | `docker-compose.yml` | Valkey gets `profiles: [secret-store]`, `server` dep removed | ✅ FIXED |
| 6 | ✅ | `secret-store.js` | Token TTL uses `data.expiresIn \|\| 300` | ✅ FIXED |
| 7 | ✅ | `consume.js` | `secretStore` moved to top-level import | ✅ FIXED |
| 8 | 🔴 Bug | `docker-compose.yml` | `REDIS_URL=valkey://valkey:6379` — wrong scheme; ioredis only understands `redis://` and `rediss://`; Infisical will fail to connect | ✅ FIXED `945205c` |

### Issue 8 fix

```yaml
# Wrong
- REDIS_URL=valkey://valkey:6379

# Correct — protocol stays redis://, only the hostname changes
- REDIS_URL=redis://valkey:6379
```

The container name `valkey` (the hostname) is correct. Only the scheme needs fixing. Valkey speaks the Redis protocol — clients connect to it using `redis://`.

---

## Open Review — commits `a664a1e` + `12b3b88` (Secret store fixes + Docker)

**Reviewer** *(2026-04-07)*: Issues 1–4 from previous round all fixed correctly. Two new issues introduced in the Docker commit.

| # | Commit | Severity | File | Issue | Status |
|---|---|---|---|---|---|
| 1 | `a664a1e` | ✅ | `index.js` | `init()` wired on startup via env vars | ✅ FIXED |
| 2 | `a664a1e` | ✅ | `secret-store.js` | Proper OAuth exchange — `authenticate()` calls `/api/v1/auth/universal-auth/login` | ✅ FIXED |
| 3 | `a664a1e` | ✅ | `mcp/server.js` | Secret resolution added to MCP `executeTool()` path | ✅ FIXED |
| 4 | `a664a1e` | ✅ | `secret-store.js` | `secretPath` fixed — uses folder path, supports 2-part and 3-part refs | ✅ FIXED |
| 5 | `12b3b88` | 🔴 Bug | `docker-compose.yml` | Redis has no `profiles` tag — starts for ALL users even without Infisical; `server` has hard `depends_on: redis` — server won't start if Redis is down, breaking every non-Infisical deployment | ⬜ Open |
| 6 | `a664a1e` | 🟡 Minor | `secret-store.js` | Token TTL hardcoded to 5 minutes — Infisical auth response includes `expiresIn` (seconds); should use actual TTL instead of guessing | ⬜ Open |
| 7 | `5ccad9d` | 🟢 Minor | `consume.js` | `require('../services/secret-store')` still inside route handler — should be top-level import | ⬜ Open |

---

### Issue 5 detail — Redis profile fix (`docker-compose.yml`)

Redis should be under the `secret-store` profile (only Infisical needs it). The `server` service must not depend on Redis — the server has no Redis dependency at all.

Also replace `redis:7-alpine` with `valkey/valkey:7-alpine` — Redis changed to a non-open-source license (RSALv2 + SSPL) in March 2024; Valkey is the Linux Foundation BSD-3-Clause fork and is a drop-in replacement. The `REDIS_URL` connection string stays as `redis://` — that's just the protocol name, not the product.

```yaml
# Fix 1: switch to Valkey (open-source Redis fork) and add profile
valkey:
  image: valkey/valkey:8-alpine
  container_name: mcpconnect-valkey
  restart: unless-stopped
  expose:
    - "6379"
  networks:
    - mcpconnect-network
  profiles:
    - secret-store   # ← opt-in only

# Fix 2: update Infisical REDIS_URL to point at valkey container
infisical:
  environment:
    - REDIS_URL=redis://valkey:6379   # protocol stays "redis://" — Infisical expects this
  depends_on:
    valkey:
      condition: service_started

# Fix 3: remove redis/valkey from server's depends_on entirely
server:
  depends_on:
    postgres:
      condition: service_healthy
    # remove: redis/valkey dependency — server has no Redis dependency
```

After this fix:
- `docker-compose up` — starts postgres, server, client, demo-mcp only (no Redis)
- `docker-compose --profile secret-store up` — additionally starts Redis + Infisical

---

### Issue 6 detail — Use actual token TTL from Infisical response

Infisical's `/api/v1/auth/universal-auth/login` response includes `expiresIn` (seconds). Use it instead of hardcoding 5 minutes:

```js
// Before
tokenExpiry = Date.now() + (5 * 60 * 1000);

// After
const ttlSeconds = data.expiresIn || 300;  // fallback to 5 min if not present
tokenExpiry = Date.now() + (ttlSeconds * 1000);
logger.info({ expiresIn: ttlSeconds }, 'Infisical access token obtained');
```

---

## Open Review — commit `5ccad9d` (Feature 9: Infisical secret store)

**Reviewer** *(2026-04-07)*: Good structure and the `consume.js` hook is clean. But 4 issues — two are blockers that mean the feature silently does nothing end-to-end.

| # | Severity | File | Issue | Status |
|---|---|---|---|---|
| 1 | 🔴 Blocker | `index.js` | `init()` never called on server startup — `isInitialized()` always `false`, secrets never resolve | ⬜ Open |
| 2 | 🔴 Blocker | `secret-store.js` | Wrong auth — `clientSecret` used directly as Bearer token; Infisical requires a two-step OAuth exchange to get an `accessToken` first | ⬜ Open |
| 3 | 🔴 Blocker | `mcp/server.js` | `executeTool()` builds adapter from `integration.config` directly — no secret resolution. Tools called via Claude Code (MCP path) never have secrets resolved; only the REST `/execute` path does | ⬜ Open |
| 4 | 🟡 Wrong | `secret-store.js` | `secretPath` query param uses project slug from ref instead of folder path — Infisical's `secretPath` is a folder path (`/`, `/backend`) not a project identifier | ⬜ Open |
| 5 | 🟡 Minor | `consume.js` | `require('../services/secret-store')` inside route handler — Node.js caches it so no reload, but should be a top-level import | ⬜ Open |
| 6 | 🟡 Missing | — | No settings UI or API endpoint to configure the secret store — users have no way to enable/configure Infisical from the app | ⬜ Open |
| 7 | 🟡 Missing | `docker-compose.yml` | No Infisical service added — implementation assumes cloud version (`app.infisical.com`); self-hosted users (the primary MCPConnect audience) have no Docker path | ⬜ Open |

---

### Issue 1 — Wire `init()` into server startup (`server/src/index.js`)

Add after the database is ready and models are loaded:

```js
const secretStore = require('./services/secret-store');
const SystemSetting = require('./models/SystemSetting');

// After DB sync
const secretSetting = await SystemSetting.findOne({ where: { key: 'secretStore' } });
if (secretSetting?.value?.enabled) {
  await secretStore.init(secretSetting.value);
}
```

---

### Issue 2 — Fix Infisical auth (`server/src/services/secret-store.js`)

Infisical Universal Auth is a two-step flow. The `clientSecret` is not a Bearer token — it is exchanged for an `accessToken`:

```js
// Step 1: exchange clientId + clientSecret for accessToken
async function authenticate() {
  const response = await fetch(`${config.siteUrl}/api/v1/auth/universal-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret })
  });
  if (!response.ok) throw new Error(`Infisical auth failed: ${response.status}`);
  const data = await response.json();
  return data.accessToken;
}
```

Store `accessToken` in module state after `init()`, use it in `resolveSecret()`. Add re-authentication on 401 (tokens expire).

---

### Issue 3 — Resolve secrets in MCP execution path (`server/src/mcp/server.js`)

`executeTool()` line 125 builds the adapter without resolving secrets:

```js
// Before
const adapter = AdapterFactory.create(integration.type, integration.config);

// After
const secretStore = require('../services/secret-store');
let resolvedConfig = integration.config;
if (secretStore.isInitialized()) {
  const credentials = resolvedConfig.auth?.credentials;
  if (credentials) {
    for (const [key, value] of Object.entries(credentials)) {
      if (secretStore.isSecretRef(value)) {
        const resolved = await secretStore.resolveSecret(value);
        if (resolved) {
          resolvedConfig = JSON.parse(JSON.stringify(resolvedConfig)); // deep clone
          resolvedConfig.auth.credentials[key] = resolved;
        }
      }
    }
  }
}
const adapter = AdapterFactory.create(integration.type, resolvedConfig);
```

---

### Issue 4 — Fix `secretPath` in `resolveSecret()`

The ref format `infisical://projectSlug/env/secretName` uses `projectSlug` as `secretPath` but Infisical's API expects `secretPath` to be a folder path (`/` for root). The project is already identified by `workspaceId` in the config.

Change the ref format to `infisical://env/secretName` (project comes from config) and fix the API call:

```js
// ref: infisical://prod/JIRA_TOKEN
const [env, secretName] = path.split('/');

const url = `${config.siteUrl}/api/v3/secrets/raw/${secretName}` +
  `?workspaceId=${config.workspaceId}&environment=${env}&secretPath=/`;
```

Or keep the 3-part ref but use the third segment as `secretPath` (folder), not project slug:
```
infisical://env/folder/secretName  →  secretPath=/folder
infisical://env//secretName        →  secretPath=/ (root)
```

---

### Issue 7 — Docker deployment: Infisical self-hosted requires Redis (two extra services)

Infisical self-hosted requires Redis for session caching and background jobs. MCPConnect's `docker-compose.yml` has no Redis service, so self-hosting Infisical adds **two** new services (Infisical + Redis), not one. This is significant deployment overhead for what is essentially a secret lookup service.

**Recommended approach: Infisical Cloud as the default, self-hosted as opt-in**

Infisical self-hosted and cloud use the **identical API** — `siteUrl` is the only difference. Infisical Cloud has a free tier and requires zero infrastructure. This should be the default recommendation in documentation.

For the `docker-compose.yml`, add both Redis and Infisical under the `secret-store` profile so they are fully opt-in:

```yaml
  redis:
    image: redis:7-alpine
    container_name: mcpconnect-redis
    restart: unless-stopped
    networks:
      - mcpconnect-network
    profiles:
      - secret-store

  infisical:
    image: infisical/infisical:latest-postgres
    container_name: mcpconnect-infisical
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - ENCRYPTION_KEY=${INFISICAL_ENCRYPTION_KEY:-change-infisical-encryption-key}
      - AUTH_SECRET=${INFISICAL_AUTH_SECRET:-change-infisical-auth-secret}
      - DB_CONNECTION_URI=postgres://admin:admin123@postgres:5432/infisical
      - REDIS_URL=redis://redis:6379
      - SITE_URL=${INFISICAL_SITE_URL:-http://localhost:8080}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - mcpconnect-network
    profiles:
      - secret-store
```

Users who want self-hosted: `docker-compose --profile secret-store up`
Users who use Infisical Cloud: skip the profile entirely, just set `SECRET_STORE_SITE_URL=https://app.infisical.com`

Add secret store env vars to the `server` service (works for both cloud and self-hosted):

```yaml
  server:
    environment:
      # ... existing vars ...
      - SECRET_STORE_ENABLED=${SECRET_STORE_ENABLED:-false}
      - SECRET_STORE_SITE_URL=${SECRET_STORE_SITE_URL:-https://app.infisical.com}
      - SECRET_STORE_CLIENT_ID=${SECRET_STORE_CLIENT_ID:-}
      - SECRET_STORE_CLIENT_SECRET=${SECRET_STORE_CLIENT_SECRET:-}
      - SECRET_STORE_WORKSPACE_ID=${SECRET_STORE_WORKSPACE_ID:-}
```

Default `SECRET_STORE_SITE_URL` points to Infisical Cloud — self-hosted users override it. Also add these vars to `.env.example` with comments explaining both options.

---

### After applying all fixes

1. Restart server → `init()` runs, authenticates with Infisical, stores `accessToken`
2. Configure credential field: `JIRA_TOKEN` → `infisical://prod/JIRA_TOKEN`
3. Tool call via Claude Code (MCP) → `executeTool()` resolves secret → adapter uses real token
4. Tool call via REST → `consume.js` resolves secret → adapter uses real token
5. Users without secret store configured → unaffected, DB credentials work as before

---

## Open Review — commit `35d01f7` (Issue 13: credential security)

**Reviewer** *(2026-04-07)*: Single commit addressing all three sub-issues. All correct.

| # | Severity | Issue | Status |
|---|---|---|---|
| A | 🔴 High | `PUT /:id` now encrypts credentials before saving — same logic as POST create | ✅ FIXED `35d01f7` |
| B | 🔴 Medium | `PUT /:id` response sanitized — no longer returns raw `config` with encrypted credentials | ✅ FIXED `35d01f7` |
| C | 🟡 Low | `credentialsAreEncrypted` field path corrected: `.auth.credentials.token` | ✅ FIXED `35d01f7` |

No new issues introduced. Clean commit.

---

## Open Review — commits `50ebd96` → `93fedd7` (Issue 11/12 fixes + Bulk Actions + Mock Mode)

**Reviewer** *(2026-04-07)*: 7 commits reviewed. Issue 11 and 12 fixes are correct. Three new features land — two have bugs.

| # | Severity | Commit | File | Issue | Status |
|---|---|---|---|---|---|
| 1 | ✅ | `50ebd96` | `routes/integrations.js` | Issue 11: OpenAPI required array correctly used for body params | ✅ Good |
| 2 | ✅ | `1df8965` | `mcp/server.js`, `integrations.js` | Issue 12 Fix 1: Invalid/long keys filtered from MCP schema | ✅ Good |
| 3 | ✅ | `07ecd17` | `mcp/server.js`, `integrations.js` | Stricter key pattern `[a-zA-Z0-9_-]` (no dot) for cross-client compat | ✅ Good |
| 4 | ✅ | `4af8cae` | `openapi-parser.js` | Issue 12 Fix 2: `generateBodyTemplate` depth limit (2) + length guard (64) | ✅ Good |
| 5 | ✅ | `e0950e2` | `Tools.jsx`, `integrations.js` | Bulk tool actions: enable/disable/delete — logic correct, MCP refresh uses correct `MCP_ENABLED` env var | ✅ Good |
| 6 | 🟡 Missing | `e0950e2` | `Tools.jsx` | `toggleAllToolsSelect` implemented but never wired to UI — "Select All" checkbox missing | ✅ FIXED `62d0f0a` |
| 7 | 🟢 Minor | `eedb934` | `mcp/server.js`, `index.js` | `getMcpClients()` is a stub that always returns 0 — health endpoint always shows `mcpClients: 0` | ⬜ Open |
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
