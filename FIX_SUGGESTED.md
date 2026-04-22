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
| 54 | `SessionChannels.jsx` — selecting a channel crashes with `TypeError: a.map is not a function` — `loadMessages` sets state to full axios object, not the data array | open |

---

### Issue 44 — `SessionContexts.jsx` does not display TTL

**What is broken:**

The admin UI `Session Contexts` page has no Expires column. The API now returns
`ttlHours` and `expiresAt` on every row but the UI ignores them.

**The fix** — three changes to `client/src/pages/SessionContexts.jsx`:

**1. Add `expiryInfo` helper and `now` ticker** (above the component):

```jsx
function expiryInfo(ctx, now) {
  if (ctx.ttlHours == null) return { label: 'Pinned', urgency: 'pinned' };
  const expiresAt = new Date(ctx.updatedAt).getTime() + ctx.ttlHours * 3600000;
  const msLeft = expiresAt - now;
  if (msLeft <= 0) return { label: 'Expired', urgency: 'urgent' };
  const hLeft = msLeft / 3600000;
  if (hLeft < 1) {
    const mLeft = Math.ceil(msLeft / 60000);
    return { label: `${mLeft}m`, urgency: 'urgent' };
  }
  if (hLeft < 24) {
    const h = Math.floor(hLeft);
    const m = Math.floor((hLeft - h) * 60);
    return { label: `${h}h ${m}m`, urgency: 'soon' };
  }
  const d = Math.floor(hLeft / 24);
  const h = Math.floor(hLeft % 24);
  return { label: `${d}d ${h}h`, urgency: 'ok' };
}
```

**2. Add `now` state inside the component** (alongside existing useState calls):

```jsx
const [now, setNow] = useState(Date.now());

useEffect(() => {
  const t = setInterval(() => setNow(Date.now()), 60000);
  return () => clearInterval(t);
}, []);
```

**3. Add Expires column to the table** — add `<th>Expires</th>` to the header and
this `<td>` to each row (inside the `contexts.map`):

```jsx
// In <thead>:
<th>Expires</th>

// In <tbody> row (after Visibility td):
<td>
  {(() => {
    const { label, urgency } = expiryInfo(ctx, now);
    return <span className={`expiry expiry-${urgency}`}>{label}</span>;
  })()}
</td>
```

And in the modal `modal-meta` section, add:

```jsx
{(() => {
  const { label, urgency } = expiryInfo(selected, now);
  return <span>Expires: <span className={`expiry expiry-${urgency}`}>{label}</span></span>;
})()}
```

**4. Add CSS** to `client/src/index.css`:

```css
.expiry { font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.expiry-pinned { color: var(--text-light); }
.expiry-ok     { color: var(--text-light); }
.expiry-soon   { color: var(--warning, #d97706); font-weight: 600; }
.expiry-urgent { color: var(--danger,  #e53e3e); font-weight: 600; }
```

Full updated component is in `FEATURES.md` — Implementation Guide, section 5.

---

### Issue 43 — `list-session-contexts` response omits TTL fields

**What is broken:**

The MCP `list-session-contexts` handler (`GET /api/mcp/session-contexts/list`) maps rows
to a response object that does not include `ttlHours` or `expiresAt`. Claude cannot warn
the user about expiring contexts because it has no expiry data to work with.

**Why it is broken:**

The response mapping was written before the TTL design was finalised. The `ttlHours`
column exists on the model but was never included in the list response.

**The fix** — in `server/src/routes/mcp.js`, update the mapping inside the list handler:

```js
res.json(all.map(c => {
  const expiresAt = c.ttlHours != null
    ? new Date(new Date(c.updatedAt).getTime() + c.ttlHours * 3600000).toISOString()
    : null;
  return {
    name:      c.name,
    isShared:  c.isShared,
    mine:      callerId ? c.createdBy === callerId : false,
    updatedAt: c.updatedAt,
    ttlHours:  c.ttlHours,   // null = pinned (never expires)
    expiresAt,               // ISO timestamp of expiry, or null if pinned
    chars:     c.content.length
  };
}));
```

`expiresAt` is a pre-computed ISO timestamp so Claude does not need to do arithmetic —
it can directly compare `expiresAt` to the current time and warn the user if expiry
is within 24 hours.

---

### Issue 28 — Body template substitution corrupts values containing `{word}` patterns ✅ RESOLVED

**Fixed in:** The `substituteBodyTemplate` recursive function at line 39 (lines 1068-1070 use it).

**What was fixed:** Changed two-pass string regex to recursive object walker - substitute once, never re-scan.

---

### Issue 34 — External MCP servers cause `GET /mcp/tools` to time out ✅ RESOLVED (8fb3fd)

**Fixed in commit:** 8fb319

---

**Files:**
- `server/src/routes/mcp.js` lines 171-337 (`fetchExternalMcpTools`, `getStdioMcpTools`)

**What is broken:**

Adding one or more external MCP servers (stdio or HTTP) causes `GET /mcp/tools` to hang or time out. The more servers added, the worse it gets. Claude Code's tool listing call fails entirely.

**Why it is broken:**

Three compounding problems in `fetchExternalMcpTools`:

**Problem 1 — Sequential fetching (critical)**

The function loops through servers with `await` inside a `for...of`:

```js
// mcp.js ~line 180
for (const server of servers) {
  if (server.transportType === 'stdio') {
    const tools = await getStdioMcpTools(...);   // blocks until this server responds
    ...
  }
  const response = await fetch(toolsUrl, ...);   // blocks until this server responds
}
```

Total time = sum of all server response times. With 3 servers each taking 5 seconds: **15 seconds minimum**. With any one server timing out at 10s: the entire request stalls for 10s before moving to the next.

**Problem 2 — Stdio timeout ignores the parent AbortController**

HTTP calls correctly use a 10s `AbortController` signal. Stdio calls do not — the signal is created but never passed to `getStdioMcpTools`, which uses its own hardcoded 30s timeout:

```js
// mcp.js ~line 182-186
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), fetchTimeout); // 10s
const tools = await getStdioMcpTools(server.command, server.args, ...);
// ↑ controller.signal never passed — stdio server can hang for 30s
```

**Problem 3 — DB writes inside the sequential loop**

Every iteration calls `await server.update(...)` to persist `lastFetchedAt` / `lastFetchError`. With N servers this adds N sequential DB round-trips on top of the network waits.

**The fix:**

**Step 1 — Refactor `fetchExternalMcpTools` to fetch all servers in parallel**

Extract per-server logic into a helper and use `Promise.allSettled`:

```js
async function fetchExternalMcpTools(servers, fetchTimeout = 10000) {
  const allTools = [];

  async function fetchOne(server) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), fetchTimeout);
    try {
      let tools = [];
      if (server.transportType === 'stdio') {
        tools = await getStdioMcpTools(
          server.command, server.args, server.env, server.runtime,
          controller.signal  // ← pass signal so stdio respects the same timeout
        );
      } else {
        const toolsUrl = `${server.url.replace(/\/$/, '')}/tools`;
        const headers  = server.authHeader ? { Authorization: server.authHeader } : {};
        const response = await fetch(toolsUrl, { headers, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        tools = data.tools || [];
      }
      await server.update({ lastFetchedAt: new Date(), lastFetchError: null });
      return tools.map(tool => ({ ...tool, _source: server.name }));
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Timeout' : err.message;
      await server.update({ lastFetchError: msg });
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fetch all servers in parallel — total time = slowest single server
  const results = await Promise.allSettled(servers.map(fetchOne));
  for (const result of results) {
    if (result.status === 'fulfilled') allTools.push(...result.value);
  }
  return allTools;
}
```

