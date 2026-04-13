# Suggested Fixes

> This file documents issues where the root cause has been diagnosed but the fix has not yet been applied.
> Each entry includes: what's broken, why previous attempts didn't work, and the exact fix to apply.

---

## Issue 1 — POST body template variables missing from MCP tool schema

**Status:** Fully fixed ✓  
- Fix 1 (`server/src/mcp/server.js` `registerTool()`) - Applied in commit `5cd087a` ✓  
- Fix 2 (`server/src/routes/mcp.js` `GET /tools`) - Applied in commit `ea07a0e` ✓  

**Symptom:** For POST tools with a body template (e.g. `{ "transition": { "id": "{transitionId}" } }`), the variable `transitionId` does not appear in the tool's MCP schema. Claude never knows to pass it, so the POST body is sent incomplete.

**Affected tool example:** "Set the transition for Jira"  
**Observed:** `transitionId` missing from `params` in `GET /api/mcp/tools` response.

**Note on commit `5cd087a`:** The `routes/mcp.js` change in that commit only fixed body substitution in the `/execute` route. The `GET /tools` route (which builds the schema Claude sees) was not updated. Fix 2 below is still needed.

---

### Why the previous fix attempts didn't work

The developer's fix in `integrations.js` looks for body params here:

```js
const bodyParams = endpoint.body?.properties || {};
```

`endpoint.body` is a **template object**, not a JSON Schema:
```json
{ "transition": { "id": "{transitionId}" } }
```

It has no `properties` key — so `bodyParams` is always `{}` and nothing is ever added to params. The enrichment loop runs over an empty object and does nothing.

---

### Root cause

The body template uses `{varName}` placeholders to mark where Claude's inputs should be substituted. These placeholders are never registered as params in the MCP schema because:

1. `registerTool()` in `mcp/server.js` only reads `endpoint.params` to build the schema
2. `GET /tools` in `routes/mcp.js` only reads `endpoint.params` + `inputSchema.properties`
3. Neither scans the body template for `{varName}` patterns

The execution side already works correctly (commit `6725083` substitutes `{varName}` in the body at call time). The schema side is the only thing missing.

---

### Fix — two files, same pattern

**The approach:** scan `endpoint.body` (JSON-stringified) for `{varName}` regex patterns. Any variable not already in the schema gets added as a required body parameter.

---

#### Fix 1 — `server/src/mcp/server.js` → `registerTool()`

Add after the `endpoint.params` loop (around line 56):

```js
// Extract {varName} template variables from the body not covered by endpoint.params
// e.g. body: { "transition": { "id": "{transitionId}" } } → adds transitionId to schema
const bodyTemplateVars = (JSON.stringify(endpoint.body || {})
  .match(/\{(\w+)\}/g) || [])
  .map(m => m.slice(1, -1));
for (const varName of bodyTemplateVars) {
  if (!schema[varName]) {
    schema[varName] = { type: 'string', description: `Body parameter: ${varName}` };
    required.push(varName);
  }
}
```

**Before** (current):
```js
for (const [key, param] of Object.entries(params)) {
  schema[key] = { type: param.type || 'string', description: param.description || key };
  if (param.required) required.push(key);
}

const adapter = tool.Integration ? AdapterFactory.create(   // ← insert above this line
```

---

#### Fix 2 — `server/src/routes/mcp.js` → `GET /tools` local tools map

Add after the `inputSchema.properties` loop and before `let mcpInputSchema = ...`:

```js
// Extract {varName} template variables from the body not covered by params or inputSchema
const bodyTemplateVars = (JSON.stringify(t.endpoint.body || {})
  .match(/\{(\w+)\}/g) || [])
  .map(m => m.slice(1, -1));
const existingParamNames = new Set(params.map(p => p.name));
bodyTemplateVars.forEach(varName => {
  if (!existingParamNames.has(varName)) {
    params.push({
      name: varName,
      in: 'body',
      required: true,
      type: 'string',
      description: `Body parameter: ${varName}`
    });
    existingParamNames.add(varName);
  }
});
```

**Before** (current):
```js
      }
    }                              // ← end of inputSchema.properties block

    // ← insert here

    let mcpInputSchema = { type: 'object', properties: {} };
```

Also update `mcpInputSchema` to include the discovered vars so all schema fields (`input_schema`, `schema`, `schema_`, `parameters`) are consistent:

```js
let mcpInputSchema = { type: 'object', properties: {} };
if (inputSchema.properties) {
  mcpInputSchema.properties = { ...inputSchema.properties };
  mcpInputSchema.required = [...(inputSchema.required || [])];
} else {
  mcpInputSchema.required = [];
}
// Add body template vars to mcpInputSchema too
bodyTemplateVars.forEach(varName => {
  if (!mcpInputSchema.properties[varName]) {
    mcpInputSchema.properties[varName] = { type: 'string', description: `Body parameter: ${varName}` };
    if (!mcpInputSchema.required.includes(varName)) mcpInputSchema.required.push(varName);
  }
});
```

---

### Why this works

The body template `{ "transition": { "id": "{transitionId}" } }` when JSON-stringified becomes:
```
'{"transition":{"id":"{transitionId}"}}'
```

The regex `/\{(\w+)\}/g` matches `{transitionId}` → extracts `transitionId`.

Since the execution side already substitutes `{transitionId}` correctly (from commit `6725083`), once `transitionId` appears in the schema, Claude will pass it and the full chain works end-to-end.

---

### After applying the fix

1. Restart the server
2. Run `/mcp` in Claude Code to reconnect and pick up the updated schema
3. Verify with: `curl -s http://localhost:3000/api/mcp/tools | python -c "import json,sys; tools=json.load(sys.stdin)['tools']; [print(t['name'], [p['name'] for p in t['params']]) for t in tools]"`
4. `transitionId` should now appear in the params list for the Jira transition tool

---

## Issue 2 — "Failed to save tool" when editing from the All Tools view

**Status:** Fixed ✓ — Applied in commit `0b7930b`  
**Symptom:** Clicking Edit on a tool from the `/tools` (All Tools) page and saving always results in "Failed to save tool", even with no changes.

**Affected page:** `/tools` (the all-integrations tool list, route `<Tools all />`)  
**Works fine on:** `/integrations/:id/tools` (single-integration view)

---

### Root cause

In `client/src/pages/Tools.jsx`, the integration ID comes from the URL:

```js
const id = params.id;   // undefined on /tools — no :id segment in the route
```

