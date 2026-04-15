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
| 28 | Body template substitution corrupts parameter values that contain `{word}` patterns | `d3ca210` |

---

## Open Issues

### Issue 28 — Body template substitution corrupts values containing `{word}` patterns

**File:** `server/src/routes/mcp.js` ~line 853

**What is broken:**

If a tool parameter value passed by Claude contains any `{word}` pattern (e.g. a Jira comment body containing `{noformat}code{noformat}`, or any text with curly-brace syntax), the body template substitution corrupts it or throws a JSON parse error. The tool call silently fails or sends the wrong body to the API.

**Why it is broken:**

The substitution runs in two regex passes over the full JSON string:

```js
// Pass 1 - replaces known quoted placeholders
bodyStr = bodyStr.replace(/"(\{(\w+)\})"/g, (match, placeholder, key) => {
  return mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : match;
});

// Pass 2 - replaces any remaining {word} patterns
bodyStr = bodyStr.replace(/\{(\w+)\}/g, (match, key) => {
  return mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : `"${match}"`;
});

bodyParams = JSON.parse(bodyStr);
```

Pass 1 correctly substitutes `"{commentBody}"` with the value `"{noformat}code{noformat}"`.

After Pass 1, bodyStr is: `{"body":"{noformat}code{noformat}"}` — valid JSON.

Pass 2 then scans the whole string again and finds `{noformat}`. Since `mergedParams["noformat"]` is undefined, it returns `` `"${match}"` `` = `"{noformat}"`, inserting extra double-quotes inside an already-quoted string:

Result: `{"body":""{noformat}"code"{noformat}"}` — invalid JSON → `JSON.parse` throws.

**The fix:**

Replace the two-pass string regex approach with a recursive object walker that substitutes value by value. This way replacement values are never re-scanned, and JSON structure is never corrupted.

```js
// Add this helper function near the top of the file (alongside safeJsonParse)
function substituteBodyTemplate(obj, params) {
  if (typeof obj === 'string') {
    // Whole string is a single placeholder → replace with the typed value
    const sole = obj.match(/^\{(\w+)\}$/);
    if (sole && params[sole[1]] !== undefined) {
      return params[sole[1]];
    }
    // Placeholder embedded in a larger string → substitute as string
    return obj.replace(/\{(\w+)\}/g, (match, key) =>
      params[key] !== undefined ? String(params[key]) : match
    );
  }
  if (Array.isArray(obj)) {
    return obj.map(item => substituteBodyTemplate(item, params));
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteBodyTemplate(value, params);
    }
    return result;
  }
  return obj;
}
```

Then replace the two-pass block with a single call:

```js
// Before (lines ~853-865):
if (typeof bodyParams === 'object' && bodyParams !== null) {
  let bodyStr = JSON.stringify(bodyParams);
  bodyStr = bodyStr.replace(/"(\{(\w+)\})"/g, ...);
  bodyStr = bodyStr.replace(/\{(\w+)\}/g, ...);
  bodyParams = JSON.parse(bodyStr);
}

// After:
if (typeof bodyParams === 'object' && bodyParams !== null) {
  bodyParams = substituteBodyTemplate(bodyParams, mergedParams);
}
```

**Behaviour of the fix:**

| Template value | Param value | Result |
|----------------|-------------|--------|
| `"{body}"` | `"{noformat}code{noformat}"` | `"{noformat}code{noformat}"` (preserved) |
| `"{count}"` | `42` (number) | `42` (typed, not stringified) |
| `"issue/{issueId}/comment"` | `"P20009868-47"` | `"issue/P20009868-47/comment"` |
| `"{unknown}"` | not in params | `"{unknown}"` (left as-is, no crash) |

**Impact:** Any tool whose API uses curly-brace syntax in values — Jira (`{noformat}`, `{code}`), Confluence, or any user-provided text containing `{word}` — is affected.