**Step 2 — Pass `signal` into `getStdioMcpTools`**

Add a `signal` parameter and wire it to `proc.kill()` when aborted:

```js
async function getStdioMcpTools(command, args, envVars, runtime = 'node', signal = null) {
  return new Promise((resolve, reject) => {
    // ... existing spawn logic ...

    if (signal) {
      signal.addEventListener('abort', () => {
        try { proc.kill(); } catch (e) {}
        reject(new Error('Timeout'));
      }, { once: true });
    }

    // Keep internal timeout as a backstop — reduce from 30s to 10s
    setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      reject(new Error('Stdio timeout'));
    }, 10000);  // was 30000
  });
}
```

**Before vs After:**

| Scenario | Before | After |
|----------|--------|-------|
| 3 servers × 5s each | 15s (sequential) | 5s (parallel) |
| 1 server hangs at 30s | 30s blocked | 10s, then continues |
| 5 servers, 1 times out | 40s+ total | 10s total |

**Impact:** Any MCPConnect instance with more than one external MCP server configured. Symptoms worsen with each additional server added.

---

### Issue 35 — Body params always sent as query string; body template substitution does not happen for `"in": "query"` params ✅ RESOLVED

**Fixed in:** Execution layer - params in body template now always go to body (not query). OpenAPI importer - integer now maps to number.

**Changes:**
1. **Execution layer (mcp.js)**: If param key IS in bodyTemplateVars, it stays in body for substitution - never goes to queryParams
2. **OpenAPI importer (openapi-parser.js)**: Added `mapOpenApiType()` to correctly map `integer` → `number`, `boolean` → `boolean`

---

### Issue 36 — Tool execution catch block returns `[object Object]` — actual API error is swallowed ✅ RESOLVED

**Fixed in:**
- `server/src/adapters/DynamicAdapter.js` - both catch blocks now serialize error response data
- `server/src/routes/mcp.js` - execution route catch blocks now show actual API error details

**Changes:**
- Error serialization now checks `error?.response?.data` first, stringifies it, falls back to `error.message` or `String(error)`

---

### Feature Request 37 — Monitoring page should show actual upstream API response, not just the wrapped MCP error ✅ RESOLVED

**Fixed in:**
- Error serialization now shows actual API error details (Issue 36)
- Monitoring expanded view shows: path, query params, request body, response body
- Full URL is now logged and displayed

**Status:** Feature request

**Problem:**

The monitoring/logs page currently shows the error that MCPConnect returns to the MCP client (e.g. `[object Object]` or a wrapped message). It does not show:
- The HTTP status code returned by the upstream API (e.g. Bitbucket, Jira)
- The raw response body from the upstream API
- The exact request that was sent (URL, headers minus secrets, body)

This means when a tool call fails, the only way to diagnose it is to add `console.log` to the server or rely on Issue 36's error serialisation fix. Even with Issue 36 fixed, Claude sees the error but the developer watching the monitoring page still can't see the full upstream context.

**Requested behaviour:**

Each tool execution log entry in the monitoring page should show:

| Field | Example |
|-------|---------|
| Tool name | `Create a comment on a pull request` |
| MCP call status | `error` / `success` |
| Upstream request URL | `POST https://api.bitbucket.org/2.0/repositories/…` |
| Upstream HTTP status | `400 Bad Request` |
| Upstream response body | `{"type":"error","error":{"message":"content.raw is required"}}` |
| Duration | `312ms` |

Secrets (Authorization header value, tokens) should be redacted — show the header name but not the value.

**Implementation notes:**

- The execution route in `mcp.js` already has the request/response at the point of the API call — capture it there before throwing
- Store it alongside the existing log entry (or add new columns to the logs table)
- The monitoring UI just needs to expand the existing log row to show upstream detail
- For errors specifically, the upstream response body is the highest-value field — even logging just that to the existing error message would be a significant improvement

---

### Issue 38 — POST body merges template result AND all flat param keys — APIs reject unrecognised fields ✅ RESOLVED

**Fixed in:** `server/src/routes/mcp.js`

**Changes:**
1. Added null/undefined guard: `if (value === null || value === undefined) continue;` - skips null params
2. Template-consumed keys (bodyTemplateVars) already handled (Issue 35) - never added as flat keys
3. Added `pruneNulls()` function to remove null nodes after template substitution

---

### Issue 38b — Optional params not provided by caller leave null/placeholder nodes in the resolved body template ✅ RESOLVED

**Fixed in:** `server/src/routes/mcp.js` - `pruneNulls()` function added and applied after template substitution

---

### Issue 38c — Params with non-null default values still added as flat body keys when a body template exists ✅ RESOLVED

**Fixed in:** `server/src/routes/mcp.js` — added `hasBodyTemplate` check before the fallthrough

**Root cause — `mcp.js` line 1086:**

```js
} else if (key !== 'workspace' && key !== 'repo_slug') {
  bodyParams[key] = value;  // ← fires for ANY non-null param not in the template
}
```

This fallthrough runs for every param that is not null, not a path param, not in `bodyTemplateVars`, and has no `transformConfig`. Auto-imported OpenAPI params (`id`, `type`, `user`, `deleted`, `pending`, `created_on`, etc.) that have default values set in the tool definition arrive as non-null and hit this line — getting stamped onto the body as flat top-level keys on top of the template output. Bitbucket rejects all fields it does not recognise.

The null guard from fix 38 only helps params that are truly absent. Params with any default value (empty string, 0, false) bypass it and still land in the body.

**The fix — one condition on the fallthrough:**

Compute `hasBodyTemplate` once before the loop, then guard the fallthrough:

```js
// Before the param loop (around line 1053):
const hasBodyTemplate = !!(tool.endpoint.body && Object.keys(tool.endpoint.body).length > 0);

// Replace line 1086-1088:
} else if (key !== 'workspace' && key !== 'repo_slug') {
  if (!hasBodyTemplate) {
    bodyParams[key] = value;  // only for tools with no body template
  }
  // when a template exists, ignore — param was not in the template so it has no place in the body
}
```

**Why this is safe:**

- Tools WITH a body template: only template vars and path vars affect the request; all other params are silently ignored
- Tools WITHOUT a body template (simple flat-body POST tools): behaviour unchanged, params still added as flat keys
- `parent_comment_id` and other template vars are already handled by `bodyTemplateVars.has(key)` above the fallthrough — they are unaffected by this change

**File:** `server/src/routes/mcp.js` — line ~1053 (add `hasBodyTemplate`), line ~1086 (add `if (!hasBodyTemplate)` guard)

---

### Issue 38d — All fixes 38/38b/38c applied to wrong file — Claude Code uses a completely separate execution path ✅ RESOLVED

**Fixed in:**
- `server/src/services/body-utils.js` — new shared utility with `pruneNulls()` function
- `server/src/mcp/server.js` — regex now emits `null` for missing params, `pruneNulls()` called after substitution
- `server/src/routes/mcp.js` — updated to import from shared utility

**Root cause:**

There are two independent execution paths in the codebase:

| Path | File | Used by |
|------|------|---------|
| REST `/execute` route | `server/src/routes/mcp.js` | Admin UI test button, direct API calls |
| MCP tool handler | `server/src/mcp/server.js` `executeTool()` lines 147-274 | **Claude Code, Cursor, all MCP clients** |

All fixes so far (38 null guard, 38b pruneNulls, 38c hasBodyTemplate) were applied to `mcp.js`. Claude Code never touches that file. When Claude calls a tool via the MCP protocol, it goes through `mcp/server.js::executeTool` which has its own body construction code that received none of these fixes.

