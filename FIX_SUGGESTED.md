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
| 26 | N+1 queries in integrations list (already uses batch queries) | latest |
| 27 | Per-user credentials broken at MCP tool execution - missing JSON.parse | latest |
| 28 | Body template substitution corrupts values containing `{word}` patterns - recursive walker used | latest |
| 34 | External MCP servers cause GET /mcp/tools to time out - parallel fetching | latest |
| 35 | Body params sent to query instead of body; OpenAPI type mapping | latest |
| 36 | Tool execution catch block returns [object Object] - error serialization fixed | latest |
| 37 | Monitoring page should show actual upstream API response | latest |
| 38 | POST body merges template result AND all flat param keys; nulls in body | latest |
| 38b | Optional params leave null nodes in resolved body template | latest |
| 38c | Non-null default params added as flat body keys on top of template | latest |
| 38d | Fixes 38/38b/38c applied to wrong file — Claude Code uses `mcp/server.js` not `mcp.js` | latest |
| 38e | Same flat-param body merge bug exists in `consume.js` and `compositeExecutor.js` — both unfixed | latest |
| 39 | Template substitution always produces strings — number/boolean params serialised as `"786047927"` not `786047927` | latest |
| 40 | Session context MCP tools return 401 when MCP auth mode is required | `a5e5ae7` |
| 41 | Ownerless contexts invisible in admin UI and list/get MCP tools | `de20e7a` |
| 42 | Session Contexts empty state references Claude by name | `72e830c` |
| 43 | `list-session-contexts` MCP response omits TTL info — `ttlHours` and `expiresAt` missing | `5827ac3` |
| 44 | `SessionContexts.jsx` does not display TTL — Expires column and live countdown missing | `6566f74` |
| 45 | Sidebar: Contexts and Channels added as flat items instead of collapsible Sessions group | `816ef6e` |
| 46 | `SessionChannels.jsx` uses undeclared CSS classes — page renders unstyled | `816ef6e` |
| 47 | `SessionContexts.jsx` emojis not replaced with Lucide icons as specified | `816ef6e` |
| 48 | `read-channel` and `clear-channel` broken — path param `:channel` not substituted by tool execution engine | `3b6346c` |
| 48b | `read-channel` still broken after fix — DB seed rows not refreshed, old path still in database | `1709d79` |
| 49 | Issue 45 partial — sidebar is a static section, not a collapsible group; wrong icons (Database/Hash instead of Layers/FileStack/MessagesSquare) | `907bbbe` |
| 50 | Issue 47 partial — empty state uses `<Database>` instead of `<MessageSquare>`; modal uses text badges instead of `<Globe>`/`<Lock>` icon components | `907bbbe` |
| 51 | `SessionChannels.jsx` still uses `page-container` and `page-subtitle` — no CSS defined for those classes | `907bbbe` |
| 52 | Issue 50 partial — `Globe`/`Lock` imported in `SessionContexts.jsx` but never rendered; modal badge shows text only, no icons | `716ec76` |
| 53 | Dead code in `SessionChannels.jsx` — `messages.messages?.map(...)` branch unreachable; unused `Database` import in `Sidebar.jsx` | `716ec76` |
| 54 | `SessionChannels.jsx` — selecting a channel crashes with `TypeError: a.map is not a function` — `loadMessages` sets state to full axios object, not the data array | `b5c5e94` |
| 55 | `SessionChannels.jsx` — messages panel shows empty after fix 54 — `res?.messages` is still wrong, must use `res?.data` | `f32ba48` |
| 56 | `ttlHours` column missing on existing production `SessionContext` tables | latest |
| 57 | `SessionChannels.jsx` uses wrong container class — page starts flush against the sidebar | latest |

---

## Open Issues

(None)

---

### Issue 57 — `SessionChannels.jsx` uses wrong container class

**What is broken:**

The Channels page starts flush against the sidebar with no left padding or top
spacing. Every other page (Dashboard, Tools, Integrations, Session Contexts, etc.)
has consistent spacing from the sidebar and a page title area.

**Why it is broken:**

