# MCPConnect — New Feature Ideas

> Killer features that could make MCPConnect the go-to MCP tool manager.
> Each section has a rough implementation sketch so a developer can pick one up and run.

---

## Feature 1 — Tool Marketplace 🏆

**Why it's the killer feature:** Tool definitions are just JSON. MCPConnect is already the right shape for a community registry. Nobody has done this for MCP yet. More users → more tool packs → more users — the classic network effect.

**What it looks like:**
```
Marketplace → Browse "Jira Pack" → Preview (12 tools) → Install → Done
```

### Implementation sketch

**Phase 1 (quick):** Community registry as a GitHub repo (`mcpconnect/marketplace`). Users submit PRs with their pack JSON. MCPConnect UI fetches from the raw GitHub URL.

**Pack format** (reuse existing export JSON):
```json
{
  "name": "Jira Pack",
  "slug": "jira",
  "description": "Create issues, search, transition status",
  "author": "mcpconnect",
  "version": "1.0.0",
  "tags": ["project-management", "atlassian"],
  "integration": { "type": "custom", "authType": "bearer", "baseUrl": "https://your-domain.atlassian.net" },
  "tools": [ ...existing tool definition format... ]
}
```

**New endpoints:**
```
GET  /marketplace/packs            → list all published packs
GET  /marketplace/packs/:slug      → pack details + tool definitions
POST /marketplace/packs/:slug/install → install into user's instance
```

**UI:** New "Marketplace" tab in sidebar — browse, search by tag, one-click install.

**Phase 2:** Hosted registry with ratings, install counts, verified packs.

---

## Feature 2 — Smart OpenAPI Import (Upgraded)

**Why it matters:** Reduce setup friction without needing an LLM. The existing OpenAPI import does basic field mapping — upgrade it.

### 2a — Better OpenAPI import

- **Smart tool naming:** `POST /v1/charges` → `create_charge` (verb from method + noun from path, snake_case)
- **Type inference:** map OpenAPI `integer`/`number`/`boolean` → correct JSON Schema types (currently everything becomes `string`)
- **Required field detection:** read `required: []` array from OpenAPI request body schema
- **Conflict detection:** if a tool with the same name exists, prompt to skip/rename/overwrite

### 2b — Raw JSON tool import

For AI-assisted creation: user asks Claude/Cursor "write me a MCPConnect tool definition for Stripe charges", pastes the JSON → MCPConnect validates and imports it.

```
POST /api/integrations/:id/import-raw
Body: { tools: [ ...tool definition JSON... ] }
```

### 2c — URL-to-tools shortcut

User pastes any API base URL → MCPConnect attempts to auto-discover the OpenAPI spec (tries `/openapi.json`, `/swagger.json`, `/api-docs`) and runs the import automatically.

---

## Feature 3 — OAuth Manager

**Why it matters:** OAuth is where 90% of API integrations die. Handle the dance once, store and auto-refresh tokens — tools just work.

**New integration auth type:** `oauth2` (alongside existing `bearer`, `basic`, `apikey`)

**Built-in providers to start:** GitHub, Google, Notion, Slack, Linear, Jira/Confluence

**New endpoints:**
```
GET  /api/oauth/:provider/authorize  → redirect to provider OAuth URL
GET  /api/oauth/:provider/callback   → exchange code for token, store encrypted
POST /api/oauth/:provider/refresh    → manual token refresh
```

**Auto-refresh:** On each tool call, check if access token expires within 5 minutes → refresh before calling.

---

## Feature 4 — Tool Call Inspector (Replay + Debug)

**Why it matters:** When an AI does something unexpected, you need to see exactly what it called and what came back. No other MCP tool manager has this. The `tool_calls` table already captures everything — this is mostly frontend work.

**What it looks like:**
- Live feed: every tool call in real time, with params + response + latency
- Click any call → replay it with the same params
- Filter by tool, integration, time range, success/error