**The body construction in `mcp/server.js` (current state, lines 197-202):**

```js
let bodyParams = endpoint.body || {};
if (typeof bodyParams === 'object' && bodyParams !== null) {
  bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/\{(\w+)\}/g, (match, key) => {
    return params?.[key] !== undefined ? JSON.stringify(params[key]) : match;
  }));
}
```

This is a simpler regex-based substitution — it does not have `pruneNulls`, does not skip null params, and does not guard against non-template params being added to the body.

**What needs to be applied to `mcp/server.js::executeTool`:**

**Fix 1 — Add `pruneNulls` after body template substitution (same function as in `mcp.js`):**

```js
// After line 201 (after the existing bodyParams substitution block):
if (typeof bodyParams === 'object' && bodyParams !== null) {
  bodyParams = pruneNulls(bodyParams);
}
```

Either import/require `pruneNulls` from a shared utility, or duplicate the function at the top of `mcp/server.js`.

**Fix 2 — Leave unsubstituted template placeholders as null so `pruneNulls` removes them:**

The current regex returns the literal `match` string (`{varName}`) when a param is not provided. Change it to return `null` instead so `pruneNulls` can remove those nodes:

```js
bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/"\{(\w+)\}"/g, (match, key) => {
  return params?.[key] !== undefined ? JSON.stringify(params[key]) : 'null';
  //                                                                   ↑ null not the literal placeholder
}));
```

Note: the regex must match the quoted form `"{varName}"` (with surrounding quotes from JSON.stringify) so the replacement `null` produces valid JSON.

**Fix 3 — Extract `pruneNulls` into a shared utility to avoid duplication:**

Both `mcp.js` and `mcp/server.js` need this function. Rather than duplicating it, move it to a shared location:

```
server/src/services/body-utils.js   (new file)
  exports.pruneNulls = function pruneNulls(obj) { ... }

// then in both mcp.js and mcp/server.js:
const { pruneNulls } = require('../services/body-utils');
```

**Recommended fix order:**

1. Extract `pruneNulls` to `body-utils.js` and import in both files
2. Fix the regex in `mcp/server.js` to emit `null` for missing params (Fix 2)
3. Call `pruneNulls(bodyParams)` in `mcp/server.js` after substitution (Fix 1)
4. Verify with the Bitbucket PR comment tool — only `content.raw` and `parent.id` should appear in the body

**Files to change:**
- `server/src/mcp/server.js` — `executeTool()` body construction block (lines ~197-202)
- `server/src/services/body-utils.js` — new shared utility (optional but recommended)
- `server/src/routes/mcp.js` — update import if shared utility is extracted

---

### Issue 38e — Same flat-param body merge bug in `consume.js` and `compositeExecutor.js` — both unfixed ✅ RESOLVED

**Fixed in:**
- `server/src/routes/consume.js` — added null guard, hasBodyTemplate check, pruneNulls call
- `server/src/services/compositeExecutor.js` — added missing `else`, null guard, hasBodyTemplate check, body template substitution, pruneNulls call

**Full map of all execution paths and their fix status:**

| File | Entry point | Fixed? |
|------|------------|--------|
| `server/src/routes/mcp.js` | REST `POST /execute` (admin UI test button) | Yes (38, 38b, 38c) |
| `server/src/mcp/server.js` `executeTool()` | MCP protocol — non-composite tools | Yes (38d) |
| `server/src/services/compositeExecutor.js` `executeSimpleTool()` | MCP protocol — composite tools via `executeCompositeTool` | **No** |
| `server/src/routes/consume.js` | REST `POST /tools/:toolId/execute` | **No** |

---

**Bug 1 — `consume.js` lines 200-214**

Current code adds all non-template params as flat body keys with no null guard and no `hasBodyTemplate` check:

```js
for (const [key, value] of Object.entries(mergedParams)) {
  if (path.includes(`{${key}}`)) {
    pathParams[key] = value;
  } else if (['POST', 'PUT', 'PATCH'].includes(tool.endpoint.method)) {
    const bodyTemplateVars = new Set(...);
    if (!bodyTemplateVars.has(key)) {
      bodyParams[key] = value;   // ← fires for all non-template params regardless of null or template existence
    }
  } else {
    queryParams[key] = value;
  }
}
```

Fix needed — same pattern as `mcp.js` 38c:

```js
const hasBodyTemplate = !!(tool.endpoint.body && Object.keys(tool.endpoint.body).length > 0);

for (const [key, value] of Object.entries(mergedParams)) {
  if (value === null || value === undefined) continue;       // null guard
  if (path.includes(`{${key}}`)) {
    pathParams[key] = value;
  } else if (['POST', 'PUT', 'PATCH'].includes(tool.endpoint.method)) {
    const bodyTemplateVars = new Set(...);
    if (bodyTemplateVars.has(key)) {
      // template substitution handles it — do nothing here
    } else if (!hasBodyTemplate) {
      bodyParams[key] = value;                               // only for tools with no template
    }
  } else {
    queryParams[key] = value;
  }
}
// after template substitution:
bodyParams = pruneNulls(bodyParams);
```

Also add `pruneNulls` import and call it after the template substitution block at line 220.

---

**Bug 2 — `compositeExecutor.js` lines 126-134 — TWO bugs**

```js
for (const [key, value] of Object.entries(inputs)) {
  if (path.includes(`{${key}}`)) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  } if (tool.endpoint.method !== 'GET') {   // ← missing 'else' — path params ALSO land in body
    bodyParams[key] = value;                // ← no template check, no null check, no hasBodyTemplate
  } else {
    queryParams[key] = value;
  }
}
```

Two problems:
1. Missing `else` before the second `if` — path params get added to `bodyParams` AND substituted into the URL
2. No template var detection, no null guard, no `hasBodyTemplate` guard — every input param lands in the body as a flat key

Fix needed:

```js
const { pruneNulls } = require('../services/body-utils');
const hasBodyTemplate = !!(tool.endpoint.body && Object.keys(tool.endpoint.body).length > 0);
const bodyTemplateVars = new Set(
  (JSON.stringify(tool.endpoint.body || {}).match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1))
);

for (const [key, value] of Object.entries(inputs)) {
  if (value === null || value === undefined) continue;
  if (path.includes(`{${key}}`)) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  } else if (tool.endpoint.method !== 'GET') {              // ← 'else if' not 'if'
    if (!hasBodyTemplate && !bodyTemplateVars.has(key)) {
      bodyParams[key] = value;
    }
  } else {
    queryParams[key] = value;
  }
}

// after body template substitution:
if (typeof bodyParams === 'object' && bodyParams !== null) {
  bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/"\{(\w+)\}"/g, (match, key) => {
    return inputs[key] !== undefined ? JSON.stringify(inputs[key]) : 'null';
  }));
  bodyParams = pruneNulls(bodyParams);
}
```

**Files to fix:**
- `server/src/routes/consume.js` — lines ~200-229 (param loop + template substitution block)
- `server/src/services/compositeExecutor.js` — `executeSimpleTool()` lines ~126-134 (param loop + add template substitution + pruneNulls)

---

### Debugging tip — add console.log before HTTP call to confirm which path is still leaking

Since the fix has been applied to multiple paths but the identical 15+ fields keep appearing, add a log immediately before the actual HTTP call in each execution path to see which one is firing with the dirty body:

```js
// Add this immediately before each adapter.post() / adapter.put() / adapter.patch() call:
console.log('[MCPConnect] Request body to', path, JSON.stringify(bodyParams, null, 2));
```

