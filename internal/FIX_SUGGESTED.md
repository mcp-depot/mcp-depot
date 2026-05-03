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
| 19 | `/admin-reset` had no auth middleware | `latest` |
| 20 | `GET /system/`, `/system/:key` had no auth | `latest` |
| 21 | `mcpAuth` catch block called `next()` — exceptions granted access | `latest` |
| 22 | `GET /mcp/endpoints` had no auth | `latest` |
| 23 | Duplicate `GET /mcp/tools` route with `optionalAuth` shadowing `checkMcpAuth` | `latest` |
| 24 | `PUT /system/:key` + `POST /system/import` missing `requireAdmin` | `latest` |
| 25 | Export leaked `authHeader` plaintext for external MCP servers | `latest` |
| 26 | N+1 queries in integrations list | `latest` |
| 27 | Per-user credentials broken at MCP tool execution - missing JSON.parse | `latest` |
| 28 | Body template substitution corrupts values containing `{word}` patterns | `latest` |
| 34 | External MCP servers cause GET /mcp/tools to time out | `latest` |
| 35 | Body params sent to query instead of body | `latest` |
| 36 | Tool execution catch block returns [object Object] | `latest` |
| 37 | Monitoring page should show actual upstream API response | `latest` |
| 38 | POST body merges template result AND all flat param keys | `latest` |
| 38b | Optional params leave null nodes in resolved body template | `latest` |
| 38c | Non-null default params added as flat body keys on top of template | `latest` |
| 38d | Fixes 38/38b/38c applied to wrong file | `latest` |
| 38e | Same flat-param body merge bug in consume.js and compositeExecutor.js | `latest` |
| 39 | Template substitution always produces strings | `latest` |
| 40 | Session context MCP tools return 401 when MCP auth mode is required | `a5e5ae7` |
| 41 | Ownerless contexts invisible in admin UI and list/get MCP tools | `de20e7a` |
| 42 | Session Contexts empty state references Claude by name | `72e830c` |
| 43 | `list-session-contexts` MCP response omits TTL info | `5827ac3` |
| 44 | `SessionContexts.jsx` does not display TTL | `6566f74` |
| 45 | Sidebar: Contexts and Channels added as flat items instead of collapsible Sessions group | `816ef6e` |
| 46 | `SessionChannels.jsx` uses undeclared CSS classes | `816ef6e` |
| 47 | `SessionContexts.jsx` emojis not replaced with Lucide icons | `816ef6e` |
| 48 | `read-channel` and `clear-channel` broken — path param not substituted | `3b6346c` |
| 48b | `read-channel` still broken after fix — DB seed rows not refreshed | `1709d79` |
| 49 | Issue 45 partial — sidebar static section, wrong icons | `907bbbe` |
| 50 | Issue 47 partial — empty state uses wrong icon | `907bbbe` |
| 51 | `SessionChannels.jsx` still uses undeclared CSS classes | `907bbbe` |
| 52 | Issue 50 partial — Globe/Lock imported but never rendered | `716ec76` |
| 53 | Dead code in SessionChannels.jsx and Sidebar.jsx | `716ec76` |
| 54 | `SessionChannels.jsx` — selecting a channel crashes (a.map is not a function) | `b5c5e94` |
| 55 | `SessionChannels.jsx` — messages panel shows empty after fix | `f32ba48` |
| 56 | `ttlHours` column missing on existing production SessionContext tables | `latest` |
| 57 | `SessionChannels.jsx` uses wrong container class | `latest` |
| 58 | `SessionChannels.jsx` Refresh and Clear buttons have no icons | `latest` |
| 59 | Dashboard stat grid wraps to two rows | `latest` |
| 60 | `GET /mcp/tools` returns 500 — Integration include missing `as` alias | `latest` |
| 61 | `bin/cli.js --mcp` connects to DB directly instead of proxying | `1ce7757` |
| 62 | `mcp-depot --mcp` has no login flow | `latest` |
| 63 | `bin/cli.js` exposes env var options — remove | `c689f54` |
| 64 | `--login` prompt default URL wrong | `84ca05d` |
| 65 | `--mcp` proxy sends wrong auth header | `7cb8c79` |
| 66 | `bin/cli.js` requires `@modelcontextprotocol/sdk` but not in package.json | `379dc8c` |
| 66b | `bin/cli.js` imports wrong SDK export path | `b717e77` |
| 66c | Fix 66b used wrong resolve anchor | `a2ded38` |
| 67 | `npm i -g mcp-depot` fails — server dependencies missing | `d7a3838` |
| 68 | `mcp-depot` crashes on start — `pino-pretty` is devDependency only | `44c8ab0` |
| 69 | SQLite `data.db` created in wrong location | `787ac7c` |
| 70 | `bin/cli.js` requires `server/src/index.js` but `startServer()` never runs | `749e4ff` |
| 71 | Login fails after forced password reset | `58cfb63` |
| 72 | `context-cleanup` crashes — SessionContext table missing | `b327317` |
| 64b | `--login` should validate connection before saving config | `9878911` |
| 73 | Session tables missing on fresh SQLite install | `e609dac` |
| 74 | `Workflows.jsx` JSX build error — missing conditional wrapper | `6ad43cf` |
| 75 | Built-in MCP tools return "Not Found" — baseUrl hardcoded to port 3000 | `caaaa6d` |
| 75b | `list-tools` returns 401 via MCP client | `caaaa6d` |
| 75c | `list-tools` returns 401 via UI Run button | `eea2d72` |
| 76 | "PostgreSQL connected successfully" logged even on SQLite | `a67c3d3` |
| 77 | `sync({ alter: true })` runs when NODE_ENV unset | `a67c3d3` |
| 78 | `docker-compose.yml` uses old `mcpconnect` branding | `d6b8a3c` |
| 79 | `package.json` missing npm metadata | `d6b8a3c` |
| 80 | GitHub Actions CI broken | `23bc868` |
| 81 | Export/import missing skills, workflows, pinned contexts | `8bc4d89` |
| 82 | `--login` default URL ignores `--port` flag and previous config | `eb87300` |
| 83 | docker-compose.yml uses PostgreSQL 15 | `d1120db` |
| 84 | `spawn npm` ENOENT on Windows — shell:true needed | `aabec94` |
| 85 | No pre-flight check for missing npm/python | `aabec94` |
| 86 | nginx client proxy caches stale server IPs | `a7b0b3f` |
| 87 | Registration button visible on login page when API is unreachable | `01264e9` |
| 88 | `store-session-context` MCP tool exposes empty input schema | `3d63ef3` |
| 89 | Login form shows "Login failed" — `login` and `navigate` hooks never called | `9ea50e0` |
| 90 | TTL dropdown and Delete button never render for MCP-created contexts | latest |
| 91 | `input-sm` class missing from CSS — TTL dropdown unstyled | latest |
| 92 | Server-side ownership blocks mutations on MCP-created contexts | latest |
| 93 | `api.patch` called with token as body — TTL and share updates silently do nothing | latest |
| 94 | Owners cannot see expiry countdown — TTL dropdown replaces it entirely | latest |
| 95 | "Pin permanent" sessions show status "Expired" | latest |
| 96 | Session context detail popup is too narrow | latest |
| 97 | Contexts expire because MCP agent doesn't see ttlHours in response | latest |
| 98 | Updating pinned context via store resets TTL to 7 days | latest |
| 99 | `ttlHours: 0` arrives as string - strict === check fails | latest |
| 100 | Skills missing from export/import UI | latest |
| 101 | Import crashes with "Integration.config cannot be null" | latest |
| 102 | Import crashes with "Tool.integrationId cannot be null" | latest |
| 103 | Re-importing same file creates duplicate integrations; tools orphaned if integration already existed | latest |
| 104 | Post-import alert: "can't access property 'value', document.getElementById(...) is null" | latest |
| 106 | Integration credentials stored as plaintext | `latest` |
| 116 | `resolveWatcherCredentials` uses hardcoded env vars instead of DB integration credentials | `b87fc6e` |
| 117 | `fmtDuration` called but never defined — Connected Clients panel always empty | `484169b` |
| 118 | CLI proxy (`mcp-depot --mcp`) never populates `_sessionClientMap` — Connected Clients always empty | `484169b` |
| 119 | `startHttp` does not pass `req.body` as `parsedBody` — direct HTTP clients cannot initialize | `484169b` |
| 120 | Connected Clients panel shows `mcp-depot-cli` for all clients — real `clientInfo` never forwarded | `latest` |
| 121 | `_sessionClientMap` entries never expire — stale clients stay in panel after crash or disconnect | `latest` |

