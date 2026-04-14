# Toolshed - Suggested Fixes

> Issues where the root cause has been diagnosed and the exact fix is documented.
> Each open entry includes: what is broken, why it is broken, and the exact code change needed.

---

## Resolved Issues

All issues below were diagnosed here and fixed by the developer. Kept as a commit reference.

| # | Issue | Fixed in |
|---|-------|---------|
| 1 | POST body template `{varName}` missing from MCP tool schema | `5cd087a`, `ea07a0e` |
| 2 | "Failed to save tool" when editing from the All Tools view | `0b7930b` |
| 3 | Tool creation fails with blank description; body params not extracted on create | `afc8af7` |
| 4 | UI: `{varName}` in body not auto-detected and synced to Default Params | `b97d1d9` |
| 5 | Two `setForm` calls in body `onChange` caused save to break | `422d1e8` |
| 6 | Unquoted `{varName}` in body caused JSON parse error; number type lost at runtime | `e96f8ea`, `f35cd8a` |
| 7 | Body template vars added twice (root key + substitution) | `45611c0` |
| 8 | Spurious `allOf` param on OpenAPI-imported tools | `20e1cd4` |
| 9 | OpenAPI importer did not generate body templates from request body schema | `377c5af` |
| 10 | OpenAPI discovery crashed on circular `$ref` (infinite recursion) | `421a482` |
| 11 | OpenAPI import marked all body params as required; ignored `required` array | `50ebd96` |
| 12 | MCP tool schema rejected by Anthropic - property key exceeded 64 chars | `4af8cae`, `07ecd17` |
| 13 | `PUT /:id` stored plaintext credentials and leaked config in response | `35d01f7` |
| 14 | Hardcoded credentials in Default Params or body templates visible to Claude | `71eac5c` |
| 15 | OAuth token refresh signaled but never executed | `1be2bba` |
| 16 | OAuth refresh did not persist new token to database | `1be2bba` |
| 17 | Linear OAuth `authUrl` had wrong domain (`linear` instead of `linear.app`) | `1be2bba` |
| 18 | Jira OAuth used wrong version; Notion OAuth missing Basic auth + JSON body | `1be2bba` |
| 19 | `/admin-reset` had no auth middleware | latest |
| 20 | `GET /system/`, `/system/:key` had no auth | latest |
| 21 | `mcpAuth` catch block called `next()` — exceptions granted access | latest |
| 22 | `GET /mcp/endpoints` had no auth | latest |
| 23 | Duplicate `GET /mcp/tools` route with `optionalAuth` shadowing `checkMcpAuth` | latest |
| 24 | `PUT /system/:key` + `POST /system/import` missing `requireAdmin` | latest |
| 25 | Export leaked `authHeader` plaintext for external MCP servers | latest |

---

## Issue 19 - `/admin-reset` has no authentication

**Status:** Open  
**Severity:** CRITICAL

**Symptom:** Anyone on the network can reset any user's password by POSTing to `/api/auth/admin-reset` with just an email address — no login required.

**Root cause - `auth.js` line 155:**
```js
router.post('/admin-reset', async (req, res) => {  // ← no auth middleware
  const { email, newPassword } = req.body;
  ...
  await user.update({ password: hashed });
```

**Fix — add `auth` + `requireAdmin` middleware:**
```js
router.post('/admin-reset', auth, requireAdmin, async (req, res) => {
```

---

## Issue 20 - System settings routes have no authentication

**Status:** Open  
**Severity:** CRITICAL

**Symptom:** `GET /api/system/`, `GET /api/system/mcp`, and `GET /api/system/:key` are wide open. Any unauthenticated request returns all system settings including OAuth provider client IDs, MCP configuration, and secret store config.

**Root cause - `system.js` lines 21, 34, 43:**
```js
router.get('/', async (req, res) => { ... })       // no auth
router.get('/mcp', async (req, res) => { ... })    // no auth
router.get('/:key', async (req, res) => { ... })   // no auth
```

**Fix — add `auth` middleware to all three:**
```js
router.get('/', auth, async (req, res) => { ... })
router.get('/mcp', auth, async (req, res) => { ... })
router.get('/:key', auth, async (req, res) => { ... })
```

---

## Issue 21 - mcpAuth middleware silently passes on any exception

**Status:** Open  
**Severity:** CRITICAL

**Symptom:** Any runtime exception inside `mcpAuth.js` causes the middleware to call `next()` instead of returning 401. Auth is effectively bypassed for any error path — misconfigured DB, malformed JWT, network blip, etc.

**Root cause - `middleware/mcpAuth.js` lines 73-76:**
```js
    next();       // ← line 73: falls through even when not authenticated
  } catch (error) {
    next();       // ← line 75: exceptions grant access instead of denying it
  }
```

**Fix — return 401 in catch, and only call `next()` when authenticated:**
```js
    if (!authenticated) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication error' });
  }
```

---

## Issue 22 - `GET /mcp/endpoints` has no authentication

