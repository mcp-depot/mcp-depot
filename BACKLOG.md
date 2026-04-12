# MCPConnect — Backlog

> Feature ideas and improvements, ordered by impact vs effort.
> Pick something up, move it to a branch, ship it.

---

## Priority Table

| # | Feature | Status | UI Visible | Effort | Impact | Notes |
|---|---|---|---|---|---|---
| 1 | Tool Marketplace | 🗺️ Planning | ❌ | Medium | 🔥🔥🔥 | Pre-built tool packs - like appStore for integrations |
| 2 | Smart OpenAPI Import (body templates) | ⚠️ | ⚠️ | Low | 🔥🔥🔥 | Fix documented in FIX_SUGGESTED.md Issue 9 — highest ROI |
| 3 | Bulk Tool Actions | ✅ | ✅ | Low | 🔥🔥 | Checkboxes on tool list — enable/disable/delete multiple at once |
| 4 | OAuth Manager | ❌ | ❌ | High | 🔥🔥🔥 | Handles OAuth dance + auto-refresh — unlocks GitHub, Google, Slack |
| 5 | Call Inspector + Tester | ✅ | ✅ | Low | 🔥🔥 | Expand rows, see details, replay, test with modified params |
| 6 | Composite Tools | ❌ | ❌ | Medium | 🔥🔥🔥 | Chain multiple API calls into one MCP tool — reduces AI round-trips |
| 7 | Mock Mode | ❌ | ❌ | Low | 🔥🔥 | Static responses for demos and testing |
| 8 | Optional LLM Integration | ❌ | ❌ | Medium | 🔥🔥🔥 | No hard dependency — unlocks tool generation, error diagnosis |
| UI | Tool Tester (in Monitoring) | ✅ | ✅ | Low | 🔥🔥🔥 | Test tool from Monitoring page - modify params and execute |
| UI | Dashboard sparklines | 🔶 | ❌ | Low | 🔥🔥🔥 | 7-day activity chart per stat card - in source, disabled pending feedback |
| UI | Command palette Cmd+K | ❌ | ❌ | Low | 🔥🔥🔥 | Quick navigation |
| UI | Left sidebar | ✅ | ✅ | Low-Medium | 🔥🔥🔥 | Done - collapsible sidebar with sections |

---
## Completed (Ready for review)

- ✅ Feature 3: Bulk Tool Actions (527fe24)
- ✅ Feature 5: Call Inspector (571d1d2)
- ✅ Feature 9: Secret Store (Infisical) - complete integration
- ✅ UI: Left sidebar (collapsible, sections, user info)
- ✅ Pino logging (8a4f152)

---

## Feature 1 — Tool Marketplace

**Why:** Tool definitions are just JSON. Nobody has built a community registry for MCP tools yet. MCPConnect is already the right shape for it. Network effect: more users → more packs → more users.

**What it looks like:**
```
Marketplace → Browse "Jira Pack" → Preview (12 tools) → Install → Done
```

**Pack format** (reuses existing export JSON):
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

**Phase 1:** Community registry as a GitHub repo. MCPConnect UI fetches packs from raw GitHub URLs.
**Phase 2:** Hosted registry with ratings, install counts, verified packs.

**New endpoints:**
```
GET  /marketplace/packs
GET  /marketplace/packs/:slug
POST /marketplace/packs/:slug/install
```

---

## Feature 2 — Smart OpenAPI Import (body templates + type inference)

**Why:** Biggest friction point today — imported POST/PUT tools have empty bodies and wrong param types. Fix documented in `FIX_SUGGESTED.md` Issue 9.

**What changes:**
- `resolveSchema` in `openapi-parser.js` — handle `allOf` + deep `$ref` chains
- New `generateBodyTemplate()` — converts resolved schema to `{varName}` template
- Import route uses the template instead of storing `{}`
- Type inference: map OpenAPI `integer`/`number`/`boolean` to correct JSON Schema types (currently all become `string`)
- Conflict detection: prompt to skip/rename/overwrite if tool name already exists

**Also (2b) — Raw JSON import:**
```
POST /api/integrations/:id/import-raw
Body: { tools: [ ...tool JSON... ] }
```
User pastes a tool definition written by Claude/Cursor — MCPConnect validates and imports it.

**Also (2c) — URL-to-tools shortcut:**
Paste any API base URL → auto-discover OpenAPI spec (`/openapi.json`, `/swagger.json`, `/api-docs`) and import in one step.