Check all four locations:
- `mcp/server.js` `executeTool()` — before lines 214-226 (adapter calls)
- `mcp.js` `/execute` route — before lines 1109-1117 (adapter calls)
- `consume.js` — before the adapter call in its execute block
- `compositeExecutor.js` `executeSimpleTool()` — before lines 141-148 (adapter calls)

The log that prints the 15 extra fields identifies the unfixed path. Only one of them should fire when Claude Code calls the Bitbucket tool.

**Immediate workaround (no code change):** Strip the tool definition in the admin UI down to only the params that appear in the body template and path — `workspace`, `repo_slug`, `pull_request_id`, `content_raw`, `parent_comment_id`. Delete `id`, `type`, `user`, `inline_*`, `content_html`, `content_markup`, `deleted`, `pending`, `created_on`, `updated_on`, `pullrequest`, `resolution`. If the framework only adds what is defined, this stops the extra keys immediately.

---

### Issue 39 — Template substitution always produces strings — number/boolean params serialised as `"786047927"` not `786047927` ✅ RESOLVED

**Fixed in:**
- `server/src/mcp/server.js` — added `coerceParam()` function, updated substitution
- `server/src/routes/mcp.js` — added `coerceParam()` function to `substituteBodyTemplate`
- `server/src/routes/consume.js` — added `coerceParam()` function, updated substitution
- `server/src/services/compositeExecutor.js` — added `coerceParam()` function, updated substitution

**Symptom:**

After stripping the tool to minimal params, Bitbucket returns `"parent.id": "expected int"`. The body being sent is:

```json
{ "parent": { "id": "786047927" }, "content": { "raw": "..." } }
```

instead of:

```json
{ "parent": { "id": 786047927 }, "content": { "raw": "..." } }
```

**Why it happens:**

The body template is stored as:
```json
{ "parent": { "id": "{parent_comment_id}" }, "content": { "raw": "{content_raw}" } }
```

The `{parent_comment_id}` placeholder sits inside JSON string quotes. When the substitution replaces it using `JSON.stringify(params[key])`, if `params[key]` arrives as a JS string `"786047927"` (because the param is typed as `string` in the tool definition or in the Zod schema), `JSON.stringify` wraps it in quotes and the result is `"id": "786047927"`.

**Two-part fix:**

**Part 1 — Ensure the Zod schema uses `z.number()` for number params (already in `registerTool`, check tool definition)**

In `mcp/server.js::registerTool`, the Zod schema correctly maps `type: 'number'` → `z.number()`. If the tool's `parent_comment_id` param is defined as `type: "number"` in the admin UI, Claude Code will pass it as a JS number and the substitution produces the correct `786047927` (unquoted).

**Verify:** open the tool in the admin UI and confirm `parent_comment_id` is set to type `number` not `string`. This may be sufficient on its own.

**Part 2 — Make template substitution type-aware as a safety net (framework fix)**

Even if a value arrives as a string `"786047927"`, the substitution should cast it to the declared param type before embedding in the template. Update the substitution in all execution paths (`mcp/server.js`, `mcp.js`, `consume.js`) to look up the param's declared type and coerce accordingly:

```js
// Helper — coerce value to its declared type before JSON.stringify
function coerceParam(value, paramDefs, key) {
  const type = paramDefs?.[key]?.type;
  if (type === 'number' || type === 'integer') return Number(value);
  if (type === 'boolean') return value === 'true' || value === true;
  return value;  // string or unknown — leave as-is
}

// In the substitution replace callback:
bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/"\{(\w+)\}"/g, (match, key) => {
  if (params?.[key] === undefined) return 'null';
  const coerced = coerceParam(params[key], endpoint.params, key);
  return JSON.stringify(coerced);
}));
```

This guarantees a `number`-typed param always lands in the JSON as a bare integer even if it arrived as a string, which makes the tool resilient to type mismatches between what Claude passes and what the API expects.

**Files to fix:** `server/src/mcp/server.js` (lines ~199-204), `server/src/routes/mcp.js` (`substituteBodyTemplate` or the inline substitution), `server/src/routes/consume.js` (lines ~221-229)

---

## Feature 01 — Session Context Store: UI layout broken (missing CSS classes)

**Status:** Resolved — fixed in commit `3d92cfc`

**What is broken:**

The `SessionContexts.jsx` page renders without any layout, table styling, or modal
structure. The page header has no padding, the table has no borders or row styling,
clicking a row opens a modal where all content is crammed with no spacing, and the
`<pre>` block for context content overflows or has no visible distinction.

**Why it is broken:**

`SessionContexts.jsx` uses CSS class names that do not exist in `index.css`. The
developer invented new class names instead of using the established patterns from
other pages (Tools.jsx, Integrations.jsx etc.).

| Class used in JSX | Exists in index.css | Fix |
|---|---|---|
| `page-container` | No | Use `container` |
| `page-subtitle` | No | Wrap in `page-header`, use `<p>` which gets `.page-header p` styles |
| `data-table` | No | Add new class (see below) |
| `clickable-row` | No | Add new class (see below) |
| `modal-lg` | No | No large variant exists - add one or remove and use inline style |
| `modal-meta` | No | Add new class (see below) |
| `context-preview` | No | Add new class (see below) |

**Fix 1 - Restructure `SessionContexts.jsx` to use existing patterns:**

```jsx
return (
  <div className="container">
    <div className="page-header">
      <h1>Session Contexts</h1>
      <p>Named context snapshots stored by AI sessions. Read by other sessions to skip re-diagnosis.</p>
    </div>

    {loading ? (
      <div className="loading-overlay"><div className="spinner"></div></div>
    ) : contexts.length === 0 ? (
      <div className="empty-state">
        <div className="empty-state-icon">💬</div>
        <h3>No contexts yet</h3>
        <p>Ask Claude to store a context using <code>store-session-context</code>.</p>
      </div>
    ) : (
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Creator</th>
            <th>Updated</th>
            <th>Size</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {contexts.map(ctx => (
            <tr key={ctx.id} onClick={() => setSelected(ctx)} className="clickable-row">
              <td><code>{ctx.name}</code></td>
              <td>{ctx.creator?.username ?? '-'}</td>
              <td>{ctx.updatedAt ? new Date(ctx.updatedAt).toLocaleDateString() : '-'}</td>
              <td>{ctx.content?.length ?? 0} chars</td>
              <td>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => { e.stopPropagation(); handleDelete(ctx.name); }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    {selected && (
      <div className="modal-overlay" onClick={() => setSelected(null)}>
        <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{selected.name}</h2>
            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="modal-meta">
              <span>By {selected.creator?.username ?? 'unknown'}</span>
              <span>Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-'}</span>
            </div>
            <pre className="context-preview">{selected.content}</pre>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      </div>
    )}
  </div>
);
```

**Fix 2 - Add missing classes to `client/src/index.css`:**

```css
/* ── Session Contexts page ───────────────────────────────────────────── */

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  text-align: left;
  padding: 0.6rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;
}

.clickable-row {
  cursor: pointer;
  transition: background 0.15s;
}

.clickable-row:hover {
  background: var(--surface-hover);
}

.modal-lg {
  max-width: 760px;
}

.modal-meta {
  display: flex;
  gap: 1.5rem;
  font-size: 0.8rem;
  color: var(--text-light);
  margin-bottom: 1rem;
}

.context-preview {
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  font-size: 0.8rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  max-height: 50vh;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  color: var(--text);
}
```

**Files to fix:**
- `client/src/pages/SessionContexts.jsx` — restructure JSX (Fix 1)
- `client/src/index.css` — add missing CSS classes (Fix 2)

---

