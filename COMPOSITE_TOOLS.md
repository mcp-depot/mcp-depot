# Composite Tools — Developer Guideline

> Feature 6. A composite tool chains multiple existing tools in sequence.
> From the AI's perspective it is one MCP tool call. Toolshed executes the steps internally.

---

## The Problem

Some operations require multiple API calls in sequence. Today Claude has to:
1. Call `get_jira_transitions` (GET /issue/{id}/transitions) → get a list
2. Manually find the right transition ID in the result
3. Call `set_jira_transition` (POST /issue/{id}/transitions) with that ID

That is 2 tool calls, 2 round-trips, and requires Claude to understand the Jira transitions API shape.

With a composite tool the user builds `set_jira_status(issueId, targetStatus)` once.
Claude calls it once. Toolshed does the 2 steps internally and returns the final result.

---

## User-Facing Concept

- A composite tool is created from an integration that already has **at least 2 tools**
- The user picks tools in order (Step 1, Step 2, …) and maps how the output of each step feeds into the next
- The final tool exposed to Claude has its own name, description, and input schema — the internals are hidden
- Max recommended steps: 5 (keep chains simple and debuggable)

---

## Jira Example (reference throughout this doc)

**Goal:** `set_jira_status(issueId: string, targetStatus: string)`

| Step | Tool used | What it does |
|------|-----------|-------------|
| 1 | `get_transitions` | `GET /rest/api/3/issue/{issueId}/transitions` → returns array of `{id, name}` |
| 2 | `set_transition` | `POST /rest/api/3/issue/{issueId}/transitions` with body `{ transition: { id: <from step 1> } }` |

Step 1 returns an array. The user needs to extract the `id` where `name == targetStatus`.
Step 2 uses that extracted id in its request body.

---

## Data Model

### Option: Extend the existing `Tool` table

Add two columns to `tools`:

```sql
ALTER TABLE tools
  ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'simple',
  ADD COLUMN steps JSONB;
```

- `type` = `'simple'` (existing behaviour) or `'composite'`
- `steps` = null for simple tools, array of step objects for composite tools
- All existing columns (`name`, `description`, `inputSchema`, `integrationId`) remain and are still used for composite tools — they define what Claude sees

No new table needed. A composite tool is still a tool row, it just has a `steps` payload and its `inputSchema` is what the user defines (the "outer" inputs Claude provides).

### Step object schema (stored in `steps` JSONB)

```jsonc
{
  "id": "step_1",                 // stable internal id, user-assigned label
  "label": "Get Transitions",     // display label in the builder UI
  "toolId": 42,                   // FK to tools.id — must be a 'simple' tool in same integration
  "inputMappings": {              // maps each input of the referenced tool to a source
    "issueId": {
      "source": "input",          // "input" = from composite tool's own inputs
      "key": "issueId"
    }
  },
  "extractors": [                 // named extractions from this step's response (optional)
    {
      "name": "transitionId",     // referenced as {{steps.step_1.extract.transitionId}}
      "arrayPath": "transitions", // path into response to reach the array
      "filterField": "name",      // filter array items where this field...
      "filterValue": "{{inputs.targetStatus}}", // ...equals this value (supports templates)
      "selectField": "id"         // extract this field from the matched item
    }
  ]
}
```

Step 2 example:

```jsonc
{
  "id": "step_2",
  "label": "Set Transition",
  "toolId": 43,
  "inputMappings": {
    "issueId": {
      "source": "input",
      "key": "issueId"
    },
    "body": {
      "source": "expression",
      "value": "{ \"transition\": { \"id\": \"{{steps.step_1.extract.transitionId}}\" } }"
    }
  },
  "extractors": []
}
```

### inputMapping sources