---

## Feature 3 — Bulk Tool Actions

**Why:** Power users have 20+ tools per integration. Enabling, disabling, or deleting them one at a time is tedious.

**What it looks like:**
- Checkbox column on the tool list (appears on hover or via a "Select" toggle)
- Bulk action bar appears when one or more tools are checked:
  ```
  [ 3 selected ]  [ Enable ]  [ Disable ]  [ Delete ]  [ Export ]
  ```
- "Select all" checkbox in the header row

**Implementation sketch:**

Frontend (`Tools.jsx`):
- Add `selectedTools` state: `Set` of tool IDs
- Checkbox `onChange` toggles membership in the set
- Bulk action bar renders when `selectedTools.size > 0`

Backend — new bulk endpoints:
```
PATCH /api/integrations/:id/tools/bulk
Body: { ids: [...], action: "enable" | "disable" | "delete" }
```

**Effort:** Low — 1-2 days frontend, 1 new endpoint backend.

---

## Feature 4 — OAuth Manager

**Why:** OAuth is where 90% of API integrations die. Handle the dance once, store and auto-refresh tokens — tools just work.

**New integration auth type:** `oauth2` (alongside `bearer`, `basic`, `apikey`)

**Built-in providers to start:** GitHub, Google, Notion, Slack, Linear, Jira/Confluence

**New endpoints:**
```
GET  /api/oauth/:provider/authorize   → redirect to provider OAuth URL
GET  /api/oauth/:provider/callback    → exchange code for token, store encrypted
POST /api/oauth/:provider/refresh     → manual token refresh
```

**Auto-refresh:** Before each tool call, check if access token expires within 5 minutes → refresh automatically.

---

## Feature 5 — Tool Call Inspector (Replay + Debug)

**Why:** When the AI does something unexpected, you need to see exactly what it called and what came back. The `tool_calls` table already captures everything — this is mostly frontend work.

**What it looks like:**
- Live feed of every tool call: params + response + latency
- Click any call → replay it with the same params
- Filter by tool, integration, time range, success/error

**New endpoints:**
```
GET  /api/tool-calls/stream      → SSE stream of new ToolCall records
POST /api/tool-calls/:id/replay  → re-execute with same params
```

**Effort:** Low — data already there, mostly a monitoring UI.

---

## Feature 6 — Composite Tools (Multi-Step Chaining)

**Why:** Some operations require multiple API calls in sequence — but the AI shouldn't need to know that. A composite tool looks like one MCP tool while MCPConnect internally chains the calls.

**Real example — "Set Jira Status":**
Without: Claude calls `get_transitions`, finds the ID, calls `set_transition` — 2 round-trips, 2 tool calls.
With: Claude calls `set_jira_status(issueId, status)` — 1 call, MCPConnect handles the rest.

**Tool definition:**
```json
{
  "type": "composite",
  "steps": [
    {
      "name": "get_transitions",
      "method": "GET",
      "path": "/rest/api/3/issue/{{inputs.issueId}}/transitions",
      "extract": { "transitionId": "transitions[?name=='{{inputs.status}}'].id | [0]" }
    },
    {
      "name": "set_status",
      "method": "POST",
      "path": "/rest/api/3/issue/{{inputs.issueId}}/transitions",
      "body": { "transition": { "id": "{{steps.get_transitions.transitionId}}" } }
    }
  ]
}
```

**Template syntax:** `{{inputs.*}}` for user inputs, `{{steps.<name>.*}}` for previous step outputs.

---

## Feature 7 — Mock Mode / Sandbox

**Why:** Demos, development, testing AI behaviour — without hitting real APIs.

**Schema change:** Add `mockEnabled: boolean` and `mockResponse: jsonb` to `tools` table.

**Execution:**
```js
if (tool.mockEnabled && tool.mockResponse) {
  return interpolateMock(tool.mockResponse, params);
}
```

**Template support:** `{ "id": "{{uuid}}", "name": "{{params.name}}" }`

---

## Feature 8 — Optional LLM Integration ("Bring Your Own LLM")

**MCPConnect never requires an LLM** — it's a tool manager. But if a user provides a key, it unlocks extra features. Same pattern as n8n, Flowise, Open WebUI.

**Admin configures once:**
```
Settings → AI Provider → [OpenAI | Anthropic | Ollama | Custom OpenAI-compatible]
```