`handleSubmit` uses `id` directly in the PUT URL:

```js
await api.put(`/integrations/${id}/tools/${editingTool._id}`, payload);
//                              ^^^ undefined on /tools page
```

This sends `PUT /integrations/undefined/tools/:toolId` to the server.  
The backend `whereClause` passes `'undefined'` as a UUID to Postgres, which throws:

```
invalid input syntax for type uuid: "undefined"
```

That unhandled Sequelize error triggers the catch block → 500 → "Failed to save tool".

The tool object already carries `integrationId` (it is returned by the API and spread onto `editingTool`), so the fix is a one-liner.

---

### Fix — `client/src/pages/Tools.jsx` → `handleSubmit`

**File:** `client/src/pages/Tools.jsx`  
**Around line 157**

Replace:
```js
if (editingTool) {
  await api.put(`/integrations/${id}/tools/${editingTool._id}`, payload);
```

With:
```js
if (editingTool) {
  const integrationId = id || editingTool.integrationId;
  await api.put(`/integrations/${integrationId}/tools/${editingTool._id}`, payload);
```

That is the entire fix. When on a single-integration page, `id` (from the URL) is used as before. When on the All Tools page, `editingTool.integrationId` is used as the fallback.

---

### Why `editingTool.integrationId` is always available

`handleEdit` spreads the full tool object:
```js
const normalizedTool = { ...tool, _id: tool._id || tool.id };
setEditingTool(normalizedTool);
```

And the GET `/integrations/:id/tools` response maps `t.toJSON()` which includes all Sequelize model fields, so `integrationId` is always present.

---

### After applying the fix

1. Navigate to `/tools`
2. Click Edit on any tool
3. Make a change and save — should succeed without error
4. The debug `console.error` added in commit `643f1c9` can be removed once confirmed fixed

---

## Issue 3 — Tool creation fails when description is left blank + POST body params not extracted on create

**Status:** Open  
**Two related problems in the same create flow.**

---

### Problem A — `description: ''` fails Joi validation

**Symptom:** Clicking "Create Tool" without filling in a description shows:
`"description" is not allowed to be empty`

**Root cause:** In `server/src/routes/integrations.js`, the `toolSchema` declares:
```js
description: Joi.string(),
```

`Joi.string()` rejects empty strings by default. The frontend always sends `description: form.description` in the payload — even when the field is blank — so `description: ''` triggers the validation failure.

**Fix — `server/src/routes/integrations.js`** (one character change in `toolSchema`):
```js
// Before
description: Joi.string(),

// After
description: Joi.string().allow('').optional(),
```

This makes description truly optional: absent, null, or empty string are all accepted.

---

### Problem B — Body template vars (`{varName}`) not extracted into params on tool create

**Symptom:** When creating a POST tool with a body like `{"transition": {"id": "{transitionId}"}}`, the `transitionId` variable is not added to `endpoint.params`. Claude still won't know to ask for it (even though Issues 1 & 2 fixed the MCP schema side, the `endpoint.params` stored in the DB for new tools is incomplete).

**Root cause:** In `server/src/routes/integrations.js` POST `/:id/tools`, the enrichment logic uses:
```js
const bodyParams = endpoint.body?.properties || {};
```

`endpoint.body` is a template object `{"transition": {"id": "{transitionId}"}}` — it has no `.properties` key. So `bodyParams` is always `{}` and the loop does nothing. This is the same root cause as Issue 1.

**Fix — `server/src/routes/integrations.js` → POST `/:id/tools`**

Replace the enrichment block (the one that starts with `const bodyParams = endpoint.body?.properties`) with regex-based extraction, consistent with the fix applied in `server.js` (commit `5cd087a`):

```js
// Extract {varName} template variables from body — same pattern as mcp/server.js
const bodyTemplateVars = (JSON.stringify(endpoint.body || {})
  .match(/\{(\w+)\}/g) || [])
  .map(m => m.slice(1, -1));

let enrichedEndpoint = { ...endpoint };

if (bodyTemplateVars.length > 0) {
  const allParams = { ...(endpoint.params || {}) };
  bodyTemplateVars.forEach(varName => {
    if (!allParams[varName]) {
      allParams[varName] = { required: true, type: 'string', description: `Body parameter: ${varName}` };
    }
  });
  enrichedEndpoint.params = allParams;
}
```

Remove the old block:
```js
// DELETE these lines:
const bodyParams = endpoint.body?.properties || {};
const bodyParamNames = Object.keys(bodyParams);
const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);
let enrichedEndpoint = { ...endpoint };
if (isBodyMethod && bodyParams && Object.keys(bodyParams).length > 0) {
  const allParams = { ...(endpoint.params || {}) };
  Object.entries(bodyParams).forEach(([key, val]) => {
    if (!allParams[key]) {
      allParams[key] = { required: bodyParamNames.includes(key), type: val.type || 'string', description: val.description || '' };
    }
  });
  enrichedEndpoint.params = allParams;
}
```

---

### After applying both fixes

1. Leave description blank when creating a tool → should save without error
2. Create a POST tool with body `{"transition": {"id": "{transitionId}"}}` → `endpoint.params` should contain `transitionId` in the saved record
3. Verify with: `GET /api/integrations/:id/tools` → check the tool's `endpoint.params`

---

## Issue 4 — UI: auto-detect `{varName}` in body and sync to Default Params

**Status:** Open  
**Goal:** When a user types `{transitionId}` in the Request Body textarea, the UI should immediately detect it and ensure it appears in Default Params — either automatically or by prompting the user. This closes the loop so Claude always receives the full schema for every variable.

---

### What to build (single feature, one component)

**File:** `client/src/pages/Tools.jsx`

**Trigger:** Any time `form.body` changes (i.e. the body `onChange` handler fires).

**Logic:**

1. Parse `{varName}` patterns from the body text (no need to JSON-parse — just run the regex on the raw string):
   ```js
   const bodyVars = (form.body.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1));
   ```

2. Parse the current `form.params` JSON (or use `{}` if blank/invalid).

3. For each `varName` in `bodyVars` that is **not already** a key in `form.params`:
   - Add it automatically with a sensible default:
     ```js
     parsedParams[varName] = { type: 'string', required: true, description: '' };
     ```
   - Update `form.params` with `JSON.stringify(parsedParams, null, 2)`.

**Result:** The Default Params textarea stays in sync as the user types the body. No dialog needed — the param appears immediately and the user can edit type/description/required directly in the params textarea.

