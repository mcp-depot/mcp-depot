# Toolshed — Backlog

> Feature ideas and improvements, ordered by impact vs effort.
> Pick something up, move it to a branch, ship it.

---

## Priority Table

| # | Feature | Status | UI Visible | Effort | Impact | Notes |
|---|---------|--------|------------|--------|--------|-------|
| 1 | Tool Marketplace | 🗺️ Planning | ❌ | Medium | 🔥🔥🔥 | Community registry + one-click install |
| 2 | Smart OpenAPI Import | ✅ Done | ✅ | - | - | Body templates + type inference |
| 3 | Bulk Tool Actions | ✅ Done | ✅ | - | - | Enable/disable/delete multiple tools |
| 4 | OAuth Manager | 🔶 Partial | 🔶 | High | 🔥🔥🔥 | Service + UI done; refresh broken (FIX_SUGGESTED Issues 15-18) |
| 5 | Call Inspector + Tester | ✅ Done | ✅ | - | - | Replay + debug tool calls |
| 6 | Composite Tools | ❌ | ❌ | Medium | 🔥🔥🔥 | Chain multiple API calls into one MCP tool |
| 7 | Mock Mode | ✅ Done | ✅ | - | - | Static responses for demos/testing (f35cd8a) |
| 8 | Optional LLM Integration | ❌ | ❌ | Medium | 🔥🔥🔥 | Unlock tool generation, error diagnosis |
| 9 | Secret Store (Infisical) | ✅ Done | ✅ | - | - | External credential store; never touch DB |
| 10 | Prompts as Skills | ❌ | ❌ | Medium | 🔥🔥🔥 | First-class parameterised MCP tools from prompts |
| 11 | Integration Sharing | ✅ Done | ✅ | - | - | Admin shares; users add own credentials |
| 12 | Per-User Credential Update | ❌ | ❌ | Low | 🔥🔥 | PATCH /:id/credentials — no full re-submit |
| UI | Dashboard sparklines | 🔶 | ❌ | Low | 🔥🔥🔥 | Component exists, disabled pending feedback |
| UI | Command palette Cmd+K | ❌ | ❌ | Low | 🔥🔥🔥 | Quick navigation via cmdk |

---

## Completed

- ✅ Feature 2: Smart OpenAPI Import + body templates + type inference
- ✅ Feature 3: Bulk Tool Actions (527fe24)
- ✅ Feature 5: Call Inspector + Tester (571d1d2)
- ✅ Feature 7: Mock Mode (f35cd8a)
- ✅ Feature 9: Secret Store / Infisical
- ✅ Feature 11: Integration Sharing - visibility column + admin/user endpoints + UI badge
- ✅ UI: Left sidebar (260px/68px collapsible, user dropdown, profile/logout)
- ✅ UI: Tool Tester in Monitoring page
- ✅ UI: Credential warning in tool editor (FIX_SUGGESTED Issue 14)
- ✅ UI: OAuth 2.0 option in Integration auth dropdown
- ✅ UI: OAuth Providers tab in Settings (env var config)
- ✅ Docker: nginx security headers (X-Frame-Options, CSP, etc.)
- ✅ Scripts: Backup script with rotation
- ✅ Docs: ANALYSIS.md market analysis

---

## Recommended Starting Points

| Goal | Feature to pick up |
|------|-------------------|
| Fix live OAuth tokens | **Issues 15-18** in FIX_SUGGESTED.md |
| Biggest DX impact | **Feature 6** (Composite Tools) - hides API complexity from AI |
| Biggest growth impact | **Feature 1** (Marketplace) - network effect |
| Turn prompts into power tools | **Feature 10** (Prompts as Skills) |
| Team deployment blocker | **Feature 12** (Per-User Credentials) - low effort, unlocks Feature 11 fully |
| AI-assisted tool building | **Feature 8** (Optional LLM Integration) |

---

## Feature 1 — Tool Marketplace