## Feature 01 — Session Context tools invisible in admin UI and list-tools

**Status:** Resolved — fixed in commit `3d92cfc`

**What is broken:**

`store-session-context`, `get-session-context`, `list-session-contexts`, and
`delete-session-context` do not appear in the MCPConnect admin UI and do not appear
when Claude calls `list-tools`. They work via MCP if Claude knows to call them by
name, but they cannot be discovered.

**Why it is broken:**

The developer registered these tools via `this.server.tool()` inside
`registerSessionContextTools()` in `server/src/mcp/server.js`. This is a different
pattern from every other built-in tool in MCPConnect.

`hello`, `list-tools`, `fetch-url`, `list-skills`, and `get-skill` are all **DB
seed records** in `server/src/config/database.js` pointing to `/api/mcp/*` REST
routes. When MCPConnect initialises, it loads these DB records and registers them
via `registerTool()` just like any user-created tool. That is why they appear in
the admin UI and in `list-tools` results.

`registerSessionContextTools()` bypasses the DB entirely → no DB record → invisible
everywhere except the raw MCP protocol (and even that requires the server to have
restarted after the code was deployed).

**Fix — three steps:**

**Step 1** — Add 4 internal REST handlers to `server/src/routes/mcp.js` (alongside
the existing `hello`, `fetch-url` etc. handlers). These do not need user `auth`
middleware — they are called internally by MCPConnect's execution layer.

```js
// store-session-context
router.post('/session-contexts/store', async (req, res) => {
  try {
    const { name, content } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');
    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name },
      defaults: { id: randomUUID(), name, content }
    });
    if (!created) await ctx.update({ content });
    res.json({ success: true, name, chars: content.length, created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get-session-context
router.get('/session-contexts/get', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name } });
    if (!ctx) return res.status(404).json({ error: `No context found with name '${name}'` });
    res.json({ name: ctx.name, content: ctx.content, updatedAt: ctx.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// list-session-contexts
router.get('/session-contexts/list', async (req, res) => {
  try {
    const { SessionContext, User } = loadModels();
    const all = await SessionContext.findAll({
      include: [{ model: User, as: 'creator', attributes: ['username'] }],
      order: [['updatedAt', 'DESC']]
    });
    res.json(all.map(c => ({
      name: c.name,
      creator: c.creator?.username ?? 'unknown',
      updatedAt: c.updatedAt,
      chars: c.content.length
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete-session-context
router.delete('/session-contexts/delete', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { SessionContext } = loadModels();
    const deleted = await SessionContext.destroy({ where: { name } });
    if (!deleted) return res.status(404).json({ error: `No context found with name '${name}'` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2** — Add DB seed records in `server/src/config/database.js` inside the
`toolsToCreate` array (the `else` branch, alongside `fetch-url`, `list-skills`,
`get-skill`). This ensures existing installs get the tools on next startup.

```js
{
  name: 'store-session-context',
  description: 'Save a named context string to MCPConnect so other sessions can retrieve it. Use this to share investigation summaries, findings, or decision logs across Claude sessions or teammates.',
  endpoint: {
    path: '/api/mcp/session-contexts/store',
    method: 'POST',
    params: {
      name:    { type: 'string', required: true,  description: 'Unique human-readable key, e.g. "bitbucket-debug"' },
      content: { type: 'string', required: true,  description: 'The context to store — markdown, JSON, bullet list, anything' }
    },
    headers: {}
  }
},
{
  name: 'get-session-context',
  description: 'Retrieve a named context previously stored in MCPConnect and inject it into the current session.',
  endpoint: {
    path: '/api/mcp/session-contexts/get',
    method: 'GET',
    params: {
      name: { type: 'string', required: true, description: 'The name of the context to retrieve' }
    },
    headers: {}
  }
},
{
  name: 'list-session-contexts',
  description: 'List all named contexts stored in MCPConnect, with name, creator, and timestamps.',
  endpoint: {
    path: '/api/mcp/session-contexts/list',
    method: 'GET',
    params: {},
    headers: {}
  }
},
{
  name: 'delete-session-context',
  description: 'Delete a named context from MCPConnect.',
  endpoint: {
    path: '/api/mcp/session-contexts/delete',
    method: 'DELETE',
    params: {
      name: { type: 'string', required: true, description: 'The name of the context to delete' }
    },
    headers: {}
  }
},
```

**Step 3** — Remove `registerSessionContextTools()` from `server/src/mcp/server.js`
and its call at line 75. With DB seed records in place, these tools are registered
automatically by the existing `registerTool()` loop in `initialize()` — exactly
like `hello` and `list-tools`. Keeping both would double-register the same tool
names causing a conflict.

```js
// DELETE this entire method from server.js:
async registerSessionContextTools() { ... }

// DELETE this call from initialize():
await this.registerSessionContextTools();
```

**Files to fix:**
- `server/src/routes/mcp.js` — add 4 internal REST handlers (Step 1)
- `server/src/config/database.js` — add 4 entries to `toolsToCreate` array (Step 2)
- `server/src/mcp/server.js` — remove `registerSessionContextTools()` and its call (Step 3)

---

## Feature 01 — list-session-contexts fails: "User is not associated to SessionContext!"

**Status:** Resolved

**Fixed in:** commit 83a18fc - removed User include from list route

**What was fixed:** Removed the User include from the `/session-contexts/list` handler since the association was removed in commit d370b00

---

## Feature 01 — `GET /api/session-contexts` returns 500 (admin UI Contexts page broken) ✅ RESOLVED

**Fixed in:** commit - removed User include from session-context.js REST routes

**Symptom:**

Opening the Contexts page in the admin UI (React app) triggers:
```
GET http://localhost:5173/api/session-contexts 500 (Internal Server Error)
AxiosError: Request failed with status code 500
```

The page stays blank. The browser console shows `Failed to fetch contexts`.

**Why it is broken:**

`server/src/routes/session-context.js` has two GET routes that both include `User as creator`:

```js
router.get('/', auth, async (req, res) => {
  const { SessionContext, User } = loadModels();
  const contexts = await SessionContext.findAll({
    include: [{ model: User, as: 'creator', attributes: ['id', 'username'] }],
    order: [['updatedAt', 'DESC']]
  });
  ...
});

router.get('/:name', auth, async (req, res) => {
  const { SessionContext, User } = loadModels();
  const ctx = await SessionContext.findOne({
    where: { name: req.params.name },
    include: [{ model: User, as: 'creator', attributes: ['id', 'username'] }]
  });
  ...
});
```

Commit `d370b00` removed the `SessionContext.associate` block from `SessionContext.js`
(which had `SessionContext.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' })`).
Without that association defined, Sequelize throws:
`User is not associated to SessionContext!`

This is the identical root cause as the `list-session-contexts` MCP route fixed in `83a18fc`.
That commit fixed the `/api/mcp/session-contexts/list` handler but left the REST routes in
`session-context.js` untouched.

**The fix — remove User include from both GET routes in `session-context.js`:**

