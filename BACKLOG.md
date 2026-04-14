# MCPConnect — Backlog

> Feature ideas and improvements, ordered by impact vs effort.
> Pick something up, move it to a branch, ship it.

---

## Priority Table

| # | Feature | Status | UI Visible | Effort | Impact | Notes |
|---|---|---|---|---|---|---
| 1 | Tool Marketplace | 🗺️ Planning | ❌ | Medium | 🔥🔥🔥 | Pre-built tool packs - like appStore for integrations |
| 2 | Smart OpenAPI Import (body templates) | ✅ | ✅ | Low | 🔥🔥🔥 | generateBodyTemplate() + resolveSchema(allOf) - FIX_SUGGESTED Issue 9 applied |
| 3 | Bulk Tool Actions | ✅ | ✅ | Low | 🔥🔥 | Checkboxes on tool list — enable/disable/delete multiple at once |
| 4 | OAuth Manager | 🔶 | 🔶 | High | 🔥🔥🔥 | Service + routes; Settings tab; Full flow pending |
| 5 | Call Inspector + Tester | ✅ | ✅ | Low | 🔥🔥 | Expand rows, see details, replay, test with modified params |
| 6 | Composite Tools | ❌ | ❌ | Medium | 🔥🔥🔥 | Chain multiple API calls into one MCP tool |
| 7 | Mock Mode | ❌ | ❌ | Low | 🔥🔥 | Static responses for demos and testing |
| 8 | Optional LLM Integration | ❌ | ❌ | Medium | 🔥🔥🔥 | No hard dependency — unlocks tool generation |
| 11 | Integration Sharing | ✅ | ✅ | Medium | 🔥🔥🔥 | Admin shares integration, users add own credentials |
| UI | Tool Tester (in Monitoring) | ✅ | ✅ | Low | 🔥🔥🔥 | Test tool from Monitoring page |
| UI | Dashboard sparklines | 🔶 | ❌ | Low | 🔥🔥🔥 | Component exists, disabled pending feedback |
| UI | Command palette Cmd+K | ❌ | ❌ | Low | 🔥🔥🔥 | Quick navigation |
| UI | Left sidebar | ✅ | ✅ | Low-Medium | 🔥🔥🔥 | Done - collapsible 260px/68px, user dropdown |

---
## Completed (Ready for review)

- ✅ Feature 3: Bulk Tool Actions (527fe24)
- ✅ Feature 5: Call Inspector (571d1d2)
- ✅ Feature 9: Secret Store (Infisical) - complete integration
- ✅ Feature 11: Integration Sharing - visibility + endpoints + UI (share button, badge)
- ✅ UI: Left sidebar (260px/68px collapsible, user dropdown, profile/logout)
- ✅ UI: Tool Tester in Monitoring page
- ✅ UI: Credential warning in tool editor (FIX_SUGGESTED Issue 14)
- ✅ UI: OAuth 2.0 in Integration auth dropdowns
- ✅ UI: OAuth Providers tab in Settings
- ✅ Docker: nginx security headers
- ✅ Scripts: Backup script with rotation
- ✅ Docs: Market analysis (ANALYSIS.md)
- ✅ Pino logging (8a4f152)
- ✅ UI: Tool Tester in Monitoring page
- ✅ UI: Credential warning in tool editor (FIX_SUGGESTED Issue 14)
- ✅ UI: OAuth 2.0 option in Integration auth dropdown
- ✅ UI: OAuth Providers tab in Settings (shows env var config)
- ✅ Docker: nginx security headers (X-Frame-Options, etc.)
- ✅ Scripts: Backup script with rotation
- ✅ Docs: Market analysis (ANALYSIS.md) comparing with Composio/Zapier

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


---

## Feature 10 - Prompts as Skills

**Why:** The `PromptLibrary` model exists but prompts are currently passive - they sit in a library and must be copy-pasted manually. Redesigning them as **Skills** means they become first-class, parameterized, executable units: invokable by the AI as MCP tools, shareable between users, and usable as slash commands in any AI client.

The gap today:
- A prompt like "Write a standup update for {{project}}" is just stored text
- The AI cannot discover or invoke it without the user manually pasting it
- There is no way to share prompts between team members

**What a Skill is:**
```
Skill = name + description + typed inputs + prompt template + (optional) output format
```

Example skill: `standup_update`
```json
{
  "name": "standup_update",
  "description": "Generate a standup update for a project",
  "inputs": [
    { "name": "project", "type": "string", "description": "Project or ticket key", "required": true },
    { "name": "tone",    "type": "string", "description": "casual or formal",       "required": false, "default": "casual" }
  ],
  "prompt": "Write a concise standup update for {{project}} in a {{tone}} tone. Include what was done, what is next, and any blockers.",
  "isShared": false
}
```