| `source` | Meaning | Required keys |
|----------|---------|--------------|
| `"input"` | From the composite tool's outer input schema (what Claude provides) | `key` |
| `"step"` | A named extraction from a previous step | `stepId`, `extractName` |
| `"expression"` | A literal string with `{{…}}` interpolation | `value` |
| `"literal"` | A hardcoded value, no interpolation | `value` |

---

## Template Syntax

Two namespaces, resolved at execution time:

| Syntax | Resolves to |
|--------|------------|
| `{{inputs.fieldName}}` | The value Claude provided for that composite tool input |
| `{{steps.step_1.response.path.to.field}}` | A field from step 1's raw response body (dot-path) |
| `{{steps.step_1.extract.extractorName}}` | A named extraction result from step 1 |

Resolution is done with a simple recursive template resolver — no need for full JMESPath unless you want to add it later.

---

## Backend: Execution Engine

### Location

New file: `server/src/services/compositeExecutor.js`

### Algorithm

```js
async function executeComposite(tool, inputs, userId) {
  const stepResults = {};   // stepId -> { response, extract }

  for (const step of tool.steps) {
    // 1. Resolve this step's input mappings
    const resolvedInputs = resolveInputs(step.inputMappings, inputs, stepResults);

    // 2. Load the referenced simple tool
    const simpleTool = await Tool.findByPk(step.toolId);

    // 3. Execute it (reuse the existing single-tool execution path)
    const result = await executeSimpleTool(simpleTool, resolvedInputs, userId);

    // 4. Run extractors on the response
    const extractions = runExtractors(step.extractors, result.data, inputs, stepResults);

    // 5. Store for subsequent steps
    stepResults[step.id] = { response: result.data, extract: extractions };
  }

  // Return the final step's response as the composite tool result
  const lastStep = tool.steps[tool.steps.length - 1];
  return stepResults[lastStep.id].response;
}
```

### resolveInputs

Walk the inputMappings object. For each mapping:
- `source: "input"` → `inputs[key]`
- `source: "step"` → `stepResults[stepId].extract[extractName]`
- `source: "expression"` → replace `{{…}}` tokens in `value`
- `source: "literal"` → return `value` as-is

### runExtractors

For each extractor:
1. Navigate to `arrayPath` in the response (dot-path)
2. Find the first array item where `item[filterField] == resolvedFilterValue`
3. Return `item[selectField]`
4. Store as `extractions[name]`

If no match found, store `null` and continue (let the next step fail naturally with a clear error).

### Error handling

If any step throws:
```json
{
  "error": "Composite tool failed at step 2 (Set Transition): API Error: 404 Not Found",
  "failedStep": "step_2",
  "failedStepLabel": "Set Transition",
  "completedSteps": ["step_1"]
}
```

Return this as the MCP tool result (not an HTTP 500) — the AI can read it and explain to the user.

### Where to hook in

In `server/src/routes/mcp.js`, in the tool execution handler, add a branch:

```js
if (tool.type === 'composite') {
  result = await executeComposite(tool, toolInputs, req.user?.id);
} else {
  result = await executeSimpleTool(tool, toolInputs, userId);
}
```

---

## API Endpoints

```
POST /api/tools/composite          Create a composite tool
PUT  /api/tools/composite/:id      Update a composite tool
GET  /api/tools/composite/:id      Get full definition (steps included)
POST /api/tools/composite/:id/test Run the chain with provided inputs, return per-step trace
```