`SessionChannels.jsx` wraps its content in `<div className="page-container">` and
uses `<p className="page-subtitle">` for the description. These are non-standard
classes — no styles are defined for them. The correct classes used across all other
pages are `container` (outer wrapper) and `page-header` (title + subtitle block).

**The fix — `client/src/pages/SessionChannels.jsx`:**

Change the outer wrapper and title structure to match every other page:

```jsx
// Before
<div className="page-container">
  <h1>Session Channels</h1>
  <p className="page-subtitle">
    Append-only logs shared across AI sessions...
  </p>

// After
<div className="container">
  <div className="page-header">
    <h1>Session Channels</h1>
    <p>Append-only logs shared across AI sessions...</p>
  </div>
```

No CSS changes needed — `container` and `page-header` are already defined and used
by all other pages.

---

### Issue 56 — `ttlHours` missing on existing production databases

**What is broken:**

TTL expiry is silently non-functional on any deployment where the `SessionContext`
table existed before `ttlHours` was added to the model. The column is not in the
table, so `store-session-context` never persists a TTL value and the cleanup job
never expires any context.

**Why it is broken:**

The app uses `sequelize.sync({ force: false })` in production, which only creates
tables that do not yet exist. It does NOT add columns to existing tables. Development
uses `sync({ alter: true })` which does add columns automatically — so the bug is
invisible in dev and only surfaces in production upgrades.

The migration files in `server/src/migrations/` are not run at server startup
(no Umzug or sequelize-cli wiring in `index.js` or `database.js`). They exist for
reference only. So there is no automatic path for the column to be added on upgrade.

**Who is affected:**

Any instance where `SessionContext` was created (i.e. the table already exists)
before `ttlHours` was added to the model. Fresh installs are fine — `sync({ force: false })`
creates the full table including `ttlHours` on first run.

**The fix — two options:**

Option A (recommended): run a one-time manual SQL on existing databases:
```sql
ALTER TABLE SessionContext ADD COLUMN ttlHours INTEGER NULL;
```

Option B: wire the migration files into server startup using Umzug so future schema
changes are applied automatically on upgrade. This is the proper long-term fix but
is a larger change. See the existing migration files in `server/src/migrations/` for
the pattern — they already implement `up` and `down`.

**Verification:** after applying the fix, call `store-session-context` with a short
`ttlHours` value (e.g. `1`), then check the database row — `ttlHours` should be `1`,
not `NULL`.

---

### Issue 55 — Messages panel shows empty after fix 54 — `res?.messages` still wrong ✅ RESOLVED (`f32ba48`)

**Status:** Open

**Symptom:**

After fix `b5c5e94`, clicking a channel no longer crashes. But the right panel shows
"No messages yet." even when the channel shows "1 msgs" in the left panel.

**Root cause:**

The fix for issue 54 changed the line to:

```js
const data = Array.isArray(res) ? res : (res?.messages || []);
```

`res` is still the full axios response object `{ data: [...], status: 200, headers, config, request }`.
`Array.isArray(res)` → false.
`res?.messages` → `undefined` (axios response objects have no `.messages` property).
`data = []`.

The crash is gone but messages are still never extracted. The correct property is `res.data`,
which is where axios puts the parsed JSON response body.

The admin route (`GET /api/session-channels/:channel` in `session-channel.js`) returns:

```js
res.json(messages);  // plain JSON array of message objects
```

Axios receives this as `response.data = [{id, channel, message, createdAt, ...}, ...]`.

**Compare with `loadChannels` in the same file, which works correctly:**

```js
const data = Array.isArray(res) ? res : (res?.data || res?.channels || []);
//                                             ↑ res.data — correct
```

**The fix — `client/src/pages/SessionChannels.jsx`, `loadMessages` function, line ~31:**

```js
// Replace:
const data = Array.isArray(res) ? res : (res?.messages || []);

// With:
const data = Array.isArray(res?.data) ? res.data : (res?.data?.messages || res?.messages || []);
```

This:
1. Checks if `res.data` is already a plain array (admin route) — uses it directly
2. Falls back to `res.data.messages` if it's an object with messages array (MCP route format)
3. Falls back to `res.messages` as a last resort for unusual response shapes