**Why:** Tool definitions are just JSON. Nobody has built a community registry for MCP tools yet. Toolshed is already the right shape for it. Network effect: more users → more packs → more users.

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
  "author": "toolshed",
  "version": "1.0.0",
  "tags": ["project-management", "atlassian"],
  "integration": { "type": "custom", "authType": "bearer", "baseUrl": "https://your-domain.atlassian.net" },
  "tools": [ ...existing tool definition format... ]
}
```

**Phase 1:** Community registry as a GitHub repo. Toolshed UI fetches packs from raw GitHub URLs.
**Phase 2:** Hosted registry with ratings, install counts, verified packs.

**New endpoints:**
```
GET  /marketplace/packs
GET  /marketplace/packs/:slug
POST /marketplace/packs/:slug/install
```

---

## Feature 4 — OAuth Manager

**Why:** OAuth is where 90% of API integrations die. Handle the dance once, store and auto-refresh tokens - tools just work.

**Current state:** Service + routes + Settings UI exist. Token refresh is broken - see FIX_SUGGESTED Issues 15-18 for exact fixes needed.

**What's working:**
- `oauth2` auth type in Integration dropdown
- OAuth Providers tab in Settings (env var config for built-in providers)
- Authorization redirect + callback routes exist

**What's broken:**
- Issue 15: `DynamicAdapter.js` never calls `getValidToken()` - tokens expire silently
- Issue 16: Refreshed tokens not persisted to DB - single-use providers (Google, Notion) get locked out
- Issue 17: Linear `authUrl` has wrong domain (`linear` instead of `linear.app`)
- Issue 18: Jira uses wrong OAuth version endpoints; Notion needs Basic auth + JSON body

**Fix:** Apply Issues 15-18 from FIX_SUGGESTED.md in order (15 and 16 must go together).

---

## Feature 6 — Composite Tools (Multi-Step Chaining)

**Why:** Some operations require multiple API calls in sequence - but the AI shouldn't need to know that. A composite tool looks like one MCP tool while Toolshed internally chains the calls.

**Real example - "Set Jira Status":**
Without: Claude calls `get_transitions`, finds the ID, calls `set_transition` - 2 round-trips, 2 tool calls.
With: Claude calls `set_jira_status(issueId, status)` - 1 call, Toolshed handles the rest.

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

## Feature 8 — Optional LLM Integration ("Bring Your Own LLM")

**Toolshed never requires an LLM** - it's a tool manager. But if a user provides a key, it unlocks extra features. Same pattern as n8n, Flowise, Open WebUI.

**Admin configures once:**
```
Settings → AI Provider → [OpenAI | Anthropic | Ollama | Custom OpenAI-compatible]
```

If no provider configured → AI features hidden. Core Toolshed unchanged.

**Features that unlock:**
- Natural language → tool definition ("Create a Jira tool that gets issues by project")
- Auto-improve imported tool names/descriptions to be more AI-friendly
- Error diagnosis: "Explain this error" sends error + tool definition to LLM

**Supported providers:** OpenAI, Anthropic, Ollama (local), any OpenAI-compatible endpoint.

---

## Feature 10 — Prompts as Skills

**Why:** The `PromptLibrary` model exists but prompts are currently passive - stored text that must be copy-pasted manually. Redesigning as **Skills** makes them first-class, parameterized, executable units: invokable by the AI as MCP tools, shareable between users, discoverable from any AI client.

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
3. Toolshed interpolates inputs into the prompt template and returns the rendered prompt as the tool result
4. Claude uses the rendered prompt as context/instruction for the next response

**Migration from PromptLibrary:**
- Add typed `inputs`: `{ name, type, description, required, default }`
- Add `isShared` boolean field
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

**MCP exposure:** Register each skill as an MCP tool. Handler interpolates the prompt template with provided inputs and returns rendered text.

**UI:**
- Rename "Prompts" page to "Skills" in the sidebar
- Form: name, description, prompt textarea with `{{variable}}` syntax highlighting, inputs table (name / type / required / default)
- "Test" button: fill inputs, see rendered output live before saving
- "Share" toggle (uses `isShared` flag)

**Effort:** Medium - 2-3 days. DB migration + new routes + MCP registration hook + UI rename/extend.

---

## Feature 12 — Per-User Credential Update

**Why:** Even for private integrations, `PUT /:id` requires re-submitting the entire integration config to rotate a credential. There is no lightweight "just update my token" flow. This is friction for:
- Any user rotating an API key
- Re-authenticating via OAuth without touching integration config
- Non-owner users on a shared integration (Feature 11) who should never see the full config

**Current state:** `UserIntegrationCredentials` table exists with the right schema (`userId`, `integrationId`, `credentials` JSONB, `isActive`) but has zero write routes. The table is read-only dead code today.

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
    await UserIntegrationCredentials.upsert({
      userId: req.user.id,
      integrationId: integration.id,
      credentials: encryptCredentials(req.body.credentials),
      isActive: true
    });
  } else if (isOwnerOrAdmin) {
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
- Integration detail page: "Update Credentials" button opens a small modal with only the credential fields
- Calls `PATCH /:id/credentials`, not `PUT /:id`
- For shared integrations: non-owners see only this modal, not the config/tools editor

**Effort:** Low - 2 backend routes + small frontend modal. Builds directly on Feature 11 infrastructure.

---

## Project — Rename to Toolshed

**Decision:** Rename from MCPConnect to **Toolshed**.

**Why Toolshed:**
- A shed is something you run yourself, on your own land - perfect self-hosted metaphor
- Immediately descriptive: a place where tools live and are built
- Community-friendly: "just use Toolshed", "I self-host Toolshed" flows naturally
- No collision risk on GitHub, npm, or Docker Hub
- Logo-friendly: shed silhouette + wrench - simple and memorable
- Timeless: not tied to MCP branding if the protocol evolves

**Tagline:** Self-hosted MCP gateway. Turn any API into an AI tool.

**What needs to change:**

| Location | Change |
|----------|--------|
| GitHub repo name | `mcpconnect` → `toolshed` |
| `package.json` (server + client) | `name` field |
| `docker-compose.yml` | container names: `mcpconnect-*` → `toolshed-*` |
| `README.md` | all references to MCPConnect |
| `client/src/` | any hardcoded "MCPConnect" strings in UI |
| `server/src/` | log messages, email templates |
| Admin email default | `admin@mcpconnect.io` → `admin@toolshed.io` |
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
**Do this before the public GitHub release** - renaming after a repo goes public breaks existing clone URLs.