The test endpoint returns the full trace (each step's resolved inputs + response + extractions) — essential for the builder UI to show live results.

```json
// POST /api/tools/composite/:id/test
// Body: { "inputs": { "issueId": "P20009868-47", "targetStatus": "In Progress" } }

// Response:
{
  "steps": [
    {
      "id": "step_1",
      "label": "Get Transitions",
      "resolvedInputs": { "issueId": "P20009868-47" },
      "response": { "transitions": [{ "id": "31", "name": "In Progress" }, ...] },
      "extractions": { "transitionId": "31" },
      "durationMs": 240
    },
    {
      "id": "step_2",
      "label": "Set Transition",
      "resolvedInputs": { "issueId": "P20009868-47", "body": { "transition": { "id": "31" } } },
      "response": {},
      "extractions": {},
      "durationMs": 180
    }
  ],
  "result": {},
  "totalDurationMs": 420
}
```

---

## UI: Composite Tool Builder

### Tools page: separate section

Composite tools **must not appear in the flat tools list**. They behave differently - one call triggers multiple API calls internally - and mixing them with simple tools confuses users who are editing, debugging, or bulk-managing tools.

**Recommended layout on the Tools page:**

```
Tools
├── Simple Tools          (existing list)
│     GET /issues
│     POST /comment
│     ...
│
└── Composite Tools       (new collapsible section, below simple tools)
      ⚡ Set Jira Status    2 steps
      ⚡ Create & Assign    3 steps
      ＋ New Composite Tool
```

Rules:
- Composite tools get their own section header ("Composite Tools") with a distinct icon (⚡ or ⛓)
- Each composite tool card shows: name, description, step count, and a "⚡ Composite" badge so the user always knows it is not a direct API call
- The badge tooltip (or inline label) should say: "This tool chains multiple API calls internally"
- Composite tools are **excluded from bulk actions** on simple tools (enable/disable/delete multi-select applies to simple tools only)
- In the MCP tool list exposed to Claude, composite tools appear normally - the distinction is only in the admin UI

### Entry point

On the Tools page, "Create Tool" button gets a dropdown:
- Simple Tool ← existing flow
- Composite Tool ← new (only shown when integration has ≥ 2 tools; greyed out with tooltip "Add at least 2 tools to this integration first" otherwise)

Or inside an integration detail view: "＋ Composite Tool" button in the composite section.

### Builder layout (3-panel)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  COMPOSITE TOOL BUILDER                                                 │
│  Name: [__________________]   Description: [__________________________] │
├──────────────┬──────────────────────────────────┬───────────────────────┤
│  STEPS       │  STEP DETAIL                     │  OUTER INPUTS         │
│              │                                  │                       │
│  ① Get       │  Tool: Get Transitions ▾         │  These are what       │
│  Transitions │                                  │  Claude provides.     │
│  ──────────  │  Input Mappings                  │                       │
│  ② Set       │  issueId ←── ○ inputs.issueId    │  + Add Input          │
│  Transition  │                                  │                       │
│  ──────────  │  Extractors                      │  issueId  string  ✕  │
│  ＋ Add Step │  [＋ Add Extractor]               │  targetStatus str ✕  │
│              │                                  │                       │
│              │  [Test Step]  [Run Full Chain]   │                       │
└──────────────┴──────────────────────────────────┴───────────────────────┘
```

### Steps panel (left)

- Each step is a card showing its label and the tool it uses
- Steps can be reordered by drag-and-drop (react-beautiful-dnd or dnd-kit)
- Click a step to open its detail in the centre panel
- "＋ Add Step" opens a dropdown of available simple tools in this integration

### Step detail panel (centre)

**Input Mappings section**

Shows a row for each input the referenced tool requires. Each row has:
- Input name (label)
- A mapping control: dropdown showing available sources

The source dropdown options:
```
── From Claude's inputs ──
  • issueId
  • targetStatus

── From Step 1: Get Transitions ──
  • response.transitions  (array)
  • extract.transitionId
  • response.[any other field]

── Manual value ──
  • Enter expression...
```

Selecting a source wires up the mapping. No drag required for simple cases.

**Drag-and-drop wiring (the power feature)**

For visual clarity, also support a "wiring" mode where:
- The right column (source tree) shows a tree of all available values:
  ```
  ▼ Claude Inputs
      issueId
      targetStatus
  ▼ Step 1: Get Transitions
    ▼ response
      ▼ transitions  (array[])
          [0].id
          [0].name
      extract.transitionId
  ```
- The centre panel shows the current step's input fields as drop targets
- User drags `extract.transitionId` from the source tree and drops it onto the `transitionId` input field
- This sets the mapping `source: "step", stepId: "step_1", extractName: "transitionId"`

**Extractor configurator**

When a step returns an array and the user drags that array field onto an input, show an inline extractor form:

```
Array field: transitions
─────────────────────────────────
Filter where:  name  ==  [{{inputs.targetStatus}}]
Extract field: id
Save as:      [transitionId        ]
─────────────────────────────────
[Save Extractor]
```

This creates the extractor definition and the named extraction becomes available as `{{steps.step_1.extract.transitionId}}` for all subsequent steps.

**Test panel (bottom of centre)**

"Run Full Chain" button:
- Prompts for the outer inputs (small form, one field per defined input)
- Calls `POST /api/tools/composite/:id/test`
- Shows per-step trace: resolved inputs, raw response, extractions, duration
- Errors highlight the failing step in the steps panel

### Outer Inputs panel (right)

Defines the `inputSchema` — what Claude sees. Standard field editor:
- Name, Type (string / number / boolean), Required, Description
- These are the `inputs.*` values available to all step mappings

---

## Phased delivery

### Phase 1 — Core (get it working)

- DB migration (add `type` + `steps` columns)
- Execution engine (`compositeExecutor.js`)
- API endpoints (create, update, test)
- Builder UI with **dropdown source selectors** (no drag-and-drop yet)
- MCP exposure (composite tool appears in tool list and is callable)
- Test trace UI

This alone delivers the full value. The Jira example works end-to-end.

### Phase 2 — Visual wiring (polish)

- Drag-and-drop step reordering
- Source tree with drag-to-wire onto input fields
- Array extractor configurator on drop
- Visual connector lines between steps (canvas-style, optional)

---

## Constraints and edge cases

| Case | Behaviour |
|------|-----------|
| Step references a tool that was deleted | Block save; show warning |
| Circular reference (step refs itself) | Validate on save; reject |
| Extractor finds no matching array item | Store `null`; next step fails with clear message |
| Step 1 returns non-JSON | Stop chain; return error with step label |
| Tool in a different integration | Block; all steps must share the same integration |
| Composite tool used as a step inside another composite | Block; only simple tools can be steps |
| User runs composite tool but has no credentials for the integration | Same error as simple tool: `CREDENTIALS_REQUIRED` |

---

## MCP Schema exposed to Claude

The composite tool's `inputSchema` (the outer inputs the user defines) is registered in the MCP tool list exactly like a simple tool. Claude cannot tell the difference. Example:

```json
{
  "name": "set_jira_status",
  "description": "Transitions a Jira issue to a given status by name. Handles fetching the transition ID automatically.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "issueId": { "type": "string", "description": "The Jira issue key, e.g. P20009868-47" },
      "targetStatus": { "type": "string", "description": "The status name to transition to, e.g. In Progress" }
    },
    "required": ["issueId", "targetStatus"]
  }
}
```

---

## Libraries

### What is already in the project — use these, do not duplicate

**Server (`server/package.json`):**

| Library | Already used for | Use in composite tools for |
|---------|-----------------|---------------------------|
| `express` | All routing | New composite tool routes |
| `joi` | Request validation | Validate step definitions on save |
| `sequelize` | ORM | `Tool.findByPk()` to load referenced simple tools |
| `uuid` | ID generation | Generate stable `step.id` values on create |
| `axios` | `DynamicAdapter.js` | No direct use — execution reuses `DynamicAdapter` |
| `pino` | Logging | Log step execution + errors in the executor |

**Client (`client/package.json`):**

| Library | Already used for | Use in composite tools for |
|---------|-----------------|---------------------------|
| `react-select` | Dropdowns | Source selector in input mapping rows |
| `lucide-react` | All icons | Step cards, badges, connector icons |
| `axios` | API calls | Composite tool CRUD + test-trace calls |
| `react-router-dom` | Routing | Route to `/tools/composite/new` and `/tools/composite/:id` |

---

### New libraries to install

#### Client — one required, one optional

**1. `@dnd-kit/core` + `@dnd-kit/sortable` (required for Phase 2 drag-and-drop)**

```bash
cd client && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Why this over alternatives:
- `react-beautiful-dnd` is deprecated and broken in React 18 strict mode
- `react-dnd` is lower-level and requires more boilerplate
- `@dnd-kit` is the current standard for React 18, actively maintained, accessible, small