If no provider configured → AI features hidden. Core MCPConnect unchanged.

**Features that unlock:**
- Natural language → tool definition ("Create a Jira tool that gets issues by project")
- Auto-improve imported tool names/descriptions to be more AI-friendly
- Error diagnosis: "Explain this error" sends error + tool definition to LLM

**Supported providers:** OpenAI, Anthropic, Ollama (local), any OpenAI-compatible endpoint.

---

## UI Improvements

### UI-1 — Left sidebar layout *(highest priority)*

Top navbar gets crowded with Marketplace, Inspector, AI Settings. Left sidebar is the standard for developer tools (VS Code, Linear, Grafana, Supabase) and scales to 12+ items.

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
│ Marketpl.│                            │
│ Inspector│                            │
│ ──────── │                            │
│ Settings │                            │
│          │                            │
│ ● MCP: 2 │  ← connection status       │
└──────────┴────────────────────────────┘
```

### UI-2 — MCP connection status indicator

Persistent badge showing whether the MCP server is accepting connections. Polls `GET /health` every 10s.
```
● MCP Server  HTTP · 2 clients connected
```

### UI-3 — Tool tester drawer

"Test" button on each tool card opens a right-side drawer. Auto-generated form from tool params. Shows raw JSON response + latency. No need to go to Claude Code to test a tool.

### UI-4 — Dashboard activity sparkline

7-day tool call volume chart per stat card using **recharts**. Makes the product feel alive even for a solo user.

### UI-5 — Command palette (`Cmd+K`)

Quick navigation using **cmdk**. Search tools, integrations, marketplace packs from the keyboard.

---

## Feature 9 — External Secret Store Integration (Infisical)

**Why:** MCPConnect already keeps credentials invisible to Claude (decrypted server-side, never sent to AI). The next step for enterprise/team use is to not store credentials in MCPConnect's database at all — fetch them from a dedicated secret store at execution time. Even if MCPConnect's DB is compromised, there is nothing to steal.

**Chosen backend: Infisical**

Selected over alternatives (OpenBao, Doppler, HashiCorp Vault) because:
- Truly open-source (MIT) — no license risk for an open-source project
- Self-hostable with Docker Compose — matches MCPConnect's existing deployment model
- Official Node.js SDK (`@infisical/sdk`) — clean integration, no raw HTTP plumbing
- Built for developers, not infra/ops teams — same target audience as MCPConnect
- Low operational burden — no unsealing ceremony or policy configuration required

Note on alternatives:
- **HashiCorp Vault** - changed to BSL 1.1 (source-available, not open-source) in Aug 2023
- **OpenBao** (MPL 2.0, Vault fork) - single Docker service, no Redis needed, but requires an unseal step after every restart (manual or via auto-unseal service); higher ops complexity; no official Node.js SDK. Good for teams with existing Vault expertise.
- **Infisical** - requires Valkey/Redis (2 Docker services) but has a Cloud option (free tier, zero infra); official Node.js SDK; simpler setup. Better default for developer tools. Use **Valkey** (`valkey/valkey:8-alpine`) not Redis — Redis changed to a non-open-source license (RSALv2 + SSPL) in March 2024; Valkey is the Linux Foundation BSD-3-Clause fork and a drop-in replacement.
- Both can be added as future backends using the same adapter pattern — `vault://` prefix for OpenBao/Vault, `infisical://` for Infisical.

---

### Implementation plan

**Step 1 — Add Infisical to docker-compose.yml (optional, for local self-hosting)**

```yaml
infisical:
  image: infisical/infisical:latest
  container_name: mcpconnect-infisical
  restart: unless-stopped
  ports:
    - "8080:8080"
  environment:
    - ENCRYPTION_KEY=${INFISICAL_ENCRYPTION_KEY}
    - AUTH_SECRET=${INFISICAL_AUTH_SECRET}
    - DB_CONNECTION_URI=postgres://admin:admin123@postgres:5432/infisical
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - mcpconnect-network
```

Users who already have an Infisical instance (or use Infisical Cloud) can skip this and just provide the URL.

---

**Step 2 — Install SDK**

```bash
cd server && npm install @infisical/sdk
```

---

**Step 3 — New service: `server/src/services/secret-store.js`**

