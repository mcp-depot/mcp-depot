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
| 33 | `get-skill` MCP tool missing - any AI can list skills but cannot install them | latest |

---

## Open Issues

### Issue 29 — Composite tool builder: step parameters empty / not shown

**Files:**
- `client/src/pages/CompositeToolBuilder.jsx` lines 132-141, 501-562

**What is broken:**

When a user selects a tool for a step, the input mappings panel shows "This tool has no parameters" for almost every tool, even tools that clearly have inputs. The parameter rows are empty, so the user cannot map inputs to anything.

**Why it is broken:**

Both `handleToolSelect` (which pre-fills mappings on tool select) and the mapping render use `tool.endpoint?.params` to discover parameters:

```js
// handleToolSelect – line 136
const params = tool.endpoint?.params || {};

// mapping render – line 501
{Object.keys(selectedTool.endpoint?.params || {}).length === 0 ? (
  ...
{Object.entries(selectedTool.endpoint?.params || {}).map(([key]) => (
```

`endpoint.params` stores only **query string parameters**. Path parameters and body parameters are not in there. The correct source for all tool inputs is `tool.inputSchema.properties` - this is populated for every tool (manually created, OpenAPI-imported, or body-param tools) and is what the MCP server sends to Claude.

**The fix:**

Replace `endpoint?.params` → `inputSchema?.properties` in both places.

```js
// handleToolSelect (line 136):
const params = tool.inputSchema?.properties || {};

// mapping render (lines 501, 505):
{Object.keys(selectedTool.inputSchema?.properties || {}).length === 0 ? (
  <p className="cb-hint-text">This tool has no parameters</p>
) : (
  <div className="cb-mapping-list">
    {Object.entries(selectedTool.inputSchema?.properties || {}).map(([key]) => (
```

---

### Issue 30 — Composite tool builder: missing `btn-block` and `btn-sm` CSS classes

**File:** `client/src/index.css`

**What is broken:**

Two buttons in the composite builder have no width/size styling:
- "Add Step" button (uses `btn btn-secondary btn-block`) renders as auto-width, not full-width
- "Add Input" button (uses `btn btn-secondary btn-block`) same problem
- Extractor "Add" and input form "Add/Cancel" buttons (use `btn btn-secondary btn-sm`) render at default size instead of compact

**Why it is broken:**

The CSS defines `.btn-small` but the JSX uses `.btn-block` and `.btn-sm` - these class names don't exist. The duplicated `.btn-small` definition at lines 530 and 547 also suggests a copy-paste artifact.

**The fix:**

Add after the existing `.btn-small` rules:

```css
.btn-block {
  display: flex;
  width: 100%;
  justify-content: center;
  align-items: center;
  gap: 0.375rem;
}

.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  gap: 0.25rem;
}
```

---

### Issue 31 — Composite tool builder: height wrong for sidebar layout

**File:** `client/src/index.css` line 1323

**What is broken:**

The composite builder takes 57px less height than it should, leaving a blank strip at the bottom.

**Why it is broken:**

```css
.composite-builder {
  height: calc(100vh - 57px); /* subtract navbar */
}
```

The app uses a **sidebar** layout (no top navbar). The 57px figure was the height of a top navbar that does not exist here. The builder sits inside `.app-main` which starts at the very top of the viewport.

**The fix:**

```css
.composite-builder {
  height: 100vh;
}
```

---

### Issue 32 — Composite tools section hidden when integration has no simple tools

**File:** `client/src/pages/Tools.jsx` line 700

**What is broken:**

On a fresh integration that has no simple tools yet, the "Composite Tools" section and the "+ New Composite Tool" button are completely invisible. The user has no way to create a composite tool on that integration.

**Why it is broken:**

```js
{tools.length > 0 && tools[0]?.type !== 'composite' && (
  <div className="card">  {/* Composite tools card */}
```

`tools` is already filtered to non-composite tools (line 146), but the condition `tools.length > 0` means the card only renders when there is at least one simple tool. On a new integration there are none, so the section never mounts.

**The fix:**

Remove the `tools.length > 0 &&` guard. The composite section should always be visible when viewing an integration's tools page:

```js
{tools[0]?.type !== 'composite' && (
  <div className="card">
```

Or, since `tools` is already filtered to non-composite, the `type !== 'composite'` check is always true anyway. The simplest fix is just:

```js
<div className="card" style={{ marginTop: '1.5rem' }}>
  {/* Composite Tools */}
```

(Remove the condition entirely - the card always makes sense on the tools page.)

---

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