Use `@dnd-kit/sortable` for step reordering in the left panel.
Use `@dnd-kit/core` for the drag-from-source-tree → drop-onto-input-field wiring.

Phase 1 can skip this entirely (use dropdown selectors instead). Add it in Phase 2.

**2. `@xyflow/react` (optional — only if developer wants a canvas-style flow diagram)**

```bash
cd client && npm install @xyflow/react
```

This renders nodes and animated connector lines between steps (like a mini workflow canvas).
It is the right choice if the builder should feel like a visual flow editor.
It is overkill if the builder stays as a 3-panel form. Defer to Phase 2 and only add if the developer wants the canvas look.

Do NOT add `reactflow` — it was renamed to `@xyflow/react`. They are the same library.

---

#### Server — no new libraries needed

The execution engine can be built entirely with existing dependencies:

**Template resolution** (`{{inputs.x}}`, `{{steps.step_1.extract.name}}`):
Write a 10-line resolver, no library needed:
```js
function resolveTemplate(template, context) {
  return String(template).replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], context);
    return value !== undefined ? value : `{{${path}}}`;
  });
}
// context = { inputs: { issueId: "P20009868-47" }, steps: { step_1: { extract: { transitionId: "31" } } } }
```

**Deep path access** (navigating `response.transitions[0].id`):
Write a small helper, no library needed:
```js
function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((current, key) => current?.[key], obj);
}
```
This handles dot notation (`a.b.c`). Array index access (`transitions[0].id`) is not needed — the extractor system handles arrays explicitly without index notation.