**Status:** Open  
**Severity:** CRITICAL

**Symptom:** `GET /api/mcp/endpoints` exposes every tool's name, description, parameter schema, and HTTP endpoint path to unauthenticated callers.

**Root cause - `routes/mcp.js` line 535:**
```js
router.get('/endpoints', async (req, res) => {   // ← no auth
```

**Fix:**
```js
router.get('/endpoints', checkMcpAuth, async (req, res) => {
```

---

## Issue 23 - Duplicate `/mcp/tools` route makes tool listing unauthenticated

**Status:** Open  
**Severity:** HIGH

**Symptom:** There are two `GET /tools` routes registered in `mcp.js`. Express uses the first match, so which one wins depends on file load order — but line 917 uses `optionalAuth`, meaning the tool list can be accessed without credentials.

**Root cause - `routes/mcp.js` lines 391 and 917:**
```js
router.get('/tools', checkMcpAuth, ...)   // line 391
...
router.get('/tools', optionalAuth, ...)   // line 917 — duplicate, shadows or conflicts
```

**Fix — remove the duplicate route at line 917.** If both serve different purposes, consolidate into one handler with the stricter `checkMcpAuth`.

---

## Issue 24 - `PUT /system/:key` and `POST /system/import` missing admin check

**Status:** Open  
**Severity:** HIGH

**Symptom:** Any authenticated user (not just admins) can:
- Update any system setting via `PUT /api/system/:key` — including OAuth secrets and MCP config
- Import arbitrary integrations, tools, and external MCP servers via `POST /api/system/import`

**Root cause - `system.js` lines 55 and 136:**
```js
router.put('/:key', auth, async ...)          // ← no requireAdmin
router.post('/import', auth, async ...)       // ← no requireAdmin
```

**Fix — add `requireAdmin` to both:**
```js
router.put('/:key', auth, requireAdmin, async ...)
router.post('/import', auth, requireAdmin, async ...)
```

---

## Issue 25 - Export leaks external MCP server auth tokens in plaintext

**Status:** Open  
**Severity:** HIGH

**Symptom:** `POST /api/system/export` includes the `authHeader` field of external MCP servers in the export JSON. This is the raw authentication credential (Bearer token, API key) used to connect to those servers — exported unencrypted to whoever downloads the file.

**Root cause - `system.js` lines 92-96:**
```js
{
  ...
  authType: s.authType,
  authHeader: s.authHeader,   // ← plaintext credential in export
  isActive: s.isActive
}
```

**Fix — strip credential fields from export:**
```js
{
  name: s.name,
  command: s.command,
  args: s.args,
  env: s.env,
  authType: s.authType,
  // authHeader intentionally omitted — never export credentials
  isActive: s.isActive
}
```

---

## Issue 27 - Per-user credentials silently broken at tool execution time

**Status:** Open  
**Severity:** HIGH

**Symptom:** A non-owner user connects to a shared integration via `PATCH /:id/credentials`. The UI shows "Connected". But when Claude calls a tool from that integration, the request goes out with a malformed auth config — resulting in either a 401 from the upstream API or a silent failure.

**Root cause — two bugs in `routes/mcp.js` execute path (~lines 702 and 718):**

```js
// Bug 1: missing JSON.parse — decrypt returns a string, not an object
userCreds = encryption.decrypt(userCredsRecord.credentials);
// userCreds = '{"token":"abc123"}' ← raw JSON string

// Bug 2: replaces the entire auth object with the string
config.auth = userCreds;
// adapter receives config.auth = '{"token":"abc123"}' instead of { type: 'bearer', credentials: {...} }
```

`DynamicAdapter` then gets `this.auth = "..."` (a string) where it expects `{ type, credentials }`. Auth header construction fails silently.

Additionally, `AdapterFactory.create(integration.type, config)` is called with no `options`, so `DynamicAdapter.userId` is always null — `resolveCredentials()` exits early and is effectively dead code in this path.

**Fix — two lines in `mcp.js`:**

```js
// Line ~702: parse the decrypted JSON
userCreds = JSON.parse(encryption.decrypt(userCredsRecord.credentials));

// Line ~718: merge credentials into auth, preserve type
config.auth = { ...integration.config.auth, credentials: userCreds };
```

---

## Issue 26 - N+1 queries in integrations list

**Status:** Open  
**Severity:** MEDIUM

**Symptom:** `GET /api/integrations` runs one query to fetch integrations, then executes two additional DB queries per integration — one for tool count, one for user credentials. With 20 integrations, that's 41 queries per page load.

**Root cause - `routes/integrations.js` lines ~78-95:** Tool count and `UserIntegrationCredentials` are fetched in a loop.

**Fix — use `include` with Sequelize to eager-load:**
```js
const integrations = await Integration.findAll({
  where: whereClause,
  include: [
    { model: Tool, attributes: ['id'] },
    { model: UserIntegrationCredentials,
      where: { userId: req.user.id },
      required: false }
  ]
});
// Then derive counts from integration.Tools.length
```