---

## Open Issues

---

### Issue 105 — `User.apiKey` stored as plaintext

**File:** `server/src/models/User.js:34`

**What is broken:** The user API key (`mcp_<64hex>`) is stored as plaintext in `users.apiKey`. Anyone with direct database access can read every user's active API key and impersonate them.

**Why:** `generateApiKey()` sets `this.apiKey = key` with no hashing. The `toJSON()` strip only prevents it appearing in API responses — the raw value is still in the DB.

**Fix:** Hash with SHA-256 on save (no need for bcrypt — the key is already high-entropy random). Show the plaintext key to the user once at generation time, then discard it. On auth, hash the incoming key and compare.

```js
// User.js — add to hooks.beforeSave:
if (user.changed('apiKey') && user.apiKey && !user.apiKey.startsWith('sha256:')) {
  const hash = crypto.createHash('sha256').update(user.apiKey).digest('hex');
  user._plaintextApiKey = user.apiKey;   // hold for one-time display
  user.apiKey = `sha256:${hash}`;
}

// auth.js — when verifying incoming key:
const hash = `sha256:${crypto.createHash('sha256').update(incomingKey).digest('hex')}`;
const user = await User.findOne({ where: { apiKey: hash, apiKeyEnabled: true } });
```

The `sha256:` prefix distinguishes hashed values from any legacy plaintext rows during migration.