**How it works:**
1. Skills are exposed to connected AI clients as MCP tools (`GET /api/mcp/tools` includes skills)
2. Claude calls `use_skill(name="standup_update", project="P20009868-47", tone="formal")`
3. MCPConnect interpolates inputs into the prompt template and returns the rendered prompt as the tool result
4. Claude uses the rendered prompt as context/instruction for the next response

**Migration from PromptLibrary:**
- Rename `prompt_library` table to `skills` (or add `isSkill` flag to existing table to avoid a migration)
- Add typed `inputs`: `{ name, type, description, required, default }`
- Add `isShared` boolean field (see Feature 11)
- Add `outputFormat`: `text` | `json` | `markdown`
- Existing prompts migrate automatically as skills with no inputs - zero breaking change

**New endpoints:**
```
GET    /api/skills              -> list skills (own + shared ones)
POST   /api/skills              -> create skill
PUT    /api/skills/:id          -> update skill
DELETE /api/skills/:id          -> delete skill
POST   /api/skills/:id/invoke   -> render prompt with inputs, returns resolved text
```

**MCP exposure (`mcp/server.js`):**
Register each skill as an MCP tool. The tool handler interpolates the prompt template with the provided inputs and returns the rendered text. The AI can then use that rendered prompt as its instruction.

**UI:**
- Rename "Prompts" page to "Skills" in the sidebar
- Form: name, description, prompt textarea with `{{variable}}` syntax highlighting, inputs table (name / type / required / default)
- "Test" button: fill inputs, see rendered output live before saving
- "Share" toggle (requires Feature 11)

**Effort:** Medium - 2-3 days. DB migration + new routes + MCP registration hook + UI rename/extend.

**Impact:** High - turns a passive library into an active AI capability. Users can build team-specific MCP tools without writing any code.

---

## Feature 11 - Integration Sharing (Admin to Users)

**Why:** Today every integration is private to the user who created it. In a team deployment, every user must set up the same Jira / Bitbucket / GitHub integration separately - duplicating config and multiplying the chance of misconfiguration.

**Current state (from reading the code):**
- `Integration` model has `userId` - strictly per-owner
- Admins see all integrations via `req.user.role === 'admin'` bypass in the where clause
- `UserIntegrationCredentials` table already exists (`userId`, `integrationId`, `credentials` JSONB, `isActive`) with a unique index on `(userId, integrationId)`
- That table is queried in `GET /integrations` to show credential status badges - but **no write route exists anywhere**. The table is read-only today.

**Proposed model: Admin-defined structure, per-user credentials**

```
Admin creates integration -> marks it "shared" -> visible to all users
Each user sees the integration but provides their own credentials
Tools/config defined once by admin; credentials are per-user
```

This is the "bring your own key" pattern. Admin sets up the Jira integration (base URL, tools, endpoints). Each user adds their own Jira API token. MCPConnect picks up the right credential at call time.

**Schema change - one column:**
```sql
ALTER TABLE integrations ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'private';
-- 'private'  = owner + admin only (current behaviour, no change)
-- 'shared'   = all authenticated users can see and use it
```

**New endpoints:**
```
PUT /api/integrations/:id/visibility    -> admin only: toggle 'private' | 'shared'
GET /api/integrations/:id/users         -> admin only: see which users have credentials set
```

**Execution change in `DynamicAdapter.js`:**
```js
// Before building auth headers, check for per-user credentials
const userCred = await UserIntegrationCredentials.findOne({
  where: { userId: context.userId, integrationId: integration.id, isActive: true }
});
const credentials = userCred
  ? JSON.parse(encryption.decrypt(userCred.credentials))
  : integration.config.auth.credentials;
```

**UI - two views:**

Admin view on an integration:
- Shows "Shared" badge with connected user count
- "Manage Sharing" toggle: private vs shared
- Table: which users have connected, when they last updated credentials

Non-admin view of a shared integration:
- Appears in the list with a "Shared by admin" label
- Read-only: cannot edit config or tools
- Shows "Connect" button -> credential form for that auth type (token / API key / OAuth)
- Once connected: "Connected" indicator + "Update" + "Disconnect"

**Effort:** Medium - ~2 days backend (schema migration + 2 routes + DynamicAdapter hook), 1 day UI.

**Impact:** High - essential for any team deployment. Without this, MCPConnect cannot scale past a single user per instance.