---

### Implementation sketch

Add a `useEffect` (or inline in the body `onChange`) in `Tools.jsx`:

```js
// Runs whenever body changes
const syncBodyVarsToParams = (bodyText) => {
  const bodyVars = (bodyText.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1));
  if (bodyVars.length === 0) return;

  let parsedParams = {};
  try {
    parsedParams = form.params ? JSON.parse(form.params) : {};
  } catch {
    return; // don't overwrite if params JSON is currently invalid
  }

  let changed = false;
  bodyVars.forEach(varName => {
    if (!parsedParams[varName]) {
      parsedParams[varName] = { type: 'string', required: true, description: '' };
      changed = true;
    }
  });

  if (changed) {
    setForm(f => ({ ...f, params: JSON.stringify(parsedParams, null, 2) }));
  }
};
```

Wire it into the body textarea `onChange`:
```jsx
<textarea
  value={form.body}
  onChange={e => {
    setForm({ ...form, body: e.target.value });
    syncBodyVarsToParams(e.target.value);
  }}
  placeholder='{"transition": {"id": "{transitionId}"}}'
/>
```

---

### Why this is the right approach

- No dialog, no extra step — the param just appears in the params box as the user types
- User can immediately adjust `type`, `required`, `description` in the params textarea
- On save, the backend receives `endpoint.params` with all vars — Issue 3-B enrichment is no longer the only safety net
- Consistent with how the server already substitutes `{varName}` at execution time
- Zero new dependencies

---

### After applying

1. Open Add Tool modal, select POST
2. Type `{"transition": {"id": "{transitionId}"}}` in Request Body
3. Default Params should auto-populate: `{ "transitionId": { "type": "string", "required": true, "description": "" } }`
4. User can edit the description/type before saving
5. Save — tool stored with `transitionId` in `endpoint.params`

---

## Issue 5 — Auto-populate not working + save broken due to two `setForm` calls in body `onChange`

**Status:** Open  
**Symptom:** Typing `{transitionId}` in Request Body does nothing — params don't auto-populate and the body text itself may not save, causing the tool save to fail.

---

### Root cause

In `client/src/pages/Tools.jsx`, the body `onChange` handler (added in commit `b97d1d9`) calls `setForm` **twice**:

```js
onChange={e => {
  const newBody = e.target.value;
  setForm({ ...form, body: newBody });        // ← call 1: stale spread
  // ...
  if (changed) {
    setForm(f => ({ ...f, params: ... }));    // ← call 2: functional updater
  }
}}
```

React batches state updates. Call 2 runs after call 1 — but call 2 uses the functional form `f => ...` which receives the result of call 1. However, call 1 uses the **stale** `form` spread (`{ ...form, body: newBody }`). If any other field changed between renders, the stale spread silently overwrites it.

More critically: when `changed` is true, call 2 sets `params` but it also re-spreads `f` which comes from call 1's result. The problem is that React **may discard call 1** when call 2 also triggers a re-render, depending on batching. The net result: `body` update is lost, params never appear.

---

### Fix — `client/src/pages/Tools.jsx`

Merge both `setForm` calls into one. Replace the entire body `onChange` handler:

```jsx
onChange={e => {
  const newBody = e.target.value;

  // Extract {varName} patterns from the new body text
  const bodyVars = (newBody.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1));

  setForm(f => {
    // Always update body
    const next = { ...f, body: newBody };

    // Auto-populate params for any new {varName} found
    if (bodyVars.length > 0) {
      let parsedParams = {};
      try {
        parsedParams = f.params ? JSON.parse(f.params) : {};
      } catch {
        parsedParams = {};
      }
      let changed = false;
      bodyVars.forEach(varName => {
        if (!parsedParams[varName]) {
          parsedParams[varName] = { type: 'string', required: true, description: '' };
          changed = true;
        }
      });
      if (changed) {
        next.params = JSON.stringify(parsedParams, null, 2);
      }
    }

    return next;
  });
}}
```

**Key change:** single `setForm(f => ...)` functional updater that reads the latest state (`f`) and writes both `body` and `params` atomically. No stale closure, no race condition.

---

### After applying

1. Open Add Tool modal, select POST method
2. Type `{"transition": {"id": "{transitionId}"}}` in Request Body
3. Default Params should immediately show:
   ```json
   {
     "transitionId": { "type": "string", "required": true, "description": "" }
   }
   ```
4. Save the tool — should succeed, body and params both stored correctly

---

## Issue 6 — Body template `{varName}` (unquoted) causes JSON parse error; number type lost at runtime

**Status:** Open  
**Two related problems — both need fixing.**

---

### Problem A — Unquoted `{transitionId}` is not valid JSON

The user writes:
```json
{
  "transition": {
    "id": {transitionId}
  }
}
```

`JSON.parse` rejects this because `{transitionId}` is not a valid JSON value.

### Problem B — Even when quoted, number type is lost at runtime

If stored as `{"id": "{transitionId}"}` (with quotes), the runtime substitution in `routes/mcp.js`:
```js
JSON.stringify(bodyParams).replace(/\{(\w+)\}/g, (match, key) =>
  mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : match
)
```
Replaces only the inner text `{transitionId}` but the surrounding quotes stay, producing:
```json
{"id": "21"}   ← string, not number
```
instead of:
```json
{"id": 21}    ← correct number
```

---

### Fix A — `client/src/pages/Tools.jsx` → body JSON parse in `handleSubmit`

Before parsing, auto-quote any unquoted `{varName}` placeholders so the JSON becomes valid:

```js
// Before
try {
  parsedBody = form.body ? JSON.parse(form.body) : {};
} catch (err) {
  alert('Invalid JSON in Request Body: ' + err.message);
  return;
}
```

```js
// After
try {
  // Normalize unquoted {varName} to "{varName}" so JSON.parse accepts it.
  // The type is preserved at runtime by the substitution fix (Issue 6 Fix B).
  const normalizedBody = (form.body || '').replace(/:\s*\{(\w+)\}/g, ': "{$1}"');
  parsedBody = normalizedBody ? JSON.parse(normalizedBody) : {};
} catch (err) {
  alert('Invalid JSON in Request Body: ' + err.message);
  return;
}
```

The regex `: {varName}` → `: "{varName}"` only targets unquoted placeholders (preceded by `:`). If the user already wrote `"{varName}"` with quotes, the regex won't match (no double-quoting).