---

### Issue 106 — Integration credentials stored as plaintext

**File:** `server/src/models/Integration.js`, `server/src/routes/integrations.js`

**What is broken:** `Integration.config.auth.credentials` (API keys, passwords, tokens for Jira, Jenkins, GitHub etc.) are stored as raw JSON in the `config` JSONB column. `encryption.js` is imported in `integrations.js` but never applied to credential storage.

**Why:** The encrypt/decrypt calls were never wired into the save/load path.

**Fix:** Add Sequelize hooks on the `Integration` model to encrypt credentials before write and decrypt after read. Encrypt only `config.auth.credentials`, not the whole config (baseUrl, timeout etc. don't need it).

```js
// Integration.js — add hooks to sequelize.define options:
hooks: {
  beforeSave: (integration) => {
    if (integration.changed('config') && integration.config?.auth?.credentials) {
      const encryption = require('../services/encryption');
      const config = JSON.parse(JSON.stringify(integration.config));
      config.auth.credentials = encryption.encryptObject(config.auth.credentials);
      integration.config = config;
    }
  },
  afterFind: (result) => {
    const encryption = require('../services/encryption');
    const instances = Array.isArray(result) ? result : [result];
    for (const i of instances.filter(Boolean)) {
      if (i?.config?.auth?.credentials) {
        i.config = { ...i.config, auth: { ...i.config.auth,
          credentials: encryption.decryptObject(i.config.auth.credentials) } };
      }
    }
  }
}
```

Requires `ENCRYPTION_KEY` to be set (already enforced in `config/env.js` for production).

---

### Issue 107 — `prompts/get` MCP handler fetches private prompts

**File:** `server/src/mcp/server.js:591`

**What is broken:** `prompts/get` retrieves a prompt by name with no `isShared` filter. Only shared prompts appear in `prompts/list`, but any MCP client that knows (or guesses) a private prompt's name can call `prompts/get` and retrieve its full template.

**Why:** The `findOne` query is missing the `isShared: true` condition present in `prompts/list`.

**Fix:**
```js
// mcp/server.js:593 — add isShared filter
const prompt = await PromptLibrary.findOne({ where: { name, isShared: true } });
```

---

### Issue 108 — `PromptLibrary` has no unique constraint on `name`

**File:** `server/src/models/PromptLibrary.js`

**What is broken:** Two prompts can be created with the same `name`. The `prompts/get` MCP handler calls `findOne({ where: { name } })` which silently returns whichever record was created first when duplicates exist.

**Fix:** Add a unique index. If prompts are per-user, scope it to `(name, userId)`:

```js
// PromptLibrary.js — add to sequelize.define options:
indexes: [{ unique: true, fields: ['name', 'userId'] }]
```

Also add a migration for the new index.

---

### Issue 109 — `PUT /:id` prompt update cannot clear fields to empty

**File:** `server/src/routes/prompt-library.js:94-98`

**What is broken:** The update uses `||` fallback which treats `""` and `[]` as falsy, falling back to the existing value. It is impossible to clear `inputs` to an empty array or set `prompt` to a shorter string that JavaScript coerces to falsy.

**Fix:** Use explicit `undefined` checks:
```js
name:        name        !== undefined ? name        : existingPrompt.name,
description: description !== undefined ? description : existingPrompt.description,
inputs:      inputs      !== undefined ? inputs      : existingPrompt.inputs,
prompt:      prompt      !== undefined ? prompt      : existingPrompt.prompt,
isShared:    isShared    !== undefined ? isShared    : existingPrompt.isShared,
```

---

### Issue 110 — Binary response mis-detected on non-binary path

**File:** `server/src/mcp/server.js:275-280`

**What is broken:** When `binaryOpt` is not set, the code checks `isBinary(contentType)` after axios has already parsed the response body as JSON. If triggered, it does `Buffer.from(JSON.stringify(data)).toString('base64')` — JSON-stringifying already-parsed data and then base64-encoding the JSON string. The client receives base64-encoded JSON text, not binary content.

**Why:** Binary detection should happen before parsing, not after. If axios parsed `data` it is already a JS object; re-serialising it to JSON before encoding is wrong.

**Fix:** Remove the post-parse binary fallback entirely (lines 275-280). Binary responses must use the `binaryOpt: true` flag on the tool descriptor, which uses `adapter.fetchBinary()` and reads raw bytes before any parsing:

```js
// Remove this block from mcp/server.js:
const contentType = result.headers?.['content-type'] || '';
if (isBinary(contentType)) {
  const buf = Buffer.from(JSON.stringify(data));
  const b64 = buf.toString('base64');
  return buildBinaryResult(b64, contentType);
}
```

---

### Issue 111 — `fieldFilter.js` silently drops intermediate array paths

**File:** `server/src/utils/fieldFilter.js`

**What is broken:** Paths where an intermediate field is an array (e.g. `"comments.body"` where `obj.comments` is an array of objects) return an empty result. The array detection check fires at the start of each loop iteration on `src` before stepping, so by the time `src` becomes an array after stepping into a field, the loop has ended and the leaf is never extracted.

**Why:** The loop iterates `i < parts.length - 1` and checks `Array.isArray(src)` at the top. After the final step, if `src` is now an array, the post-loop `if (!Array.isArray(src))` guard skips the leaf extraction.

**Fix:** After the traversal loop, if `src` is an array, map `filterFields` recursively over each element for the remaining path suffix:

```js
if (Array.isArray(src)) {
  const leaf = parts.at(-1);
  dst[parts[parts.length - 2]] = src.map(item =>
    item != null && leaf in item ? { [leaf]: item[leaf] } : {}
  );
}
```

---

### Issue 112 — Rate limiter not wired into MCP tool execution

**File:** `server/src/services/rate-limiter.js`, `server/src/mcp/server.js`

**What is broken:** `checkRateLimit` is defined but does not appear to be called during MCP tool execution in `mcp/server.js`. Rate limits configured on tool or integration descriptors have no effect.

**Verify:** Search for `checkRateLimit` calls outside of `rate-limiter.js` itself. If absent, wire it into `executeTool()` before the adapter call:

```js
// mcp/server.js — in executeTool(), before making the HTTP call:
const { checkRateLimit } = require('../services/rate-limiter');
const rl = checkRateLimit(tool.id, userId, tool.rateLimit?.requestsPerMinute);
if (!rl.allowed) {
  throw new Error(`Rate limit exceeded. Retry in ${rl.resetIn}s.`);
}
```

Also note: only a per-minute window is implemented. The per-hour window from the feature spec is missing.

---

### Issue 113 — `DataTypes.JSONB` on `inputs` field breaks SQLite

**File:** `server/src/models/PromptLibrary.js:22`

**What is broken:** `inputs` uses `DataTypes.JSONB` which is PostgreSQL-specific. On SQLite, Sequelize silently stores it as TEXT — serialisation works, but direct SQL queries on the column fail and behaviour can differ from PostgreSQL in edge cases.

**Fix:**
```js
inputs: { type: DataTypes.JSON, defaultValue: [] }
```

`DataTypes.JSON` works correctly on both PostgreSQL and SQLite.

---

### Issue 114 — `refreshTools()` accumulates duplicate tool registrations

**File:** `server/src/mcp/server.js:656`

**What is broken:** `refreshTools()` clears `this.toolsMap` but does not unregister tools already registered on the `McpServer` instance via `server.tool()`. Each call to `refreshTools()` re-registers all tools on top of the existing registrations. The SDK does not expose a first-class unregister API.

**Fix (workaround):** Re-create the `McpServer` instance on each refresh and reconnect the transport, or track registered tool names in `toolsMap` and skip re-registration if the name is already present and the tool definition is unchanged:

```js
// In registerTool — skip if already registered and unchanged:
if (this.toolsMap.has(toolName)) return;
```

This prevents duplicate handlers accumulating across refreshes while accepting that removed tools stay registered until server restart. A fuller fix requires recreating the server instance.

---

### Issue 115 — `callerType` hardcoded to `'mcp'` — client identity never captured

**File:** `server/src/mcp/server.js:307` (and composite/consume paths)

**What is broken:** Every tool call is logged with `callerType: 'mcp'` regardless of which AI client made the call. Claude Code, opencode, Cursor, and Zed are all indistinguishable in the audit log and analytics. The `ToolCall` table has the field but it carries no useful information.

**Why:** The MCP `initialize` handshake delivers `clientInfo.name` and `clientInfo.version` from the connecting client, but MCPHUB never reads or stores it.

**Fix:**

1. Add a session→clientInfo map in `mcp/server.js` and intercept `initialize` to populate it:

```js
// mcp/server.js — add at class level
this._sessionClientMap = new Map();

// In initialize(), after creating this.server:
const { InitializeRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
this.server.server.setRequestHandler(InitializeRequestSchema, async (req, extra) => {
  const clientInfo = req.params?.clientInfo;
  const sessionId = extra?.sessionId;
  if (sessionId && clientInfo) {
    this._sessionClientMap.set(sessionId, clientInfo);
  }
  return this.server.server._defaultInitializeHandler(req, extra);
});
```

2. Pass `sessionId` into `executeTool()` from the tool handler (the SDK passes `extra` as a second argument to tool handlers):

```js
this.server.tool(toolName, schema, async (params, extra) => {
  const clientInfo = this._sessionClientMap.get(extra?.sessionId) ?? { name: 'unknown' };
  const result = await this.executeTool(tool, params, clientInfo);
  ...
});
```

3. In `logToolCall`, replace `callerType: 'mcp'` with:

```js
callerType: clientInfo.name ?? 'mcp',
// optionally add callerVersion: clientInfo.version
```

4. For stdio transport, `sessionId` is not present — fall back to reading `clientInfo` once at connect time and storing it as `this._stdioClientInfo`.

---

### Issue 117 — `fmtDuration` called but never defined — Connected Clients panel always empty

**File:** `server/src/mcp/server.js:815`

**What is broken:** `getActiveSessions()` calls `fmtDuration(...)` to format the uptime of each session, but `fmtDuration` is neither defined in the file nor imported. Every call to `getActiveSessions()` throws `ReferenceError: fmtDuration is not defined`. The route catches the error and returns HTTP 500. The Dashboard gets an error response, keeps `clients = []`, and shows "No clients connected yet" even when clients are active.

**Fix:** Define the helper inline (it only needs to format a millisecond duration into a human-readable string):

```js
// Add near top of file, after requires:
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
```

---

### Issue 118 — CLI proxy (`mcp-depot --mcp`) never populates `_sessionClientMap` — Connected Clients always empty for typical users

**File:** `bin/cli.js` — `startMcpProxy()`

**What is broken:** The `mcp-depot --mcp` CLI proxy creates its own standalone MCP `Server` with a `StdioServerTransport` and serves tools directly to the AI client (Claude Code). It forwards tool execution to the Docker server via the REST endpoint `POST /api/mcp/execute`. The Docker server's HTTP MCP endpoint (`/mcp`) is never contacted, so the `initialize` handshake never reaches the Docker server's `_sessionClientMap`. The Connected Clients panel is always empty for the majority of users who connect via the CLI proxy.

**Why:** The developer implemented the session map on the Docker server's HTTP transport (`MCPDepotServer._sessionClientMap`), but the CLI proxy is an independent MCP server process — the Docker server has no visibility into clients connected through it.

**Fix:** Register the proxy as a connected client via REST when it starts, and deregister when it exits:

```js
// bin/cli.js — inside startMcpProxy(), after loading tools successfully:
async function registerClient() {
  try {
    await fetch(`${MCP_DEPOT_URL}/sessions/register`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName: 'mcp-depot-cli', clientVersion: require('../package.json').version })
    });
  } catch { /* non-fatal */ }
}
async function deregisterClient() {
  try {
    await fetch(`${MCP_DEPOT_URL}/sessions/register`, { method: 'DELETE', headers });
  } catch { /* non-fatal */ }
}
registerClient();
process.on('exit', deregisterClient);
process.on('SIGINT', () => { deregisterClient(); process.exit(0); });
```

Add the corresponding `POST /sessions/register` and `DELETE /sessions/register` endpoints to `server/src/routes/mcp.js`, storing entries in the same `mcpServer._sessionClientMap` used by the HTTP transport handler.

---

### Issue 119 — `startHttp` does not pass `req.body` as `parsedBody` — direct HTTP connections cannot send `initialize`

**File:** `server/src/mcp/server.js` — `startHttp()`

**What is broken:** Express's global `express.json()` middleware parses and consumes the request body stream before the MCP transport's handler runs. The transport then tries to re-read the body from the web request stream (which is now empty) and returns a 400 "Parse error: Invalid JSON" response. Any client connecting directly to the HTTP MCP endpoint (`/mcp`) gets a 400 on `initialize` and cannot establish a session.

**Fix:** Pass the already-parsed body as the third argument to `handleRequest`:

```js
// server/src/mcp/server.js — in startHttp():
app.post('/mcp', (req, res) => transport.handleRequest(req, res, req.body));
app.get('/mcp',  (req, res) => transport.handleRequest(req, res));
app.delete('/mcp', (req, res) => transport.handleRequest(req, res));
```

`StreamableHTTPServerTransport.handleRequest` accepts an optional third `parsedBody` argument for exactly this case — when a body-parser middleware has already consumed the stream.

---

### Issue 120 — Connected Clients panel shows `mcp-depot-cli` for all clients instead of actual client name

**File:** `bin/cli.js` — `startMcpProxy()`

**What is broken:** Every client that connects via `mcp-depot --mcp` is listed in the Connected Clients panel as `mcp-depot-cli`, regardless of the actual AI client (Claude Code, OpenCode, Cursor, Zed, etc.). The panel is not useful for identifying who is connected.

**Why:** The CLI proxy creates its own local MCP `Server` + `StdioServerTransport`. When the real AI client connects, it sends `initialize` with its `clientInfo` (e.g. `{ name: "claude-code", version: "1.x" }`). The CLI proxy receives this during the handshake but discards it - when it registers with the Docker server via `POST /sessions/register`, it sends the hardcoded string `'mcp-depot-cli'` instead of the real client name.

**Fix:** Intercept the `initialize` request on the local server, capture `clientInfo`, and use it in the register call:

```js
// bin/cli.js — inside startMcpProxy(), after creating the local server:
const { InitializeRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

let actualClientName = 'mcp-depot-cli';
let actualClientVersion = pkg.version;

// Intercept initialize to capture real client identity
server.server.setRequestHandler(InitializeRequestSchema, async (request, extra) => {
  if (request.params?.clientInfo?.name) {
    actualClientName = request.params.clientInfo.name;
    actualClientVersion = request.params.clientInfo.version || '';
    // Re-register with the real client name now that we know it
    await registerClient(actualClientName, actualClientVersion);
  }
  // Delegate to the default handler
  return {
    protocolVersion: request.params.protocolVersion,
    serverInfo: { name: 'mcp-depot', version: pkg.version },
    capabilities: server.server.getClientCapabilities() ?? {}
  };
});
```

Update `registerClient` to accept name/version parameters:

```js
async function registerClient(clientName = 'mcp-depot-cli', clientVersion = pkg.version) {
  try {
    const res = await fetch(`${MCP_DEPOT_URL}/sessions/register`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: registeredSessionId, clientName, clientVersion })
    });
    if (res.ok) {
      const data = await res.json();
      registeredSessionId = data.sessionId;
    }
  } catch { /* non-fatal */ }
}
```

With this fix, Claude Code will show as `claude-code`, OpenCode as `opencode`, etc. The heartbeat re-register should also use the captured name so it persists across server restarts.

---

### Issue 121 — `_sessionClientMap` entries never expire — stale clients stay in panel after crash or disconnect

**Files:** `server/src/mcp/server.js`, `server/src/routes/mcp.js`, `bin/cli.js`

**What is broken:** Entries in `_sessionClientMap` are never automatically removed. Two cases leave stale entries permanently:

1. **CLI proxy crash / SIGKILL** - `bin/cli.js` calls deregister on `process.exit` and `SIGINT`, but not on SIGKILL or a hard crash. The entry stays until the Docker container restarts.
2. **Direct HTTP client disconnect** - When a client connects directly to `/mcp`, the session is added on `initialize` but there is no listener for transport close to remove it.

**Fix A - TTL / last-seen expiry (covers CLI crash path):**

Add `lastSeenAt` timestamp to each entry. The existing 60s heartbeat in `bin/cli.js` bumps it on each re-register. A cleanup interval on the server removes entries silent for >150s:

```js
// mcp/server.js — cleanup interval (add to constructor):
setInterval(() => {
  const cutoff = Date.now() - 150_000;
  let changed = false;
  for (const [id, entry] of this._sessionClientMap) {
    if (entry.lastSeenAt < cutoff) {
      this._sessionClientMap.delete(id);
      changed = true;
    }
  }
  if (changed) this._broadcastSessions();
}, 30_000);

// _sessionClientMap entry shape — add lastSeenAt:
this._sessionClientMap.set(id, { clientInfo, connectedAt: Date.now(), lastSeenAt: Date.now() });

// routes/mcp.js — POST /sessions/register — bump lastSeenAt on heartbeat:
if (existing) {
  existing.lastSeenAt = Date.now();
} else {
  sessionClientMap.set(id, { clientInfo, connectedAt: Date.now(), lastSeenAt: Date.now() });
}
```

**Fix B - Transport close listener (covers direct HTTP disconnect):**

```js
// mcp/server.js — in startHttp(), after creating transport:
transport.onclose = () => {
  if (transport.sessionId) {
    this._sessionClientMap.delete(transport.sessionId);
    this._broadcastSessions();
  }
};
```

Check the SDK source for exact event name (`onclose` callback vs `transport.on('close', ...)`).

Fix A alone is sufficient for CLI proxy users. Fix B makes direct HTTP connections clean up promptly rather than waiting for the 150s TTL.