---

## Feature 12 - Per-User Credential Update

**Why:** Even for private integrations, `PUT /:id` requires re-submitting the entire integration config to rotate a credential. There is no lightweight "just update my token" flow. This is friction for:
- Any user rotating an API key
- Re-authenticating via OAuth without touching integration config
- Non-owner users on a shared integration (Feature 11) who should never see the full config

**Current state:**
- `PUT /api/integrations/:id` - updates the whole integration; owner/admin only
- Non-owners have no credential route at all
- `UserIntegrationCredentials` has no write routes despite the table existing

**New routes:**

```
PATCH  /api/integrations/:id/credentials
Body:  { credentials: { token: "...", apiKey: "..." } }

- Owner or admin on a private integration: updates config.auth.credentials
- Any user on a shared integration: upserts into UserIntegrationCredentials

DELETE /api/integrations/:id/credentials
- Owner: clears integration-level credentials
- Non-owner on shared: removes their UserIntegrationCredentials row (disconnects)
```

**Backend logic:**
```js
router.patch('/:id/credentials', auth, async (req, res) => {
  const integration = await Integration.findByPk(req.params.id);
  if (!integration) return res.status(404).json({ error: 'Not found' });

  const isOwnerOrAdmin = integration.userId === req.user.id || req.user.role === 'admin';
  const isSharedForOthers = integration.visibility === 'shared' && !isOwnerOrAdmin;

  if (isSharedForOthers) {
    // Non-owner on a shared integration -> write to UserIntegrationCredentials
    await UserIntegrationCredentials.upsert({
      userId: req.user.id,
      integrationId: integration.id,
      credentials: encryptCredentials(req.body.credentials),
      isActive: true
    });
  } else if (isOwnerOrAdmin) {
    // Owner/admin -> update config only
    const config = { ...integration.config };
    config.auth.credentials = encryptCredentials(req.body.credentials);
    await integration.update({ config });
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({ success: true });
});
```

**UI changes:**
- Integration detail page: "Update Credentials" button opens a small modal with only the credential fields (token / API key / username+password depending on auth type) - not the full integration edit form
- Calls `PATCH /:id/credentials`, not `PUT /:id`
- For shared integrations: non-owners see only this modal, not the config/tools editor

**Effort:** Low - 2 backend routes + small frontend modal. Builds directly on Feature 11 infrastructure.

**Impact:** Medium-High - quality-of-life for all users, and a required prerequisite for Feature 11 to be usable.


---

## Project - Rename to Toolshed

**Decision:** Rename the project from MCPConnect to **Toolshed**.

**Why MCPConnect doesn't work:**
- The name MCPConnect is already used by other tools in the MCP ecosystem
- Branding around a protocol acronym (MCP) ties the identity to an implementation detail
- Generic "Connect" suffix adds no personality or recall

**Why Toolshed:**
- A shed is something you run yourself, on your own land - perfect self-hosted metaphor
- Immediately descriptive: a place where tools live and are built
- Community-friendly: "just use Toolshed", "I self-host Toolshed" flows naturally
- Clean open-source brand: no corporate feel, approachable for contributors
- No serious collision risk on GitHub, npm, or Docker Hub
- Logo-friendly: a shed silhouette with a wrench - simple and memorable
- Timeless: not tied to MCP branding if the protocol evolves

**Tagline:** Self-hosted MCP gateway. Turn any API into an AI tool.

**What needs to change:**

| Location | Change |
|----------|--------|
| GitHub repo name | `mcpconnect` -> `toolshed` |
| GitHub org/username | update if creating a dedicated org |
| `package.json` (server + client) | `name` field |
| `docker-compose.yml` | container names: `mcpconnect-*` -> `toolshed-*` |
| `README.md` | all references to MCPConnect |
| `client/src/` | any hardcoded "MCPConnect" strings in UI |
| `server/src/` | log messages, email templates referencing the name |
| Admin email default | `admin@mcpconnect.io` -> `admin@toolshed.io` (or just `admin@localhost`) |
| Docs (`docs/connect/*.md`) | product name references |
| Docker Hub image | `toolshed/server`, `toolshed/client` |
| Domain (future) | `toolshed.dev` or `toolshed.io` |

**Search strings to replace across the repo:**
```
MCPConnect      -> Toolshed
mcpconnect      -> toolshed
mcpconnect.io   -> toolshed.dev
```

**Effort:** Low - mostly find-and-replace. ~1-2 hours. No logic changes.

**Do this before the public GitHub release** - renaming after a repo goes public breaks existing clone URLs and stars.