Also apply the same normalization in the body `onChange` before extracting `bodyVars`, so the auto-populate still triggers:
```js
const normalizedBody = newBody.replace(/:\s*\{(\w+)\}/g, ': "{$1}"');
const bodyVars = (normalizedBody.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1));
```

---

### Fix B — `server/src/routes/mcp.js` → `/execute` body substitution

Replace the current substitution with one that handles quoted placeholders and preserves type:

```js
// Before
if (typeof bodyParams === 'object' && bodyParams !== null) {
  bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/\{(\w+)\}/g, (match, key) => {
    return mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : match;
  }));
}
```

```js
// After
if (typeof bodyParams === 'object' && bodyParams !== null) {
  let bodyStr = JSON.stringify(bodyParams);

  // Replace quoted placeholders first: "{varName}" → actual typed value
  // e.g. "{transitionId}" with value 21 → 21 (number, no surrounding quotes)
  bodyStr = bodyStr.replace(/"(\{(\w+)\})"/g, (match, placeholder, key) => {
    return mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : match;
  });

  // Then replace any remaining unquoted placeholders (safety net)
  bodyStr = bodyStr.replace(/\{(\w+)\}/g, (match, key) => {
    return mergedParams[key] !== undefined ? JSON.stringify(mergedParams[key]) : `"${match}"`;
  });

  bodyParams = JSON.parse(bodyStr);
}
```

---

### How the full flow works after both fixes

User writes (unquoted, invalid JSON):
```json
{ "transition": { "id": {transitionId} } }
```

**Frontend normalize** → stored as:
```json
{ "transition": { "id": "{transitionId}" } }
```

**Runtime: Claude passes** `transitionId = 21` (number)

**Substitution step 1** — matches `"{transitionId}"` (with quotes):
- Replaces entire `"..."` with `JSON.stringify(21)` = `21`
- Result: `{ "transition": { "id": 21 } }` ✓ correct number type

**Substitution step 1** — matches `"{statusName}"` with `statusName = "In Progress"`:
- Replaces entire `"..."` with `JSON.stringify("In Progress")` = `"In Progress"`
- Result: `{ "status": "In Progress" }` ✓ correct string type

---

### After applying both fixes

1. Write body as `{"transition": {"id": {transitionId}}}` (unquoted)
2. Save tool — should succeed (frontend normalizes to quoted form)
3. Claude calls the tool with `transitionId = 21`
4. Outgoing HTTP body: `{"transition": {"id": 21}}` — correct number, not string `"21"`

**Note:** Fix B (`mcp.js`) was applied in commit `e96f8ea`. **Server must be restarted** to pick it up. The double-quoting error will persist until the server process is restarted.

---

## Issue 7 — Body template vars added twice to POST body (root key + template substitution)

**Status:** Open  
**Symptom:** When calling `Set the transition for Jira` with `transitionId=21`, the outgoing Jira API request body is:
```json
{
  "transition": { "id": "21" },
  "transitionId": "21"
}
```
The `transitionId` key at the root is not a Jira field — it leaks through because the execute route unconditionally adds all non-path params to the root body object.

---

### Root cause — `server/src/routes/mcp.js` execute route

```js
} else if (['POST', 'PUT', 'PATCH'].includes(tool.endpoint.method)) {
  // ...
  } else if (key !== 'workspace' && key !== 'repo_slug') {
    bodyParams[key] = value;   // ← adds transitionId to root body
  }
}
```

Then the body template substitution ALSO processes `{transitionId}`. Result: the value appears twice — once at the root and once substituted inside the template.

---

### Fix — `server/src/routes/mcp.js` execute route

Before the param loop, compute the set of vars that are already handled by the body template:

```js
// Collect vars already covered by the body template
const bodyTemplateVars = new Set(
  (JSON.stringify(tool.endpoint.body || {}).match(/\{(\w+)\}/g) || [])
    .map(m => m.slice(1, -1))
);
```

Then in the param loop, skip those vars from root-body injection:

```js
} else if (['POST', 'PUT', 'PATCH'].includes(tool.endpoint.method)) {
  if (transformConfig[key]) {
    // ... transform logic unchanged
  } else if (key !== 'workspace' && key !== 'repo_slug' && !bodyTemplateVars.has(key)) {
    bodyParams[key] = value;   // ← only add if NOT already a body template var
  }
}
```

This way `transitionId` is substituted into `{"transition":{"id":"21"}}` via the template and is NOT also injected at the body root.

---

### After applying

Outgoing body for Jira transition call:
```json
{ "transition": { "id": "21" } }
```
Clean — no extra fields.

---

## Issue 8 — Spurious `allOf` param on OpenAPI-imported Bitbucket tools

**Status:** Open — requires code fix (cannot be cleared via UI)

**Tools affected:** `Create a pull request`, `Create a comment on a pull request`

**Symptom:** `allOf` appears as a body param in the tool schema. It is an OpenAPI schema keyword (`allOf` = schema composition) that the importer stored in `inputSchema.properties`. The edit form only exposes `endpoint.params` — so the user cannot see or remove `allOf` from the UI. Reimporting will recreate the same issue.

---

### Root cause

In `server/src/routes/integrations.js` → `POST /:id/import-tools` (line 623):

```js
inputSchema: ep.body ? {
  type: 'object',
  properties: { ...bodyParams, ...(ep.body.properties || {}) },
  required: bodyParamNames
} : {}
```

The Bitbucket OpenAPI spec defines some request bodies using `allOf` composition:
```json
{ "allOf": [{ "$ref": "#/components/schemas/PullRequestComment" }] }
```

After `resolveSchema()`, this may resolve to a schema whose `properties` object contains `allOf` as a key (a known quirk of some Bitbucket spec versions). That key then gets stored in `inputSchema.properties.allOf` and surfaced as a param by `GET /tools`.

---

### Fix — two places

**Fix 1 — `server/src/routes/integrations.js` import route (line 623)**

Filter out OpenAPI meta-keywords when building `inputSchema.properties`:

```js
const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);

inputSchema: ep.body ? {
  type: 'object',
  properties: Object.fromEntries(
    Object.entries({ ...bodyParams, ...(ep.body.properties || {}) })
      .filter(([key]) => !OPENAPI_KEYWORDS.has(key))
  ),
  required: bodyParamNames
} : {}
```

**Fix 2 — `server/src/routes/mcp.js` → `GET /tools` (inputSchema.properties loop)**

Same filter as a safety net for tools already in the DB:

```js
const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);

if (inputSchema.properties) {
  Object.entries(inputSchema.properties)
    .filter(([key]) => !OPENAPI_KEYWORDS.has(key))  // ← add this line
    .forEach(([key, val]) => {
      // ... existing params.push logic
    });
}
```

Fix 2 alone is sufficient to hide `allOf` immediately without reimporting. Fix 1 prevents it from being stored in the first place.

---

### After applying Fix 2 (minimum viable fix)

Restart server → `allOf` no longer appears in `GET /tools` for existing tools. No reimport needed.

---

## Issue 9 — OpenAPI importer should generate body templates from request body schema

**Status:** Open  
**Goal:** When importing tools from an OpenAPI spec, automatically generate `{varName}` body templates from the request body schema. This eliminates the need to manually set the body after import for POST/PUT/PATCH tools.

**Current behaviour:** Parser extracts the body schema correctly, but the import route discards it:
```js
body: ep.body ? {} : null   // always empty — schema thrown away
```

---

### Fix — three changes across two files

---

#### Change 1 — `server/src/services/openapi-parser.js` — fix `resolveRef` and `resolveSchema`

Currently `resolveRef` resolves only one level (doesn't recurse when the resolved schema itself has `$ref`). `resolveSchema` ignores `allOf` entirely. Replace both:

```js
// Fix resolveRef to recurse so nested $refs are fully resolved
const resolveRef = (ref) => {
  if (!ref || !ref.startsWith('#/')) return ref;
  const path = ref.replace('#/definitions/', '').replace('#/components/schemas/', '');
  const resolved = definitions[path];
  return resolved ? resolveSchema(resolved) : null;  // recurse into resolved schema
};

// Fix resolveSchema to handle allOf (merge sub-schemas)
const resolveSchema = (schema) => {
  if (!schema) return null;
  if (schema.$ref) return resolveRef(schema.$ref);

  // Merge allOf sub-schemas into one flat object schema
  if (schema.allOf) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const sub of schema.allOf) {
      const resolved = resolveSchema(sub);
      if (resolved?.properties) Object.assign(merged.properties, resolved.properties);
      if (resolved?.required) merged.required.push(...resolved.required);
    }
    return merged;
  }

  if (schema.type === 'object' && schema.properties) {
    const resolved = { ...schema };
    resolved.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      resolved.properties[key] = resolveSchema(value);
    }
    return resolved;
  }
  return schema;
};
```

---

#### Change 2 — `server/src/services/openapi-parser.js` — add `generateBodyTemplate()`

Add this function after `resolveSchema`:

```js
// Convert a resolved JSON Schema object into a {varName} template.
// Nested objects are recursed into; var names are flattened with _ separator.
// Arrays are skipped (too unpredictable to template).
const generateBodyTemplate = (schema, keyPrefix = '') => {
  if (!schema || schema.type !== 'object' || !schema.properties) return null;
  const SKIP = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);
  const template = {};
  for (const [key, val] of Object.entries(schema.properties)) {
    if (SKIP.has(key)) continue;
    const varName = keyPrefix ? `${keyPrefix}_${key}` : key;
    if (val?.type === 'object' && val?.properties) {
      const nested = generateBodyTemplate(val, varName);
      if (nested) template[key] = nested;
    } else if (val?.type === 'array') {
      // skip — arrays need manual setup
    } else {
      template[key] = `{${varName}}`;
    }
  }
  return Object.keys(template).length > 0 ? template : null;
};
```

Then expose `bodyTemplate` on each endpoint:

```js
endpoints.push({
  ...
  body: bodySchema,
  bodyTemplate: bodySchema ? generateBodyTemplate(bodySchema) : null,  // ← add this
  tags: details.tags || []
});
```

---

#### Change 3 — `server/src/routes/integrations.js` — use bodyTemplate in import route

Replace:
```js
body: ep.body ? {} : null
```

With:
```js
body: ep.bodyTemplate || (ep.body ? {} : null)
```

And update `allParams` to include vars from the body template (not just `ep.body.properties`):

```js
// Extract vars from body template instead of body.properties
if (isBodyMethod && ep.bodyTemplate) {
  const extractVars = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.startsWith('{')) {
        const varName = v.slice(1, -1);
        if (!allParams[varName]) {
          allParams[varName] = { required: true, type: 'string', description: `Body parameter: ${varName}` };
        }
      } else if (typeof v === 'object') {
        extractVars(v);
      }
    }
  };
  extractVars(ep.bodyTemplate);
}
```

---

### What this produces for Bitbucket "Create a pull request"

The Bitbucket spec defines `PullRequest` with `title`, `description`, `source.branch.name`, `destination.branch.name`, `close_source_branch`. After `resolveSchema` expands `allOf` + `$ref`, `generateBodyTemplate` produces:

```json
{
  "title": "{title}",
  "description": "{description}",
  "source": { "branch": { "name": "{source_branch_name}" } },
  "destination": { "branch": { "name": "{destination_branch_name}" } },
  "close_source_branch": "{close_source_branch}"
}
```

And `allParams` gets `title`, `description`, `source_branch_name`, `destination_branch_name`, `close_source_branch` — all visible to Claude without any manual editing.

---

### After applying

Delete and reimport the Bitbucket integration. All POST/PUT tools will have correct body templates and params set automatically.

---

## Issue 10 — OpenAPI discovery crashes (infinite recursion from circular `$ref`)

**Status:** Open — introduced in commit `377c5af`

**Symptom:** Clicking "Explore API" on any integration that has an OpenAPI spec with circular schema references (e.g. Bitbucket) causes a stack overflow / server crash. The discovery endpoint returns a 500 or never responds.

---

### Root cause

`resolveRef` was changed in `377c5af` to call `resolveSchema(resolved)` recursively:

```js
const resolveRef = (ref) => {
  const resolved = definitions[path];
  return resolved ? resolveSchema(resolved) : ref;  // ← resolveSchema may call resolveRef again
};
```

Many OpenAPI specs have circular references — e.g.:
```
PullRequest → $ref PullRequestCommit → $ref Author → $ref Account → $ref PullRequest → ...
```

Each cycle: `resolveSchema` → `resolveRef` → `resolveSchema` → … until stack overflow.

---

### Fix — `server/src/services/openapi-parser.js`

Add a `resolving` Set as a closure variable to track refs currently being resolved. If a ref is encountered again mid-resolution, return a stub instead of recursing:

```js
const resolving = new Set();  // ← add this before resolveRef

const resolveRef = (ref) => {
  if (!ref || !ref.startsWith('#/')) return ref;
  if (resolving.has(ref)) return { type: 'object', properties: {} };  // ← break the cycle
  const path = ref.replace('#/definitions/', '').replace('#/components/schemas/', '');
  const resolved = definitions[path];
  if (!resolved) return ref;
  resolving.add(ref);
  const result = resolveSchema(resolved);
  resolving.delete(ref);  // ← clean up so the same ref can be resolved elsewhere
  return result;
};
```

No change needed to `resolveSchema` — only `resolveRef` needs the guard.

---

### After applying

1. Restart the server
2. Open any integration → Explore API → should load without crashing
3. Reimport Bitbucket tools — circular schemas resolve to `{ type: 'object', properties: {} }` stub and are skipped gracefully

---

## Issue 11 — OpenAPI import marks all body params as required; ignores OpenAPI `required` array

**Status:** Open

**Symptom:** After importing tools from an OpenAPI spec, every body parameter is treated as required in the MCP tool schema - including fields that the spec marks as optional. The AI then tries to provide all params on every call, which breaks tools that have truly optional fields (e.g. `description`, `close_source_branch` on a Bitbucket PR).

---

### Root cause - `server/src/routes/integrations.js` → `POST /:id/import-tools`

**Problem 1 - `inputSchema.required` is set to all body param names (line ~657)**

```js
const bodyParamNames = [...Object.keys(bodyParams), ...bodyTemplateVars];
// ...
inputSchema: ep.bodyTemplate || ep.body ? {
  type: 'object',
  properties: { ... },
  required: bodyParamNames   // ALL body params, regardless of OpenAPI required array
} : {}
```

The parser correctly preserves the `required` array from the OpenAPI spec on `ep.body.required` (via `resolveSchema` which spreads the schema including its `required`). But the import route ignores it and uses `bodyParamNames` (which contains every field) instead.

**Problem 2 - body template var extraction hardcodes `required: true` (line ~623)**

```js
allParams[varName] = { required: true, type: 'string', description: `Body parameter: ${varName}` };
```

Every `{varName}` extracted from the body template is always marked required. The actual required status is available in `ep.body.required[]` and the type is in `ep.body.properties[varName]?.type`.

---

### Fix - `server/src/routes/integrations.js`

**Fix 1 - use `ep.body.required` for `inputSchema.required`**

Replace:
```js
required: bodyParamNames
```

With:
```js
required: ep.body?.required || []
```

This uses the required array from the OpenAPI spec. Only fields listed in `ep.body.required` will be marked required - the rest become optional.

---

**Fix 2 - use required status and type from `ep.body` when extracting body template vars**

Inside the `if (isBodyMethod && ep.bodyTemplate)` block, replace:
```js
allParams[varName] = { required: true, type: 'string', description: `Body parameter: ${varName}` };
```

With:
```js
const isRequired = (ep.body?.required || []).includes(varName);
const propType = ep.body?.properties?.[varName]?.type || 'string';
const propDesc = ep.body?.properties?.[varName]?.description || `Body parameter: ${varName}`;
allParams[varName] = { required: isRequired, type: propType, description: propDesc };
```

This correctly marks only OpenAPI-required fields as required, and preserves the actual type (e.g. `boolean` for `close_source_branch`, `integer` for numeric fields) from the spec.

---

### Example - Bitbucket "Create a pull request"

Bitbucket spec marks only `title` and `source` branch as required. `description`, `close_source_branch`, `destination` are optional.

**Before fix:** All params required - AI must provide every field on every call.

**After fix:**
```json
{
  "required": ["title", "source_branch_name"],
  "properties": {
    "title":                   { "type": "string",  "required": true },
    "source_branch_name":      { "type": "string",  "required": true },
    "destination_branch_name": { "type": "string",  "required": false },
    "description":             { "type": "string",  "required": false },
    "close_source_branch":     { "type": "boolean", "required": false }
  }
}
```

---

### After applying

Delete and reimport affected integrations. The AI will only be prompted for genuinely required params on each tool call.

---

## Issue 12 — MCP tool schema rejected by Anthropic: property key exceeds 64 chars

**Status:** Open

**Symptom:**
```
API Error: 400 {"error":{"message":"tools.11.custom.input_schema.properties:
Property keys should match pattern '^[a-zA-Z0-9_.-]{1,64}$'"}}
```
All tool calls fail because Anthropic rejects the entire tool list if any single tool has an invalid property key.

**Confirmed affected tools** (via `curl http://localhost:3000/api/mcp/tools`):
- `Create a pull request` - 11 bad keys (65-68 chars)
- `Update a pull request` - 11 bad keys
- `Create a comment on a pull request` - 38 bad keys
- `Update a comment on a pull request` - 38 bad keys

**Actual root cause - key length, not invalid characters.** The keys contain only valid chars (`[a-zA-Z0-9_]`) but exceed the 64-char limit. Examples:
```
destination_repository_mainbranch_target_author_user_display_name    (65 chars)
destination_repository_mainbranch_target_committer_user_display_name (68 chars)
```

**Why:** `generateBodyTemplate()` recursively flattens nested object schemas using `_` as a separator. Bitbucket's `PullRequest` schema has deeply nested response fields (`destination.repository.mainbranch.target.author.user.display_name`) that are not actual PR inputs. The flattened names exceed 64 chars and end up in both `inputSchema.properties` and `endpoint.params`. The MCP server (`mcp/server.js`) builds the tool schema from `endpoint.params` and sends these to Anthropic verbatim.

---

### Fix 1 (immediate, no reimport) - `server/src/mcp/server.js` → `registerTool`

Add a key validity guard before adding to the schema. This silently drops any key that would be rejected by AI provider APIs. Use `{1,64}` length limit with no dot (compatible with both Anthropic and OpenAI):

```js
const VALID_SCHEMA_KEY = /^[a-zA-Z0-9_\-]{1,64}$/;
const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);

for (const [key, param] of Object.entries(params)) {
  if (OPENAPI_KEYWORDS.has(key) || !VALID_SCHEMA_KEY.test(key)) continue;
  schema[key] = {
    type: param.type || 'string',
    description: param.description || key
  };
  if (param.required) {
    required.push(key);
  }
}
```

**After applying Fix 1:** Restart the server. Tools work immediately - no reimport needed.

---

### Fix 2 (prevent at source) - `server/src/services/openapi-parser.js` → `generateBodyTemplate`

The real fix: add a `maxDepth` parameter so the function stops recursing into deeply nested response schemas. A depth of 2 is enough for real inputs (e.g. `source.branch.name` = 2 levels); anything deeper is almost certainly a response-schema artefact, not a true input field.

```js
const generateBodyTemplate = (schema, keyPrefix = '', depth = 0) => {
  if (!schema || schema.type !== 'object' || !schema.properties) return null;
  if (depth >= 2) return null;  // stop at 2 levels deep — deeper fields are not real inputs
  const SKIP = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);
  const template = {};
  for (const [key, val] of Object.entries(schema.properties)) {
    if (SKIP.has(key)) continue;
    const varName = keyPrefix ? `${keyPrefix}_${key}` : key;
    if (varName.length > 64) continue;  // safety: skip if already too long
    if (val?.type === 'object' && val?.properties) {
      const nested = generateBodyTemplate(val, varName, depth + 1);
      if (nested) template[key] = nested;
    } else if (val?.type === 'array') {
      // skip — arrays need manual setup
    } else {
      template[key] = `{${varName}}`;
    }
  }
  return Object.keys(template).length > 0 ? template : null;
};
```

After applying Fix 2, delete and reimport Bitbucket tools. The generated body templates will only contain genuinely useful input fields.

---

### After applying both fixes

Fix 1 alone is sufficient to unblock tool calls immediately. Fix 2 is the clean solution that prevents the bloated templates from being generated during future imports.

---

## Issue 13 — `PUT /:id` stores plaintext credentials + leaks config in response

**Status:** Open  
**Severity:** 🔴 High (A), 🔴 Medium (B), 🟡 Low (C)

Three related issues in `server/src/routes/integrations.js` → `PUT /:id`.

---

### Problem A — PUT skips credential encryption (high risk)

`POST /:id` (create) encrypts credentials before storing:
```js
credentials.token = encryption.encrypt(credentials.token);
```

`PUT /:id` (update) saves `config` directly from the request body with no encryption:
```js
if (config !== undefined) integration.config = config;
await integration.save();
```

If a user submits new plaintext credentials via PUT (e.g. changing their API key), they are stored unencrypted in the database. The DynamicAdapter will still call `encryption.decrypt()` on them, which will return garbage, causing all tool calls to fail silently with wrong auth.

**Fix — `server/src/routes/integrations.js` PUT `/:id`**

Add the same encryption logic as the POST create route, before saving:

```js
if (config !== undefined) {
  // Re-encrypt credentials if provided in plaintext
  if (config.auth?.credentials && config.auth.type !== 'none') {
    const credentials = config.auth.credentials;
    if (credentials.token && !credentials.token.startsWith('U2FsdGVk')) {
      credentials.token = encryption.encrypt(credentials.token);
    }
    if (credentials.username && !credentials.username.startsWith('U2FsdGVk')) {
      credentials.username = encryption.encrypt(credentials.username);
    }
    if (credentials.apiKey && !credentials.apiKey.startsWith('U2FsdGVk')) {
      credentials.apiKey = encryption.encrypt(credentials.apiKey);
    }
  }
  integration.config = config;
}
```

---

### Problem B — PUT returns raw `integration` object including encrypted credentials (medium risk)

Line 229: `res.json(integration)` returns the full Sequelize model instance, which includes `config.auth.credentials` (encrypted values). Encrypted values should not be returned to the client — if the default `ENCRYPTION_KEY` is in use (development), they are trivially decryptable.

GET list and POST create both sanitize correctly. PUT must do the same.

**Fix — replace `res.json(integration)` with a sanitized response:**

```js
res.json({
  _id: integration.id,
  type: integration.type,
  name: integration.name,
  description: integration.description,
  baseUrl: integration.config.baseUrl,
  authType: integration.config.auth?.type || 'none',
  isActive: integration.isActive,
  updatedAt: integration.updatedAt
});
```

---

### Problem C — Wrong field path in `credentialsAreEncrypted` check (low risk)

In the `GET /:id/test` route (line ~306):

```js
// Bug: reads config.auth.token — should be config.auth.credentials.token
credentialsAreEncrypted: integration.config?.auth?.credentials?.token
  ? integration.config.auth.token.startsWith('U2FsdGVk')   // ← wrong path
  : false
```

Always evaluates to `false` because `integration.config.auth.token` is `undefined` (credentials live at `.credentials.token`). Not exploitable, but gives false assurance about encryption status.

**Fix:**
```js
credentialsAreEncrypted: integration.config?.auth?.credentials?.token
  ? integration.config.auth.credentials.token.startsWith('U2FsdGVk')
  : false
```

---

### After applying

- Credentials updated via PUT are properly encrypted before storage
- PUT response no longer leaks config/credentials to the client
- The test endpoint correctly reports whether credentials are encrypted

---

## Issue 14 — Hard-coded credentials in Default Params or body templates are visible to Claude

**Status:** Open  
**Severity:** 🟡 Security UX

**Context:** MCPConnect correctly keeps integration-level credentials (bearer tokens, API keys configured in the integration auth settings) invisible to Claude. However, if a user manually puts a credential value directly into **Default Params** or a **body template** — e.g. `{"api_key": "sk-abc123"}` in the body — that value becomes part of the tool schema and Claude can see it. This is user error but the UI gives no warning.

---

### What Claude sees vs. doesn't see

| Where credential is stored | Visible to Claude? |
|---|---|
| Integration auth config (bearer/apiKey/basic) | ❌ No — encrypted in DB, injected server-side |
| Default Params JSON | ✅ Yes — part of tool schema sent to AI |
| Body template hardcoded value | ✅ Yes — part of tool schema sent to AI |

---

### Fix — warn the user in the tool editor UI (`client/src/pages/Tools.jsx`)

Add a lightweight credential pattern detector that runs when Default Params or body content changes. If it finds a value that looks like a credential, show a visible warning banner.

**Pattern to detect** (covers most common API key/token formats):
```js
const CREDENTIAL_PATTERN = /(?:api[_-]?key|token|secret|password|bearer|auth)["\s]*[:=]["\s]*[a-zA-Z0-9_\-\.]{16,}/i;

const hasHardcodedCredential = (text) => CREDENTIAL_PATTERN.test(text);
```

**Where to add the warning** — in the Add/Edit tool modal, below the Default Params textarea and below the Request Body textarea:

```jsx
{hasHardcodedCredential(form.params) && (
  <div style={{ color: '#dc3545', fontSize: '0.8rem', marginTop: '0.25rem' }}>
    ⚠ This field appears to contain a credential. Values in Default Params are visible to the AI. 
    Use Integration auth settings to store credentials securely.
  </div>
)}

{hasHardcodedCredential(form.body) && (
  <div style={{ color: '#dc3545', fontSize: '0.8rem', marginTop: '0.25rem' }}>
    ⚠ This field appears to contain a credential. Values in the body template are visible to the AI. 
    Use Integration auth settings to store credentials securely.
  </div>
)}
```

This does not block saving — it is a warning only. The user may have a legitimate reason (e.g. a non-sensitive default value that looks like a key). The warning is advisory.

---

### After applying

Users who accidentally paste credentials into Default Params or body templates will see a clear warning directing them to use the Integration auth settings instead.

---

---

## Issue 15 — OAuth token refresh is signaled but never executed

**Status:** Open

**Symptom:** OAuth tokens expire and API calls start returning 401. The app never automatically refreshes them, even though a refresh service exists.

**Root cause — two disconnected implementations:**

`oauth.js` has a complete `getValidToken()` / `refreshToken()` implementation, but `DynamicAdapter.js` never calls it. Instead, `DynamicAdapter` does its own inline expiry check (lines 62-67) and returns an `X-OAuth-Refresh: true` header as a signal:

```js
if (Date.now() > (expiresAt - fiveMinutes) && credentials.refreshToken) {
  return { 'Authorization': `Bearer ${accessToken}`, 'X-OAuth-Refresh': 'true' };
}
```

Nothing reads that header and triggers a refresh. The old expired token is sent to the provider's API, which returns 401. The user has no way to recover without manually re-authenticating.

**Fix — replace the inline check with a call to `getValidToken`:**

In `server/src/adapters/DynamicAdapter.js`, change the `case 'oauth2':` block to:

```js
case 'oauth2': {
  const { getValidToken } = require('../services/oauth');
  const { Integration } = loadModels(); // or pass integration as context

  // Try to get a valid (possibly refreshed) token
  const tokenResult = await getValidToken(this.auth.provider, credentials);

  let accessToken;
  if (tokenResult?.accessToken) {
    // Refreshed — persist new token back to DB
    const decrypted = encryption.decrypt(tokenResult.accessToken) || tokenResult.accessToken;
    accessToken = decrypted;

    // Save refreshed token back so the next request doesn't refresh again
    await Integration.update(
      {
        credentials: encryption.encrypt(JSON.stringify({
          ...credentials,
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          tokenData: { createdAt: tokenResult.createdAt, expiresIn: tokenResult.expiresIn }
        }))
      },
      { where: { id: this.integrationId } }
    );
  } else {
    accessToken = encryption.decrypt(credentials.accessToken) || credentials.accessToken;
  }

  if (!accessToken) return {};
  return { 'Authorization': `Bearer ${accessToken}` };
}
```

**Note:** `DynamicAdapter` needs to receive `integrationId` as a constructor argument so it can persist the refreshed token. Check how it is instantiated in `consume.js` and `mcp/server.js` and pass `integration.id` through.

---

## Issue 16 — OAuth refresh does not persist the new token

**Status:** Open (companion to Issue 15)

**Symptom:** Even if `getValidToken` is called, the refreshed token is returned in memory but never written back to the database. The next request will attempt another refresh — and for providers that issue single-use refresh tokens (Google, Notion), the second refresh will fail with 400, permanently locking the user out.

**Root cause:**

`oauth.js` `getValidToken()` returns the new encrypted token but has no database access:

```js
return {
  accessToken: encryption.encrypt(refreshed.accessToken),
  refreshToken: encryption.encrypt(refreshed.refreshToken || storedTokens.refreshToken),
  createdAt: refreshed.createdAt,
  expiresIn: refreshed.expiresIn
};
```

The caller (`DynamicAdapter`) does nothing with this return value — it is discarded.

**Fix:** As described in Issue 15 — the caller must persist the returned token back to the `integrations` table immediately after a successful refresh. This is especially critical for Google and Notion which rotate refresh tokens on every use.

---

## Issue 17 — Linear OAuth `authUrl` has wrong domain

**Status:** Open

**Symptom:** Clicking "Connect with Linear" opens a browser to `https://linear/oauth/authorize` — an invalid URL. The OAuth dance never starts.

**Root cause:**

In `server/src/services/oauth.js`, the Linear provider config has a typo:

```js
linear: {
  authUrl: 'https://linear/oauth/authorize',  // ← missing .app
  ...
}
```

**Fix — one character:**

```js
linear: {
  authUrl: 'https://linear.app/oauth/authorize',
  tokenUrl: 'https://api.linear.app/oauth/token',
  scopes: ['read', 'write'],
  baseUrl: 'https://api.linear.app'
},
```

---

## Issue 18 — Jira and Notion OAuth token exchange will fail

**Status:** Open

**Symptom:** After the OAuth redirect, exchanging the code for a token fails silently. The user is redirected back but no token is stored.

### Jira — wrong OAuth version endpoints

The current config uses OAuth 1.0a-style endpoints (`{baseUrl}/oauth/authorize`). Jira Cloud uses Atlassian's OAuth 2.0 (3LO) with fixed Atlassian auth URLs, not instance-relative ones.

**Fix:**

```js
jira: {
  name: 'Jira',
  authUrl: 'https://auth.atlassian.com/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
  baseUrl: null,
  // Jira Cloud requires audience param
  extraAuthParams: { audience: 'api.atlassian.com', prompt: 'consent' }
},
```

The `audience=api.atlassian.com` and `prompt=consent` params are required by Atlassian — without them the token will not have the right claims and all API calls will return 403. Update `buildAuthUrl()` to append `extraAuthParams` if present.

### Notion — wrong Content-Type and missing Basic auth

Notion's token endpoint requires:
- `Authorization: Basic base64(clientId:clientSecret)` header
- `Content-Type: application/json`
- JSON body (not URL-encoded form)

The current `exchangeCode()` sends all providers as `URLSearchParams` (URL-encoded form) with no Authorization header. Notion returns 400.

**Fix — add a provider-specific branch in `exchangeCode()`:**

```js
if (provider === 'notion') {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await axios.post(tokenUrl, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  }, {
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json'
    }
  });
  // ... same return mapping
}
```