```js
const { InfisicalSDK } = require('@infisical/sdk');

let client = null;

async function init(config) {
  if (!config?.enabled || !config?.siteUrl || !config?.clientId || !config?.clientSecret) return;
  client = new InfisicalSDK({ siteUrl: config.siteUrl });
  await client.auth().universalAuth.login({
    clientId: config.clientId,
    clientSecret: config.clientSecret
  });
}

async function resolveSecret(ref) {
  // ref format: "infisical://PROJECT_SLUG/ENV/SECRET_NAME"
  // e.g. "infisical://my-project/prod/JIRA_TOKEN"
  if (!client || !ref?.startsWith('infisical://')) return null;
  const [, projectSlug, environment, secretName] = ref.replace('infisical://', '').split('/');
  const secret = await client.secrets().getSecret({
    projectSlug,
    environment,
    secretName
  });
  return secret?.secretValue || null;
}

function isSecretRef(value) {
  return typeof value === 'string' && value.startsWith('infisical://');
}

module.exports = { init, resolveSecret, isSecretRef };
```

---

**Step 4 — Resolve refs in `DynamicAdapter.js` before building auth headers**

```js
const secretStore = require('../services/secret-store');

// In buildAuthHeaders(), before using credentials:
if (credentials.token && secretStore.isSecretRef(credentials.token)) {
  credentials.token = await secretStore.resolveSecret(credentials.token);
}
if (credentials.apiKey && secretStore.isSecretRef(credentials.apiKey)) {
  credentials.apiKey = await secretStore.resolveSecret(credentials.apiKey);
}
```

---

**Step 5 — Settings UI**

`Settings → Secret Store` panel:

```
[ ] Enable Secret Store
Provider: [ Infisical ▼ ]
Site URL:      [https://app.infisical.com        ]
Client ID:     [________________________________ ]
Client Secret: [________________________________ ]
[ Test Connection ]
```

New system setting key: `secretStore` (stored in `SystemSetting` table, same as other settings).

---

**Step 6 — Integration auth UI update**

In the Integration auth credentials fields, allow a secret reference as the value:

```
Token: [ infisical://my-project/prod/JIRA_TOKEN ]
```

A small hint below the field: `Use infisical://project/env/secret-name to reference a secret store value.`

---

**Step 7 — Init on server start (`server/src/index.js`)**

```js
const secretStore = require('./services/secret-store');
const secretConfig = await SystemSetting.findOne({ where: { key: 'secretStore' } });
if (secretConfig?.value?.enabled) {
  await secretStore.init(secretConfig.value);
}
```

---

**Effort:** Medium — ~3 days. New service (1 file), adapter hook (5 lines), settings UI (1 panel), docker-compose addition (optional).

**After this is done:** Credentials never need to touch MCPConnect's DB. Users with existing encrypted credentials continue working unchanged — the `infisical://` prefix is opt-in.

---

### Adding more backends later

The adapter pattern makes adding new backends trivial. `DynamicAdapter.js` never changes - it always just calls `resolveSecret(ref)`. Each backend is identified by the ref prefix:

```js
// secret-store.js — extending with new backends
async function resolveSecret(ref) {
  if (ref.startsWith('infisical://')) return infisicalAdapter.fetch(ref);  // Phase 1
  if (ref.startsWith('vault://'))     return vaultAdapter.fetch(ref);      // OpenBao / HashiCorp Vault
  if (ref.startsWith('doppler://'))   return dopplerAdapter.fetch(ref);    // Doppler
  if (ref.startsWith('awssm://'))     return awsAdapter.fetch(ref);        // AWS Secrets Manager
  return null;
}
```

Mixed usage works automatically — one integration can reference Infisical, another can reference Vault, both resolve correctly in the same request. Users without any secret store configured continue using DB-encrypted credentials unchanged.

---

## Recommended Starting Points

| Goal | Feature to pick up |
|---|---|
| Quickest win | **Feature 5** (Call Inspector) — data already there, mostly frontend |
| Biggest daily UX win | **Feature 3** (Bulk Actions) — low effort, high utility for power users |
| Biggest DX impact | **Feature 6** (Composite Tools) — hides API complexity from the AI |
| Biggest growth impact | **Feature 1** (Marketplace) — network effect |
| Reduce setup friction | **Feature 2** (Smart Import) — fix already documented in FIX_SUGGESTED.md Issue 9 |
| Enterprise/team security | **Feature 9** (Secret Store) — keeps credentials out of MCPConnect DB entirely |