```js
router.get('/', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const contexts = await SessionContext.findAll({
      order: [['updatedAt', 'DESC']]
    });
    res.json(contexts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name: req.params.name } });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    res.json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Also remove the `User` import from `loadModels()` destructuring in those routes.

If `createdBy` (the raw integer FK) is useful in the UI response, it is already
present on the `SessionContext` record itself - no join needed.

**File to fix:** `server/src/routes/session-context.js` - lines 8-33

---

## Feature 01 — Session context MCP tools return 401 when MCP auth mode is `required`

**Status:** Resolved — fixed in commit `a5e5ae7`

**Symptom:**

Calling `list-session-contexts`, `store-session-context`, `get-session-context`, or
`delete-session-context` via Claude returns:
```
Error: API Error: {"error":"MCP authentication required. Please provide a valid JWT token or API key."}
```

**Why it is broken:**

The developer added `checkMcpAuth` to the 4 internal session context routes in
`mcp.js` (lines 116, 140, 158, 180). This middleware is designed for **external**
MCP clients connecting to MCPConnect - not for MCPConnect calling its own routes
internally.

When Claude calls a DB-seed tool, `executeTool()` in `mcp/server.js` makes an HTTP
call to the internal route using `AdapterFactory.create(integration.type, resolvedConfig)`.
The adapter is configured from the tool's integration record (MCPConnect's self-integration)
and does not include an MCP API key header. So `checkMcpAuth` in `required` mode
rejects the call with 401.

These internal routes are not exposed to external MCP clients - they are only
reachable by MCPConnect's own execution layer. They do not need `checkMcpAuth`.

**The fix — remove `checkMcpAuth` from the 4 session context internal routes:**

```js
// Change these 4 route declarations in server/src/routes/mcp.js:

// FROM:
router.post('/session-contexts/store',    checkMcpAuth, async (req, res) => {
router.get('/session-contexts/get',       checkMcpAuth, async (req, res) => {
router.get('/session-contexts/list',      checkMcpAuth, async (req, res) => {
router.delete('/session-contexts/delete', checkMcpAuth, async (req, res) => {

// TO:
router.post('/session-contexts/store',    async (req, res) => {
router.get('/session-contexts/get',       async (req, res) => {
router.get('/session-contexts/list',      async (req, res) => {
router.delete('/session-contexts/delete', async (req, res) => {
```

**Note on ownership:** Without `checkMcpAuth`, `req.user` is never set on these
routes, so `createdBy` cannot be populated from MCP tool calls. Ownership enforcement
is handled by the REST routes (`/api/session-contexts/*`) used by the admin UI, which
do have proper `auth` middleware. The ownership + `isShared` redesign is tracked in
FEATURES.md and can be implemented as a follow-up once the basic flow works.

---

## Feature 01 — Ownerless contexts (stored via MCP) invisible in admin UI and `list`/`get` MCP tools

**Status:** Resolved — fixed in commit `de20e7a`

**Symptom:**

Any context stored via `store-session-context` (with default `shared: false`) cannot
be retrieved via `get-session-context`, does not appear in `list-session-contexts`,
and does not appear in the admin UI Contexts page — even immediately after storing.

**Why it is broken:**

Since `checkMcpAuth` was removed from the internal MCP routes, `req.user` is never
set. The `store` handler sets `createdBy: req.user?.id ?? null` — so every MCP-stored
context gets `createdBy: null`.

Both the REST readable filter and the MCP list/get routes treat `createdBy: null`
contexts as invisible to everyone:

- **REST `readableWhere`** (`session-context.js`):
  ```js
  { [Op.or]: [{ createdBy: userId }, { isShared: true }] }
  // ↑ null createdBy never matches — invisible in admin UI
  ```

- **MCP `list` null-callerId branch** (`mcp.js`):
  ```js
  : { isShared: true }
  // ↑ only shared contexts — ownerless ones hidden
  ```

- **MCP `get` null-callerId branch** (`mcp.js`):
  ```js
  : { name, isShared: true }
  // ↑ same — get returns 404 for any private ownerless context
  ```

**The fix — add `{ createdBy: null }` to all readable scopes:**

**File 1 — `server/src/routes/session-context.js`:**
```js
function readableWhere(userId) {
  return { [Op.or]: [{ createdBy: userId }, { isShared: true }, { createdBy: null }] };
}
```

**File 2 — `server/src/routes/mcp.js`, `list` route null-callerId branch:**
```js
: { [Op.or]: [{ isShared: true }, { createdBy: null }] };
```

**File 3 — `server/src/routes/mcp.js`, `get` route null-callerId branch:**
```js
: { name, [Op.or]: [{ isShared: true }, { createdBy: null }] }
```

This makes ownerless contexts visible to all authenticated users in the admin UI
and accessible to all MCP callers — which is correct, since without user identity
there is no basis for restricting them.

---

## Feature 01 — Session Contexts empty state references Claude by name

**Status:** Resolved — fixed in commit `72e830c`

**What to change:**

`client/src/pages/SessionContexts.jsx` line 67 — the empty state copy mentions Claude
specifically. MCPConnect works with any MCP-compatible AI client (Cursor, Copilot, etc.)
so the text should be tool-agnostic.

**Current:**
```jsx
<p>Ask Claude to store a context using <code>store-session-context</code>.</p>
```

**Replace with:**
```jsx
<p>From your AI session, call <code>store-session-context</code> with a name and content — e.g. <em>"Store a summary of our findings as 'auth-debug'"</em>.</p>
```

Also update the page subtitle on line 58 if it references any specific AI tool.

---

## Feature 02 — Sidebar: Contexts and Channels added as flat items instead of collapsible Sessions group

**Status:** Open

**What is broken:**

`Sidebar.jsx` adds both session pages as flat links inside the existing "Tools" section:

```jsx
{ path: '/session-contexts', icon: Database, label: 'Contexts' },
{ path: '/session-channels', icon: Hash, label: 'Channels' },
```

The spec (FEATURES.md §6) requires a collapsible **Sessions** group with its own header,
expand/collapse chevron, and the two pages as indented sub-links underneath it. The
current implementation shows two extra items in a section that already has Tools and
Skills — it is visually cluttered and the relationship between Contexts and Channels is
not communicated.

The wrong icons were also used. Spec requires `Layers` for the group, `FileStack` for
Contexts, `MessagesSquare` for Channels.

**What to change:**

**1. Add `SessionsNavGroup` component inside `Sidebar.jsx` (or as a separate file)**

```jsx
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Layers, FileStack, MessagesSquare, ChevronRight } from 'lucide-react';

function SessionsNavGroup() {
  const location = useLocation();
  const isSessionRoute = location.pathname.startsWith('/session');
  const [open, setOpen] = useState(isSessionRoute);

  return (
    <div className="nav-group">
      <button
        className={`nav-group-header ${isSessionRoute ? 'active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <Layers size={16} />
        {/* Only render text when sidebar is not collapsed */}
        <span>Sessions</span>
        <ChevronRight
          size={14}
          className="nav-group-chevron"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div className="nav-group-children">
          <NavLink
            to="/session-contexts"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <FileStack size={16} />
            <span>Contexts</span>
          </NavLink>
          <NavLink
            to="/session-channels"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <MessagesSquare size={16} />
            <span>Channels</span>
          </NavLink>
        </div>
      )}
    </div>
  );
}
```

When the sidebar is collapsed (`collapsed === true`), hide the `<span>` text and the
chevron — same way all other sidebar labels are hidden — and show only the `Layers`
icon.

**2. Replace the two flat links in `navItems` with `<SessionsNavGroup />`**

Remove from the `navItems` array:
```jsx
{ path: '/session-contexts', icon: Database, label: 'Contexts' },
{ path: '/session-channels', icon: Hash, label: 'Channels' },
```

Render `<SessionsNavGroup />` in the "Tools" section where those two items were. Since
`navItems` is currently a flat data array rendered by `map`, the simplest approach is
to render the Sessions group as a manual JSX element after the Skills link rather than
trying to encode it in the data array.

**3. Add CSS to `client/src/index.css`**

```css
/* Collapsible nav group */
.nav-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 12px;
  color: var(--text-light);
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  border-radius: 6px;
}
.nav-group-header:hover,
.nav-group-header.active { color: var(--text); background: var(--surface-hover); }

.nav-group-chevron { margin-left: auto; transition: transform 0.15s ease; }

.nav-group-children { padding-left: 12px; }
.nav-group-children .nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-light);
  text-decoration: none;
}
.nav-group-children .nav-link:hover,
.nav-group-children .nav-link.active { color: var(--text); background: var(--surface-hover); }
```

---

## Feature 02 — `SessionChannels.jsx` uses undeclared CSS classes — page renders unstyled

**Status:** Open

**What is broken:**

`SessionChannels.jsx` uses class names that do not exist in `index.css`: `page-container`,
`page-subtitle`, `two-panel`, `panel-left`, `panel-right`, `panel-header`,
`panel-actions`, `channel-row`, `channel-name`, `channel-meta`, `message-log`,
`log-entry`, `log-ts`, `log-message`. The page renders but has no layout, spacing, or
colour — it looks broken next to every other admin page.

The page also has structural issues: the messages array defensive check at the bottom
handles both `Array.isArray(messages)` and `messages.messages?.map(...)` separately —
this duplicates rendering logic and one branch will always be dead. The route already
returns a plain array (see `session-channel.js`), so only `Array.isArray` is needed.

**What to change:**

Rewrite `SessionChannels.jsx` to follow the same structure and class names as
`SessionContexts.jsx`. Use `.container`, `.page-header`, `.data-table`, `.empty-state`,
`.badge`, `.modal` etc. — all of which are already defined in `index.css`.

The two-panel layout (channel list on left, message log on right) is fine as a concept,
but implement it with existing or new well-named classes that are actually added to
`index.css`. Suggested structure:

```css
/* Add to index.css */
.split-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  align-items: start;
}
.split-layout-list { /* left panel */ }
.split-layout-detail { /* right panel */ }

.channel-item {
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}
.channel-item:hover { background: var(--surface-hover); }
.channel-item.active { background: var(--surface-hover); color: var(--primary); }

.log-entry {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
  align-items: flex-start;
}
.log-entry:last-child { border-bottom: none; }
.log-ts {
  color: var(--text-light);
  white-space: nowrap;
  font-size: 0.8rem;
  min-width: 140px;
}
.log-message { color: var(--text); line-height: 1.5; }
```

Also fix the dead-code defensive branch on `messages` — use `Array.isArray(messages)`
only, since the route always returns a plain array:

```jsx
{Array.isArray(messages) && messages.map(m => (
  <div key={m.id} className="log-entry">
    <span className="log-ts">{m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}</span>
    <span className="log-message">{m.message}</span>
  </div>
))}
{Array.isArray(messages) && messages.length === 0 && !loadingMessages && (
  <div className="empty-state">
    <p>No messages in this channel yet.</p>
  </div>
)}
```

---

## Feature 02 — `SessionContexts.jsx` emojis not replaced with Lucide icons

**Status:** Open

**What is broken:**

FEATURES.md §6 specifies that all emoji usage in the session pages should be replaced
with Lucide React icons. The developer did not apply these changes to `SessionContexts.jsx`.

**What to change:**

Three replacements in `client/src/pages/SessionContexts.jsx`:

**Empty state icon** (line ~93):
```jsx
// Remove:
<div className="empty-state-icon">💬</div>

// Replace with:
import { MessageSquare } from 'lucide-react';
<div className="empty-state-icon"><MessageSquare size={40} strokeWidth={1.5} /></div>
```

**Modal shared indicator** (line ~156):
```jsx
// Remove:
<span>🌐 Shared</span>

// Replace with:
import { Globe } from 'lucide-react';
<span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
  <Globe size={14} /> Shared
</span>
```

**Modal private indicator** (line ~156):
```jsx
// Remove:
<span>🔒 Private</span>

// Replace with:
import { Lock } from 'lucide-react';
<span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
  <Lock size={14} /> Private
</span>
```

All three Lucide components can be imported in a single line at the top of the file.

---

## Feature 02 — `read-channel` and `clear-channel` broken — path param `:channel` not substituted

**Status:** Open

**Confirmed via MCP test** — `read-channel('test-channel')` returned `{ channel: ':channel', messages: [], count: 0 }`.
The literal string `:channel` was used as the channel name, not the value passed by the caller.

**Root cause:**

The DB-seeded tool execution engine sends all params as query parameters (for GET) or
body parameters (for POST). It does not substitute `:param` placeholders in the path.

Comparing the two approaches in `database.js`:

```js
// session context — WORKS: channel is a query param, path is flat
{ path: '/api/mcp/session-contexts/get', params: { name: ... } }
// → GET /api/mcp/session-contexts/get?name=foo

// read-channel — BROKEN: channel is a path param, not substituted
{ path: '/api/mcp/session-channels/:channel', params: { channel: ... } }
// → GET /api/mcp/session-channels/:channel?channel=foo  (literal ":channel")
```

`append-to-channel` is unaffected (POST body, flat path). `clear-channel` has the same
bug (also uses `/:channel` with DELETE).

**What to change:**

**1. Add two new flat routes in `server/src/routes/mcp.js`** (before the existing `/:channel` routes):

```js
// GET /api/mcp/session-channels/read?channel=foo&since=...
router.get('/session-channels/read', async (req, res) => {
  try {
    const { channel, since } = req.query;
    if (!channel) return res.status(400).json({ error: 'channel is required' });
    const { SessionChannel } = loadModels();
    const where = { channel };
    if (since) where.createdAt = { [Op.gt]: new Date(since) };
    const messages = await SessionChannel.findAll({
      where,
      order: [['createdAt', 'ASC']]
    });
    if (!messages.length && !(await SessionChannel.findOne({ where: { channel } }))) {
      return res.status(404).json({ error: `Channel '${channel}' not found` });
    }
    res.json({ channel, messages, count: messages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mcp/session-channels/clear?channel=foo
router.delete('/session-channels/clear', async (req, res) => {
  try {
    const { channel } = req.query;
    if (!channel) return res.status(400).json({ error: 'channel is required' });
    const { SessionChannel } = loadModels();
    const deleted = await SessionChannel.destroy({ where: { channel } });
    res.json({ success: true, channel, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Important:** these two routes must be registered **before** the existing `/:channel`
route, otherwise Express will match `read` and `clear` as channel names.

**2. Update the DB seeds in `server/src/config/database.js`:**

```js
// read-channel — change path and remove channel from params (it becomes implicit in path)
{
  name: 'read-channel',
  endpoint: {
    path: '/api/mcp/session-channels/read',   // was /api/mcp/session-channels/:channel
    method: 'GET',
    params: {
      channel: { type: 'string', required: true, description: 'The channel name to read' },
      since:   { type: 'string', required: false, description: 'ISO 8601 timestamp — only return messages after this time' }
    }
  }
}

// clear-channel — same fix
{
  name: 'clear-channel',
  endpoint: {
    path: '/api/mcp/session-channels/clear',  // was /api/mcp/session-channels/:channel
    method: 'DELETE',
    params: {
      channel: { type: 'string', required: true, description: 'The channel name to clear' }
    }
  }
}
```

After this change the DB seed rows need to be refreshed — either restart the server
(seeds run on startup) or delete and re-insert the `read-channel` and `clear-channel`
rows from the Tools table manually.

---

## Feature 02 — Issue 48b: `read-channel` still broken after code fix — DB seed rows not refreshed

**Status:** Open

**Confirmed via MCP test** — after the `3b6346c` code fix, `read-channel('feature-02-test')`
still returns `{ channel: ':channel', messages: [], count: 0 }`.

**Root cause:**

`createDefaultTool` uses `findOrCreate` keyed on tool name. Since `read-channel` and
`clear-channel` already exist in the database (seeded with the old path on first run),
`findOrCreate` finds them and skips the create — the path field is never updated.

The new routes at `/read` and `/clear` exist in the code, but the DB still has
`/api/mcp/session-channels/:channel` as the path for both tools, so the execution
engine still calls the old (now legacy) path-param route.

**What to do:**

Delete the two stale rows from the `Tools` table so the server re-seeds them with the
correct paths on next startup. From inside the container or wherever the SQLite DB is:

```sql
DELETE FROM Tools WHERE name IN ('read-channel', 'clear-channel');
```

Then restart the server. The seed will recreate both rows with the new flat paths.

Alternatively, run a direct UPDATE:

```sql
UPDATE Tools SET endpoint = json_set(endpoint, '$.path', '/api/mcp/session-channels/read')
WHERE name = 'read-channel';

UPDATE Tools SET endpoint = json_set(endpoint, '$.path', '/api/mcp/session-channels/clear')
WHERE name = 'clear-channel';
```

After either approach, reconnect MCP in Claude Code and retry `read-channel`.

---

## Issue 54 — Selecting a channel crashes with `TypeError: a.map is not a function`

**Status:** Open

**Symptom:**

Clicking any channel in the left panel of the Session Channels page causes a white screen
and `TypeError: a.map is not a function` in the browser console (`installHook.js:1`).

**Root cause:**

`api` in the React app is a raw **axios instance** — `api.get()` returns the full axios
response object `{ data: [...], status: 200, headers: {}, config: {}, request: {} }`,
not the response data directly.

The `loadMessages` normalization code:

```js
const res = await api.get(`/session-channels/${encodeURIComponent(channel)}`, token);
const data = res?.messages || res || [];
setMessages(data);
```

`res?.messages` is always `undefined` (axios response objects have no `.messages`
property). The fallthrough `res || []` evaluates to `res` — the full axios object,
which is truthy. So `setMessages(res)` sets `messages` to the axios object, not an array.

When React renders with `messages = { data: [...], status: 200, ... }`:

```jsx
{Array.isArray(messages) ? messages.map(...)   // false — not an array
                         : messages.messages?.map(...)}  // undefined?.map() → undefined
```

Neither branch throws. But at some point in the component tree React tries to iterate
`messages` as if it were an array (likely in the `message-log` div with `messages.map`
called elsewhere or in a parent component's re-render), which throws the error.

Compare with `loadChannels` which does this correctly:

```js
const data = Array.isArray(res) ? res : (res?.data || res?.channels || []);
```

`loadMessages` was written with a different (wrong) pattern — using `res?.messages`
instead of `res?.data`.

**The fix — `client/src/pages/SessionChannels.jsx`, `loadMessages` function:**

```js
const loadMessages = async (channel) => {
  setLoadingMessages(true);
  try {
    const res = await api.get(`/session-channels/${encodeURIComponent(channel)}`, token);
    // res is an axios response — use res.data (plain array from admin route)
    const data = Array.isArray(res?.data)
      ? res.data
      : (res?.data?.messages || res?.messages || []);
    setMessages(data);
  } catch (err) {
    console.error('Failed to load messages:', err);
    setMessages([]);
  } finally {
    setLoadingMessages(false);
  }
};
```

This handles both:
- Admin route (`GET /api/session-channels/:channel`) — returns a plain JSON array → `res.data` is an array, uses it directly
- MCP route if ever called — returns `{ channel, messages: [...], count }` → `res.data.messages`

**File:** `client/src/pages/SessionChannels.jsx` — `loadMessages` function, line ~29

---

## Issue 52 — `Globe`/`Lock` imported in `SessionContexts.jsx` but never rendered in modal

**Status:** Open

**What is broken:**

`Globe` and `Lock` are imported at line 3 of `SessionContexts.jsx` but never placed in the JSX. The modal visibility badge shows plain text "Shared" / "Private" with no icon alongside. The spec requires inline icon + label: `<Globe size={14} /> Shared` and `<Lock size={14} /> Private`.

**Why it is broken:**

Issue 50 was marked resolved but the fix only changed the empty-state icon. The modal badge was not updated — the icons were imported in anticipation but the JSX render was not changed.

**What to change — `client/src/pages/SessionContexts.jsx`:**

**1. In the table `<tbody>` row (Visibility `<td>`):**

```jsx
// Current:
<span className={`badge ${ctx.isShared ? 'badge-green' : 'badge-muted'}`}>
  {ctx.isShared ? 'Shared' : 'Private'}
</span>

// Replace with:
<span className={`badge ${ctx.isShared ? 'badge-green' : 'badge-muted'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
  {ctx.isShared ? <><Globe size={13} /> Shared</> : <><Lock size={13} /> Private</>}
</span>
```

**2. In the modal `modal-meta` section:**

```jsx
// Current:
<span className={`badge ${selected.isShared ? 'badge-green' : 'badge-muted'}`}>
  {selected.isShared ? 'Shared' : 'Private'}
</span>

// Replace with:
<span className={`badge ${selected.isShared ? 'badge-green' : 'badge-muted'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
  {selected.isShared ? <><Globe size={13} /> Shared</> : <><Lock size={13} /> Private</>}
</span>
```

**File:** `client/src/pages/SessionContexts.jsx` — visibility badge in table row and modal `modal-meta`

---

## Issue 53 — Dead code in `SessionChannels.jsx`; unused `Database` import in `Sidebar.jsx`

**Status:** Open

**What is broken:**

**Problem 1 — `SessionChannels.jsx` dead code (lines 107-113, 115):**

After the `d1d699a` response-normalization fix, `messages` state is always set to an array (via `res?.messages || res || []`). The dual-branch render at lines 100-113 has an unreachable else:

```jsx
// messages is always an array now — the else branch never executes
{Array.isArray(messages) ? messages.map(m => ...) : messages.messages?.map(m => ...)}
```

Line 115 also has a dead check:
```jsx
{!loadingMessages && (messages.length === 0 || messages.messages?.length === 0) && ...}
// messages.messages is always undefined — second condition is always falsy
```

**Problem 2 — `Sidebar.jsx` unused import (line 17):**

```js
import { ..., Database, Layers, MessagesSquare } from 'lucide-react';
```

`Database` was replaced by `Layers`/`MessagesSquare` in commit `907bbbe` but its import was not removed. This will cause a linter warning.

**What to change:**

**`client/src/pages/SessionChannels.jsx`** — simplify the message rendering:

```jsx
{/* Replace lines 100-118 with: */}
<div className="message-log">
  {Array.isArray(messages) && messages.map(m => (
    <div key={m.id} className="log-entry">
      <span className="log-ts">
        {m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}
      </span>
      <span className="log-message">{m.message}</span>
    </div>
  ))}
  {!loadingMessages && Array.isArray(messages) && messages.length === 0 && (
    <p className="empty-state">No messages yet.</p>
  )}
</div>
```

**`client/src/components/Sidebar.jsx`** — remove `Database` from the import line:

```js
// Remove Database from the import:
import { LayoutDashboard, Plug, Wrench, FileText, Activity, Settings,
         ChevronLeft, Zap, ChevronRight, LogOut, ChevronDown, User,
         Layers, MessagesSquare } from 'lucide-react';
```

**Files:**
- `client/src/pages/SessionChannels.jsx` — lines 100-118 (message render block)
- `client/src/components/Sidebar.jsx` — line 17 (remove `Database` from import)