Do NOT add `lodash` just for this. The two helpers above are sufficient and keep the bundle lean.

---

### Decision summary

```
Phase 1 — zero new npm installs
  Server: nothing new
  Client: nothing new (use react-select for source dropdowns)

Phase 2 — one install on client
  Client: npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

Phase 2 (optional canvas look)
  Client: npm install @xyflow/react
```

---

## File checklist for the developer

```
server/src/services/compositeExecutor.js     ← NEW: execution engine
server/src/routes/tools.js                   ← add composite CRUD routes
server/src/routes/mcp.js                     ← branch on tool.type === 'composite'
server/migrations/YYYYMMDD-composite-tools.js ← add type + steps columns

client/src/pages/CompositeToolBuilder.jsx    ← NEW: builder UI
client/src/components/StepCard.jsx           ← NEW: step card in left panel
client/src/components/InputMappingRow.jsx    ← NEW: one mapping row with source selector
client/src/components/ExtractorForm.jsx      ← NEW: array extractor configurator
client/src/components/StepTrace.jsx          ← NEW: per-step test result display
client/src/api/tools.js                      ← add composite endpoints
```

---

## Summary

The implementation splits cleanly into:
1. **Data** — two extra columns on `tools`, no new table
2. **Engine** — `compositeExecutor.js`, sequential, resolves templates, runs extractors
3. **API** — CRUD + test-trace endpoint
4. **UI** — 3-panel builder; Phase 1 uses dropdowns, Phase 2 adds drag-and-drop

The drag-and-drop is the right UX choice. It is a Phase 2 item so it does not block shipping the feature — but design the data model and UI layout for it from day one so Phase 2 is additive, not a rewrite.
