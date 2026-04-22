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