**New endpoints:**
```
GET  /api/tool-calls/stream    → SSE stream of new ToolCall records
POST /api/tool-calls/:id/replay → re-execute with same params
```

---

## Feature 5 — Mock Mode / Sandbox

Toggle any tool to return a static mock response without hitting the real API. Useful for demos, development, and testing AI behaviour.

**Schema change:** Add `mockEnabled: boolean` and `mockResponse: jsonb` to `tools` table.

**Execution change:**
```js
if (tool.mockEnabled && tool.mockResponse) {
  return interpolateMock(tool.mockResponse, params);
}
```

**Template support:** `{ "id": "{{uuid}}", "name": "{{params.name}}" }`

---

## Feature 6 — Optional LLM Integration ("Bring Your Own LLM")

MCPConnect should never *require* an LLM — it's a tool manager. But if a user has an API key, MCPConnect can use it to supercharge several features. Same pattern used by n8n, Flowise, Open WebUI.

**Admin configures once in system settings:**
```
Settings → AI Provider → [OpenAI | Anthropic | Ollama | Custom OpenAI-compatible]
```

If no provider configured → AI features hidden. Core MCPConnect works exactly as today.

**Features that unlock with LLM connected:**
- Tool generation from natural language description
- Auto-improve imported tool names/descriptions to be more AI-friendly
- Error diagnosis: "Explain this error" sends error + tool definition to LLM

**Supported providers:**

| Provider | Notes |
|---|---|
| OpenAI | GPT-4o, GPT-4o-mini |
| Anthropic | claude-3-5-sonnet, claude-haiku |
| Ollama | Fully local — best for enterprises, no data leaves the machine |
| Any OpenAI-compatible | LM Studio, Together AI, Groq, etc. via custom base URL |

---

## Feature 7 — Composite Tools (Multi-Step Tool Chaining)

**Why it matters:** Some API operations require multiple calls in sequence — but the AI client shouldn't have to know that. A composite tool exposes a single MCP tool while MCPConnect internally chains the required calls, passing outputs from one step into the next.

**Real example — "Set Jira Status":**

Without composite tools, Claude must:
1. Call `get_jira_transitions(issueId)` → get list of available transitions
2. Find the transition ID matching the requested status
3. Call `post_jira_transition(issueId, transitionId)` → set status

With a composite tool, Claude calls one tool:
```
set_jira_status(issueId="P-222", status="In Progress")
→ MCPConnect internally chains both calls
→ Returns: { success: true, status: "In Progress" }
```

### Implementation sketch

**New tool type:** `composite` (alongside existing single-endpoint tools)

**Tool definition format:**
```json
{
  "name": "set_jira_status",
  "description": "Set the status of a Jira issue by name",
  "type": "composite",
  "inputs": [
    { "name": "issueId", "type": "string", "required": true },
    { "name": "status",  "type": "string", "required": true, "description": "e.g. In Progress, Done, To Do" }
  ],
  "steps": [
    {
      "name": "get_transitions",
      "integration": "jira",
      "method": "GET",
      "path": "/rest/api/3/issue/{{inputs.issueId}}/transitions",
      "extract": {
        "transitionId": "transitions[?name=='{{inputs.status}}'].id | [0]"
      }
    },
    {
      "name": "set_status",
      "integration": "jira",
      "method": "POST",
      "path": "/rest/api/3/issue/{{inputs.issueId}}/transitions",
      "body": { "transition": { "id": "{{steps.get_transitions.transitionId}}" } }
    }
  ],
  "output": "Step {{steps.set_status}} completed. Status set to {{inputs.status}}."
}
```

**Key concepts:**
- `{{inputs.*}}` — references user-provided inputs
- `{{steps.<name>.*}}` — references extracted output from a previous step
- `extract` — JMESPath or dot-notation expression to pull values from a step's response
- Steps execute in order; failure in any step stops the chain and returns an error

**Execution in `mcp/server.js`:**
```js
async executeCompositeTool(tool, inputs) {
  const context = { inputs, steps: {} };

  for (const step of tool.steps) {
    const resolved = resolveTemplate(step, context);   // interpolate {{...}}
    const result   = await adapter.call(resolved);
    context.steps[step.name] = extractValues(result, step.extract);
  }

  return resolveTemplate(tool.output, context);
}
```

**UI additions:**
- New "Composite" toggle when creating a tool
- Visual step builder: add steps, drag to reorder, map outputs to next step inputs
- Test panel shows each step's intermediate result (great for debugging)

**Relation to Workflow Engine (Feature 4-B):** Composite tools are essentially lightweight single-purpose workflows. The difference: workflows are user-triggered, standalone automations; composite tools are invoked by the AI as a single MCP tool call. They share the same template + step execution engine — build one, get both.

---

## UI Improvements

> Based on a review of the current React/Vite frontend. Current state: horizontal top navbar, Lucide icons added, theme system in place (defaults to dark).

### UI-1 — Left sidebar layout *(highest priority)*

Top navbar will get crowded as Marketplace, Inspector, and AI Settings are added. Left sidebar scales to 12+ nav items and is the standard for developer tools (VS Code, Linear, Grafana, Supabase).

```
┌──────────┬────────────────────────────┐
│  ⚡ MCP  │                            │
│──────────│   Page content             │
│ Dashboard│                            │
│ Integrat.│                            │
│ Tools    │                            │
│ Prompts  │                            │
│ Monitor. │                            │
│ ──────── │                            │
│ Marketpl.│  ← new items fit naturally │
│ Inspector│                            │
│ ──────── │                            │
│ Settings │                            │
│          │                            │
│ ● MCP: 2 │  ← status in footer        │
└──────────┴────────────────────────────┘
```

### UI-2 — MCP connection status indicator

Persistent badge showing whether the MCP server is accepting connections and how many clients are connected. Polls `GET /health` every 10s.

```
● MCP Server  HTTP · 2 clients connected
```

### UI-3 — Tool tester drawer

"Test" button on each tool card opens a right-side drawer with an auto-generated form from the tool's params. Shows raw JSON response + latency. No need to go to Claude Code to test a tool.

### UI-4 — Dashboard activity sparkline

7-day tool call volume chart below each stat card using **recharts**. Makes the product feel alive even for a solo user.

### UI-5 — Command palette (`Cmd+K`)

Quick navigation and action execution using **cmdk**. Search tools, integrations, marketplace packs — all from the keyboard.

---

## Priority Order

| # | Feature | Effort | Impact | Start here if... |
|---|---|---|---|---|
| 1 | Tool Marketplace | Medium | 🔥🔥🔥 | You want community growth + viral loop |
| 2 | Smart OpenAPI Import | Low | 🔥🔥🔥 | You want to reduce setup friction |
| 3 | OAuth Manager | High | 🔥🔥🔥 | You want enterprise/popular API support |
| 4 | Call Inspector | Low | 🔥🔥 | You want developer tooling (data already there) |
| 5 | Mock Mode | Low | 🔥🔥 | You want demos + testing support |
| 6 | Optional LLM Integration | Medium | 🔥🔥🔥 | You want AI features without hard dependency |
| 7 | Composite Tools | Medium | 🔥🔥🔥 | You want to reduce AI round-trips and hide API complexity |
| UI | See UI section above | Low–Medium | 🔥🔥🔥 | You want it to look and feel production-ready |

**Recommended first picks:**
- **Quickest win:** Feature 4 (Call Inspector) — data already captured, mostly frontend
- **Biggest DX impact:** Feature 7 (Composite Tools) — directly reduces friction for complex APIs like Jira, GitHub, Confluence
- **Biggest growth impact:** Feature 1 (Marketplace) — network effect
