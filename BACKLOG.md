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
| 4 | OAuth Manager | ✅ Done | ✅ | - | - | Auto token refresh + persistence (Issues 15-18 fixed) |
| 5 | Call Inspector + Tester | ✅ Done | ✅ | - | - | Replay + debug tool calls |
| 6 | Composite Tools | ✅ Done | ✅ | - | - | Chain multiple API calls into one MCP tool |
| 7 | Mock Mode | ✅ Done | ✅ | - | - | Static responses for demos/testing (f35cd8a) |
| 8 | Optional LLM Integration | ❌ | ❌ | Medium | 🔥🔥🔥 | Unlock tool generation, error diagnosis |
| 9 | Secret Store (Infisical) | ✅ Done | ✅ | - | - | External credential store; never touch DB |
| 10 | Prompts as Skills | ❌ | ❌ | Medium | 🔥🔥🔥 | First-class parameterised MCP tools from prompts |
| 11 | Integration Sharing | ✅ Done | ✅ | - | - | Admin shares; users add own credentials |
| 12 | Per-User Credential Update | ✅ Done | ✅ | - | - | PATCH/DELETE /:id/credentials for shared integrations |
| 13 | Named MCP Endpoints | ❌ | ❌ | Medium | 🔥🔥🔥 | Per-agent scoped MCP URLs; self-hosting exclusive |
| 14 | Webhook / Event Triggers | ❌ | ❌ | Large | 🔥🔥🔥 | Inbound webhooks + cron; turns Toolshed into workflow engine |
| 15 | Dev / Staging / Prod Environments | ❌ | ❌ | Medium | 🔥🔥🔥 | Per-integration env switching; self-hosting exclusive |
| 16 | Audit Log | ❌ | ❌ | Small | 🔥🔥🔥 | Persistent call log with retention + CSV export |
| 17 | Response Transform UI | ❌ | ❌ | Small | 🔥🔥 | JSONPath/jq to strip large API responses before Claude sees them |
| 18 | Tool Health Monitoring | ❌ | ❌ | Medium | 🔥🔥 | Scheduled pings, health badges, alerting, circuit breaker |
| 19 | Outbound Webhook Notifications | ❌ | ❌ | Small | 🔥🔥 | Notify Slack/webhook on tool success or failure |
| 20 | Granular Access Control | ❌ | ❌ | Small | 🔥🔥🔥 | Read-only mode + per-tool enable per endpoint |
| 21 | Claude Code Skill Registry | ❌ | ❌ | Small | 🔥🔥🔥 | Share SKILL.md files via MCP; install locally with one Claude command |
| 22 | Popular Services Registry | ❌ | ❌ | Small | 🔥🔥🔥 | Curated AI-optimised endpoint lists for Jira, GitHub, Jenkins etc. — select, configure, import |
| UI | Dashboard sparklines | 🔶 | ❌ | Low | 🔥🔥🔥 | Component exists, disabled pending feedback |
| UI | Command palette Cmd+K | ❌ | ❌ | Low | 🔥🔥🔥 | Quick navigation via cmdk |

---

## Completed

- ✅ Feature 2: Smart OpenAPI Import + body templates + type inference
- ✅ Feature 3: Bulk Tool Actions (527fe24)
- ✅ Feature 6: Composite Tools - multi-step chaining with input mappings, extractors, template resolution
- ✅ Feature 4: OAuth Manager (Issues 15-18 fixed - auto refresh + persistence)
- ✅ Feature 5: Call Inspector + Tester (571d1d2)
- ✅ Feature 7: Mock Mode (f35cd8a)
- ✅ Feature 9: Secret Store / Infisical
- ✅ Feature 11: Integration Sharing - visibility + endpoints + per-user credentials UI
- ✅ Feature 12: Per-User Credential Update - PATCH/DELETE credentials endpoints
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
| Biggest DX impact | **Feature 6** (Composite Tools) - hides API complexity from AI |
| Biggest growth impact | **Feature 1** (Marketplace) - network effect; closes biggest onboarding gap vs Zapier/Composio |
| Turn prompts into power tools | **Feature 10** (Prompts as Skills) |
| AI-assisted tool building | **Feature 8** (Optional LLM Integration) |
| Self-hosting exclusive advantage | **Feature 15** (Environments) - dev/staging/prod; no hosted competitor can match |
| Multi-agent / team use | **Feature 13** (Named MCP Endpoints) - separate scoped URLs per AI client |
| Enterprise / compliance | **Feature 16** (Audit Log) - hard requirement for any team deployment |
| Prevent Claude from breaking things | **Feature 20** (Granular Access Control) - read-only mode, low effort, high value |
| Move into workflow engine territory | **Feature 14** (Webhook Triggers) - biggest functional expansion |
| Quick wins (1-2 days each) | **Feature 16**, **Feature 17**, **Feature 19**, **Feature 20**, **Feature 21** - all Small effort |
| Share Claude Code workflows | **Feature 21** (Skill Registry) - unique to Toolshed; no hosted competitor has this |

---

## Feature 1 — Tools Marketplace

**Why:** Two separate problems solved in one place:
1. Users want ready-made tool bundles for popular services without building from scratch
2. Users with internal or custom APIs want a better experience than "Add Integration → Discover API" buried in the Integrations page

Nobody has built a community registry for MCP tools yet. Toolshed is the right shape for it. Network effect: more users → more packs → more users.

---

### UI Design — Two tabs, one page

**Entry point:** New "Marketplace" item in the sidebar (between Integrations and Tools).

```
┌─────────────────────────────────────────────────────┐
│  Tools Marketplace                                   │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  Browse       │  │  Discover    │                 │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

---

### Tab 1: Browse (Curated Packs)

Pre-built, tested bundles for popular services. User picks a pack, fills in credentials, tools are created in their Integrations automatically.

```
Marketplace → Browse → "Jira Pack" → Preview 12 tools → Install
         → fill in base URL + token → Done
```

**What a pack looks like (reuses existing export JSON format):**
```json
{
  "name": "Jira Pack",
  "slug": "jira",
  "description": "Create issues, search, transition status, add comments",
  "author": "toolshed",
  "version": "1.0.0",
  "tags": ["project-management", "atlassian"],
  "integration": {
    "type": "custom",
    "authType": "bearer",
    "baseUrl": "https://your-domain.atlassian.net"
  },
  "tools": [ ...existing tool definition format... ]
}
```

**Starter packs to ship with the app:**
- Jira (create issue, get issue, add comment, transition status, search)
- Confluence (get page, search, create page)
- GitHub (list PRs, create PR, get file, list repos)
- Bitbucket (list PRs, create PR, get diff, add comment)
- Jenkins (trigger build, get status, get console log)
- Linear (create issue, update status, list issues)
- Notion (create page, search, get page)
- Slack (send message, list channels)

**Pack registry phases:**
- **Phase 1:** Packs are JSON files shipped inside the app repo. Community contributes via GitHub PRs.
- **Phase 2:** Hosted registry — app fetches from a central URL, new packs appear without app updates. Ratings, install counts, verified packs.

---

### Tab 2: Discover (Custom API Discovery)

User points at any API, adds auth, and the app fetches the OpenAPI spec and presents all available endpoints to select from.

> **Note:** The discovery engine already exists — `client/src/pages/Integrations.jsx` has the "Discover API" modal with full OpenAPI parsing. This tab is about giving that feature a dedicated home with a better UX, rather than rebuilding it.

**Flow:**
```
Marketplace → Discover
  → Enter base URL (e.g. https://api.mycompany.com)
  → Select auth type + credentials
  → Click "Explore API"
  → App fetches /openapi.json or /swagger.json (auto-detect)
  → Presents all endpoints grouped by tag:
      ┌─────────────────────────────────────────────────┐
      │  GET    /api/users/{id}       Get user by ID    │  ☐
      │  POST   /api/users            Create user       │  ☑
      │  GET    /api/orders           List orders       │  ☑
      │  DELETE /api/orders/{id}      Cancel order      │  ☐
      └─────────────────────────────────────────────────┘
  → User selects endpoints → "Create X Tools"
  → Integration + selected tools created in one step
```

**Improvements over current "Discover API" modal:**
- Full-page view with better filtering (search endpoints, filter by method, filter by tag)
- Group endpoints by OpenAPI tag (logical sections)
- Show request/response schema inline so user knows what they're getting
- Allow auth to be saved as a new Integration in the same step

**Limitation — OpenAPI only:**
The discovery engine only works when the target API exposes an OpenAPI/Swagger spec (`/openapi.json`, `/swagger.json`, `/api-docs`). APIs without a spec cannot be auto-discovered. The fallback for those is the existing manual tool creation flow. This is an inherent limitation of the approach and should be communicated clearly in the UI ("Your API must expose an OpenAPI spec for auto-discovery. No spec? Add tools manually instead.").

**Future improvement (large effort):** For APIs without specs, an optional LLM step (Feature 8) could attempt to infer endpoints from documentation URLs or HAR files — but that is a separate feature, not part of the Marketplace.

---

### Tab 3: Import (Postman Collection)

User imports a Postman collection JSON file. The app parses it, resolves variables, and generates an Integration + tools.

**The core challenge — Postman variables:**

Postman collections use `{{variableName}}` placeholders throughout. These are not all the same kind of thing and must be handled differently at import time:

| Variable category | Examples | How to handle |
|---|---|---|
| Base URL / host | `{{baseUrl}}`, `{{host}}` | → Integration base URL field |
| Auth credentials | `{{apiToken}}`, `{{bearerToken}}`, `{{apiKey}}`, `{{password}}` | → Integration auth config (stored encrypted) |
| Default parameters | `{{projectKey}}`, `{{workspaceId}}`, `{{orgId}}` | → Tool default parameter values |
| Runtime inputs | `{{issueId}}`, `{{userId}}`, `{{query}}` | → MCP tool parameters — NOT asked at import, Claude fills at call time |

The classifier distinguishes runtime inputs from config variables by looking at where in the request they appear: variables in URL path segments (`/issues/{{issueId}}`) are always runtime; variables in the base URL or auth headers are always config.

**Import flow — 3 steps:**

```
Step 1: Upload files
  ┌─────────────────────────────────────────────────┐
  │  Postman Collection (.json)    [Choose file]    │
  │  Postman Environment (.json)   [Choose file]    │
  │                          (optional but helpful) │
  └─────────────────────────────────────────────────┘
  → If environment file provided, variables are pre-filled in Step 2

Step 2: Configure variables
  ┌─────────────────────────────────────────────────┐
  │  BASE URL                                       │
  │    baseUrl:     [ https://mycompany.atlassian.net ] │
  │                                                 │
  │  AUTHENTICATION                                 │
  │    apiToken:    [ ••••••••••••••• ]             │
  │                                                 │
  │  DEFAULT PARAMETERS                             │
  │    projectKey:  [ MYPROJECT ]                   │
  │                                                 │
  │  RUNTIME INPUTS (Claude fills at call time)     │
  │    issueId, commentId, userId  ← listed only,  │
  │                                   no input field│
  └─────────────────────────────────────────────────┘

Step 3: Select endpoints
  ┌─────────────────────────────────────────────────┐
  │  ☑  GET   /rest/api/3/issue/{issueId}           │
  │  ☑  POST  /rest/api/3/issue                     │
  │  ☐  GET   /rest/api/3/project                   │
  │  ☑  POST  /rest/api/3/issue/{issueId}/comment   │
  └─────────────────────────────────────────────────┘
  → "Create 3 Tools"  →  Integration + tools created
```

**Variable auto-classification logic:**
```js
function classifyVariable(name, appearances) {
  const nameLower = name.toLowerCase();
  // Auth: name contains auth-related keywords
  if (/token|key|secret|password|auth|bearer|credential/.test(nameLower))
    return 'auth';
  // Base URL: appears in the host/baseUrl of requests
  if (/url|host|base|domain|endpoint/.test(nameLower) || appearances.inHost)
    return 'baseUrl';
  // Runtime: appears only in URL path segments (e.g. /issues/{{issueId}})
  if (appearances.onlyInPath)
    return 'runtime';
  // Everything else: default param
  return 'defaultParam';
}
```

**Postman environment file format (for reference):**
```json
{
  "name": "My Jira Environment",
  "values": [
    { "key": "baseUrl",    "value": "https://mycompany.atlassian.net" },
    { "key": "apiToken",   "value": "ATATT3xFf..." },
    { "key": "projectKey", "value": "PROJ" }
  ]
}
```

---

### Backend

No new server infrastructure needed for Phase 1. Pack bundles are static JSON fetched client-side (or bundled in the app). The install endpoint reuses existing import logic.

**New routes for Phase 2 (hosted registry):**
```
GET  /api/marketplace/packs              list all packs
GET  /api/marketplace/packs/:slug        get pack detail + tools preview
POST /api/marketplace/packs/:slug/install  create integration + tools from pack
```

---

### Effort estimate
- **Tab 1 (Browse):** Medium — new Marketplace page + pack JSON format + install flow + 8 starter packs
- **Tab 2 (Discover):** Small-Medium — UX rework of existing Discover API modal into full page
- **Tab 3 (Postman import):** Medium — Postman JSON parser + variable classifier + 3-step import wizard
- **Phase 2 registry:** Large — requires hosted infrastructure outside the app

---

## Feature 22 — Popular Services Registry (Cloud + Self-Hosted)

**Why:** Most users want to connect the same tools — Jira, GitHub, Confluence, Jenkins, Bitbucket, SonarQube. Today they have to know the base URL, auth type, and endpoint paths themselves. The registry removes all that friction: the app already knows the common endpoints for each service, pre-selected and named for Claude to understand.

Critically, this covers **both cloud-hosted and self-hosted variants**. Many engineering teams run self-hosted Jenkins, Jira Data Center, GitLab, SonarQube, or Nexus on their own infrastructure. For self-hosted services the API endpoints are identical — only the base URL differs, and the user provides that.

Unlike OpenAPI discovery (requires a live spec) or Postman import (requires a file), this needs nothing from the user except their instance URL and credentials.

---

### Cloud vs Self-Hosted distinction

| Type | Base URL | What user provides |
|---|---|---|
| **Cloud** | Fixed (e.g. `https://api.github.com`) | Credentials only |
| **Self-hosted** | User's own instance | Instance URL + credentials |
| **Dual (cloud + self-hosted)** | Depends on which variant | Variant picker → then URL + credentials |

Some services exist in both variants with **different API versions** — these need separate registry entries:

| Service | Cloud variant | Self-hosted variant |
|---|---|---|
| Jira | `atlassian.net` · REST API v3 | Your domain · REST API v2 |
| Confluence | `atlassian.net` · REST API v2 | Your domain · REST API v1 |
| Bitbucket | `api.bitbucket.org` | Your domain · different path prefix |
| GitHub | `api.github.com` | GitHub Enterprise · same paths, different base |
| GitLab | `gitlab.com` | Self-hosted · same API, different base |

---

### Flow

Entry point: "Add Integration" modal gets a new top section:

```
┌─────────────────────────────────────────────────────────┐
│  Start from a popular service:                          │
│                                                         │
│  ── Cloud ──────────────────────────────────────        │
│  [GitHub]  [Linear]  [Notion]  [Slack]  [Trello]       │
│                                                         │
│  ── Self-Hosted ────────────────────────────────        │
│  [Jenkins]  [SonarQube]  [Nexus]  [Grafana]            │
│  [Harbor]  [Gitea]  [Artifactory]                      │
│                                                         │
│  ── Cloud + Self-Hosted ────────────────────────        │
│  [Jira]  [Confluence]  [Bitbucket]  [GitLab]           │
│  [GitHub Enterprise]                                    │
│                                                         │
│  ── or configure from scratch ──                        │
└─────────────────────────────────────────────────────────┘
```

**For dual services (e.g. Jira) — variant picker shown first:**
```
  Jira
  ○ Jira Cloud       (atlassian.net — REST API v3)
  ● Jira Server / Data Center  (your domain — REST API v2)
```

User selects variant → 3-step flow:

```
Step 1: Connect

  Cloud service (GitHub):
    Integration name:  [ GitHub ]
    Base URL:          [ https://api.github.com ]  ← fixed, not editable
    Auth type:         [ Bearer Token ]  ← pre-selected
    Token:             [ ••••••••••••• ]

  Self-hosted service (Jenkins):
    Integration name:  [ Jenkins ]
    Your Jenkins URL:  [ https://jenkins.mycompany.com ]  ← user fills this
    Auth type:         [ API Token ]  ← pre-selected
    Username:          [ imran ]
    API Token:         [ ••••••••••••• ]

  Dual service - self-hosted (Jira Server):
    Integration name:  [ Jira ]
    Your Jira URL:     [ https://jira.mycompany.com ]  ← user fills this
    Auth type:         [ Bearer Token ]  ← pre-selected
    Token:             [ ••••••••••••• ]

Step 2: Select tools
  ┌─────────────────────────────────────────────────────┐
  │  ☑  GET  Get Issue            /{issueId}            │
  │  ☑  POST Add Comment          /{issueId}/comment    │
  │  ☑  POST Transition Issue     /{issueId}/transitions│
  │  ☑  GET  List Transitions     /{issueId}/transitions│
  │  ☐  POST Create Issue                               │
  │  ☐  GET  Search Issues (JQL)                        │
  │  ☐  PUT  Update Issue         /{issueId}            │
  └─────────────────────────────────────────────────────┘
  Sensible defaults pre-ticked. User unticks what they don't need.

Step 3: Done
  Integration created + X tools registered.
  "Start using these tools in Claude →"
```

---

### Registry format

A single static JSON file shipped with the app (`client/src/data/services-registry.json`).
Community contributes new services and endpoints via GitHub PRs.

Key fields:
- `hosted: "cloud"` — base URL is fixed, not editable
- `hosted: "self"` — user must provide their instance URL
- `hosted: "both"` — show variant picker; each variant is a separate entry with its own API paths

```json
{
  "github": {
    "name": "GitHub",
    "description": "Code hosting, pull requests, issues",
    "icon": "github",
    "hosted": "cloud",
    "tags": ["git", "code-review"],
    "connection": {
      "baseUrl": "https://api.github.com",
      "baseUrlEditable": false,
      "authType": "bearer",
      "authLabel": "Personal Access Token"
    },
    "tools": [
      { "name": "list-pull-requests",  "method": "GET",  "path": "/repos/{owner}/{repo}/pulls",               "defaultSelected": true  },
      { "name": "get-pull-request",    "method": "GET",  "path": "/repos/{owner}/{repo}/pulls/{pull_number}", "defaultSelected": true  },
      { "name": "create-pull-request", "method": "POST", "path": "/repos/{owner}/{repo}/pulls",               "defaultSelected": false },
      { "name": "get-file",            "method": "GET",  "path": "/repos/{owner}/{repo}/contents/{path}",     "defaultSelected": true  },
      { "name": "list-issues",         "method": "GET",  "path": "/repos/{owner}/{repo}/issues",              "defaultSelected": false }
    ]
  },

  "jenkins": {
    "name": "Jenkins",
    "description": "CI/CD automation server",
    "icon": "jenkins",
    "hosted": "self",
    "tags": ["ci-cd", "devops"],
    "connection": {
      "baseUrlPattern": "https://jenkins.{your-domain}.com",
      "baseUrlHint": "Enter your Jenkins instance URL",
      "baseUrlEditable": true,
      "authType": "basic",
      "authLabel": "Username + API Token"
    },
    "tools": [
      { "name": "get-build-status",   "method": "GET",  "path": "/job/{jobName}/lastBuild/api/json",          "defaultSelected": true  },
      { "name": "get-console-log",    "method": "GET",  "path": "/job/{jobName}/lastBuild/consoleText",       "defaultSelected": true  },
      { "name": "trigger-build",      "method": "POST", "path": "/job/{jobName}/build",                       "defaultSelected": true  },
      { "name": "get-build-artifact", "method": "GET",  "path": "/job/{jobName}/lastBuild/artifact/{path}",  "defaultSelected": false }
    ]
  },

  "jira-cloud": {
    "name": "Jira Cloud",
    "description": "Jira on Atlassian Cloud (atlassian.net)",
    "icon": "jira",
    "hosted": "cloud",
    "variantOf": "jira",
    "tags": ["project-management", "atlassian"],
    "connection": {
      "baseUrlPattern": "https://{your-domain}.atlassian.net",
      "baseUrlHint": "Replace {your-domain} with your Atlassian subdomain",
      "baseUrlEditable": true,
      "authType": "bearer",
      "authLabel": "API Token"
    },
    "tools": [
      { "name": "get-issue",        "method": "GET",  "path": "/rest/api/3/issue/{issueId}",             "defaultSelected": true  },
      { "name": "add-comment",      "method": "POST", "path": "/rest/api/3/issue/{issueId}/comment",     "defaultSelected": true  },
      { "name": "transition-issue", "method": "POST", "path": "/rest/api/3/issue/{issueId}/transitions", "defaultSelected": true  },
      { "name": "get-transitions",  "method": "GET",  "path": "/rest/api/3/issue/{issueId}/transitions", "defaultSelected": true  },
      { "name": "search-issues",    "method": "GET",  "path": "/rest/api/3/issue/search",                "defaultSelected": false },
      { "name": "create-issue",     "method": "POST", "path": "/rest/api/3/issue",                       "defaultSelected": false }
    ]
  },

  "jira-server": {
    "name": "Jira Server / Data Center",
    "description": "Self-hosted Jira (REST API v2)",
    "icon": "jira",
    "hosted": "self",
    "variantOf": "jira",
    "tags": ["project-management", "atlassian"],
    "connection": {
      "baseUrlPattern": "https://jira.{your-domain}.com",
      "baseUrlHint": "Enter your Jira Server instance URL",
      "baseUrlEditable": true,
      "authType": "bearer",
      "authLabel": "Personal Access Token"
    },
    "tools": [
      { "name": "get-issue",        "method": "GET",  "path": "/rest/api/2/issue/{issueId}",             "defaultSelected": true  },
      { "name": "add-comment",      "method": "POST", "path": "/rest/api/2/issue/{issueId}/comment",     "defaultSelected": true  },
      { "name": "transition-issue", "method": "POST", "path": "/rest/api/2/issue/{issueId}/transitions", "defaultSelected": true  },
      { "name": "get-transitions",  "method": "GET",  "path": "/rest/api/2/issue/{issueId}/transitions", "defaultSelected": true  },
      { "name": "search-issues",    "method": "GET",  "path": "/rest/api/2/issue/search",                "defaultSelected": false }
    ]
  },

  "sonarqube": {
    "name": "SonarQube",
    "description": "Code quality and security analysis",
    "icon": "sonarqube",
    "hosted": "self",
    "tags": ["code-quality", "devops"],
    "connection": {
      "baseUrlPattern": "https://sonar.{your-domain}.com",
      "baseUrlHint": "Enter your SonarQube instance URL",
      "baseUrlEditable": true,
      "authType": "bearer",
      "authLabel": "User Token"
    },
    "tools": [
      { "name": "get-project-status", "method": "GET", "path": "/api/qualitygates/project_status?projectKey={projectKey}", "defaultSelected": true  },
      { "name": "get-issues",         "method": "GET", "path": "/api/issues/search?componentKeys={projectKey}",            "defaultSelected": true  },
      { "name": "get-measures",       "method": "GET", "path": "/api/measures/component?component={projectKey}",           "defaultSelected": false }
    ]
  }
}
```

---

### Full services list for v1

**Cloud only:**
- GitHub, Linear, Notion, Slack, Trello, PagerDuty, Datadog

**Self-hosted only:**
- Jenkins, SonarQube, Nexus Repository, Artifactory, Grafana, Harbor (container registry), Gitea, Forgejo

**Cloud + Self-hosted (separate registry entries per variant):**
- Jira (Cloud v3 / Server v2)
- Confluence (Cloud v2 / Server v1)
- Bitbucket (Cloud / Data Center)
- GitLab (Cloud / Self-hosted)
- GitHub Enterprise (same API as GitHub, different base URL)

---

### Why this is better than the alternatives

| | Services Registry | OpenAPI Discover | Postman Import |
|---|---|---|---|
| Requires file/URL from user | No | Yes (spec URL) | Yes (collection file) |
| Works for self-hosted instances | Yes | Yes (if spec exposed) | Yes |
| Works offline | Yes | No | Yes |
| Curated for AI use | Yes - names/descriptions optimised for Claude | No - raw spec names | No - raw collection names |
| Only the useful endpoints | Yes - 8-12 per service | No - all 200+ | Depends on collection |
| Auth pre-configured | Yes | Partial | Via environment file |
| Handles cloud vs self-hosted API differences | Yes - separate variants | No | No |
| Community can extend | Yes - GitHub PRs to registry JSON | N/A | N/A |

---

### Effort estimate
**Small-Medium** — static JSON registry file + variant picker UI + Connect step added to existing Add Integration modal. No new backend routes. The bulk of the work is authoring and testing registry entries for each service variant.

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

## Feature 13 — Named MCP Endpoints (per-agent scoping)

**Why:** Right now every user has one MCP URL that exposes all their tools. Zapier MCP lets you create separate URLs per AI client, each with a curated tool set. As a self-hosted product, Toolshed can go further - scoped endpoints are invisible to hosted competitors because they can't let you isolate environments.

**Real use case:**
- "Coding Agent" endpoint: exposes only GitHub + Jira tools
- "Project Bot" endpoint: exposes only Jira + Confluence + Slack tools
- "Read-only" endpoint: exposes the same tools but strips all write operations

**Data model - new table: `mcp_endpoints`**

```sql
CREATE TABLE mcp_endpoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(60)  NOT NULL UNIQUE,   -- appears in the URL
  token       VARCHAR(64)  NOT NULL UNIQUE,   -- bearer token for this endpoint
  read_only   BOOLEAN NOT NULL DEFAULT false, -- strip POST/PUT/DELETE/PATCH tools
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction: which integrations are enabled on which endpoint
CREATE TABLE mcp_endpoint_integrations (
  endpoint_id    UUID REFERENCES mcp_endpoints(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  PRIMARY KEY (endpoint_id, integration_id)
);
```

**MCP URL format:**
```
GET /mcp/e/:slug     <- MCP endpoint (uses slug + bearer token auth)
```

**Backend - new route file: `server/src/routes/endpoints.js`**

```js
// List / create / update / delete named endpoints
router.get   ('/',     auth, listEndpoints);
router.post  ('/',     auth, createEndpoint);
router.put   ('/:id',  auth, updateEndpoint);
router.delete('/:id',  auth, deleteEndpoint);

// Manage which integrations are enabled on an endpoint
router.put   ('/:id/integrations', auth, setEndpointIntegrations);
```

**Changes to `server/src/routes/mcp.js`:**

The existing `/mcp/tools` and `/mcp/call` routes authenticate via the user's personal MCP token. Add parallel routes that authenticate via an endpoint token and filter tools accordingly:

```js
// Resolve which user + tool set to use from the endpoint slug
async function resolveEndpoint(slug, bearerToken) {
  const endpoint = await McpEndpoint.findOne({ where: { slug, token: bearerToken, isActive: true } });
  if (!endpoint) throw new Error('Invalid endpoint');
  const integrationIds = await McpEndpointIntegration.findAll({
    where: { endpointId: endpoint.id }, attributes: ['integrationId']
  }).then(rows => rows.map(r => r.integrationId));
  return { endpoint, userId: endpoint.userId, integrationIds };
}

router.get('/e/:slug', async (req, res) => {
  // same as GET /mcp/tools but filtered to endpoint.integrationIds
  // if endpoint.readOnly: filter out tools where endpoint.method in ['POST','PUT','PATCH','DELETE']
});
```

**UI - new page: `client/src/pages/Endpoints.jsx`**

```
Sidebar → "MCP Endpoints"

┌─────────────────────────────────────────────┐
│  MCP Endpoints                    + New     │
├─────────────────────────────────────────────┤
│  Coding Agent                               │
│  URL: https://your-host/mcp/e/coding-agent  │
│  Token: ••••••••  [Copy]                    │
│  Integrations: GitHub, Jira                 │
│  Read-only: No                    [Edit]    │
├─────────────────────────────────────────────┤
│  Project Bot (read-only)                    │
│  URL: https://your-host/mcp/e/project-bot   │
│  Integrations: Jira, Confluence, Slack      │
│  Read-only: Yes                   [Edit]    │
└─────────────────────────────────────────────┘
```

Edit modal: name, slug, read-only toggle, multi-select checkbox list of integrations.

**Effort:** Medium - new DB tables + 2 route files + one UI page. No changes to existing tool execution logic.

---

## Feature 14 — Webhook / Event Triggers

**Why:** Both Composio and Zapier support events flowing *into* the system. Right now Toolshed is purely request-response: Claude calls a tool, gets a result. Adding triggers moves Toolshed from "tool manager" into "AI workflow engine" - a category Zapier owns but is not open-source.

**Two trigger types:**

**Type A - Inbound Webhook:** A third-party app POSTs to a Toolshed URL. Toolshed receives the payload and reacts.

**Type B - Scheduled (Cron):** Toolshed polls or executes on a timer (e.g. "every morning, call the Jira 'get my issues' tool and store the result").

**Data model - new table: `triggers`**

```sql
CREATE TABLE triggers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  integration_id UUID NOT NULL REFERENCES integrations(id),
  name           VARCHAR(100) NOT NULL,
  type           VARCHAR(20)  NOT NULL CHECK (type IN ('webhook', 'cron')),
  -- webhook: unique path suffix
  webhook_slug   VARCHAR(60) UNIQUE,
  webhook_secret VARCHAR(64),                  -- for HMAC signature validation
  -- cron: schedule expression
  cron_expr      VARCHAR(50),                  -- e.g. "0 9 * * MON-FRI"
  -- what to do when fired
  action_type    VARCHAR(20) NOT NULL CHECK (action_type IN ('store', 'call_tool', 'notify')),
  tool_id        UUID REFERENCES tools(id),    -- for call_tool action
  tool_inputs    JSONB,                        -- static inputs for call_tool
  notify_url     TEXT,                         -- for notify action (outbound webhook)
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_fired_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stored events from webhook/cron trigger fires
CREATE TABLE trigger_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id   UUID NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  fired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload      JSONB,         -- inbound payload or tool call result
  status       VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error')),
  error        TEXT
);
```

**Inbound webhook flow:**

```
POST /webhooks/:slug
  → look up trigger by slug
  → validate HMAC signature (if webhook_secret set)
  → store trigger_event
  → if action_type = 'call_tool': execute tool with tool_inputs merged with inbound payload
  → if action_type = 'notify': forward payload to notify_url
```

**Cron scheduler** - use `node-cron` (already likely available) or `bull` queue:

```js
// server/src/services/triggerScheduler.js
const cron = require('node-cron');

async function startScheduler() {
  const triggers = await Trigger.findAll({ where: { type: 'cron', isActive: true } });
  for (const trigger of triggers) {
    cron.schedule(trigger.cronExpr, () => fireTrigger(trigger));
  }
}
```

**New route file: `server/src/routes/webhooks.js`**

```js
router.post('/:slug', async (req, res) => {
  const trigger = await Trigger.findOne({ where: { webhookSlug: req.params.slug, isActive: true } });
  if (!trigger) return res.status(404).end();
  // HMAC validation
  if (trigger.webhookSecret) {
    const sig = req.headers['x-hub-signature-256'] || req.headers['x-toolshed-signature'];
    if (!validateHmac(req.rawBody, trigger.webhookSecret, sig))
      return res.status(401).json({ error: 'Invalid signature' });
  }
  res.status(200).json({ received: true }); // ack immediately
  fireTrigger(trigger, req.body);           // process async
});
```

**UI - Triggers tab inside each Integration detail page:**

```
Integration: Jira
  [Tools] [Triggers] [Settings]

Triggers
  + New Trigger

  ┌─────────────────────────────────────────────────┐
  │  On Issue Created (webhook)                     │
  │  URL: https://your-host/webhooks/jira-created   │
  │  Action: Call tool "Add Jira Comment"           │
  │  Last fired: 2 hours ago             [Edit/Del] │
  └─────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────┐
  │  Morning Standup (cron: 0 9 * * MON-FRI)        │
  │  Action: Call tool "Get My Issues"              │
  │  Last fired: today 09:00             [Edit/Del] │
  └─────────────────────────────────────────────────┘
```

**Libraries needed:**
- `node-cron` - zero-dependency cron (or re-use `bull` if already in the project)
- No new client libraries

**Effort:** Large - new DB tables + scheduler service + webhook routes + UI tab. But it's the biggest functional jump from "tool manager" to "workflow engine."

---

## Feature 15 — Dev / Staging / Prod Environments

**Why:** This is a genuinely self-hosting-exclusive advantage. Hosted competitors (Zapier, Composio) cannot offer isolated environments per integration because they manage the infrastructure. Toolshed running on your own server *can*. Real use case: Jira integration - dev points to sandbox Jira, prod points to live Jira. Claude's tools are identical. No tool reconfiguration, just switch an environment variable.

**Data model - new table: `integration_environments`**

```sql
CREATE TABLE integration_environments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  name           VARCHAR(30) NOT NULL CHECK (name IN ('dev', 'staging', 'prod', 'custom')),
  label          VARCHAR(50),            -- display name for 'custom' type
  base_url       TEXT NOT NULL,
  credentials    JSONB NOT NULL DEFAULT '{}',  -- encrypted, same as config.auth.credentials
  is_active      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integration_id, name)
);
```

**How it works:**

- Each integration keeps its current `config` (which is effectively the "prod" config)
- Additional environments stored in `integration_environments`
- One environment per integration has `isActive = true` - this is what tool calls use
- Switching: `PATCH /api/integrations/:id/environment` `{ environmentId: "..." }`

**Changes to tool execution (`server/src/routes/mcp.js`):**

```js
// When resolving integration credentials for a tool call:
async function getIntegrationConfig(integrationId) {
  const integration = await Integration.findByPk(integrationId);
  const activeEnv   = await IntegrationEnvironment.findOne({
    where: { integrationId, isActive: true }
  });
  if (activeEnv) {
    return {
      baseUrl:     activeEnv.baseUrl,
      credentials: decryptCredentials(activeEnv.credentials)
    };
  }
  // Fall back to main config (backwards-compatible)
  return {
    baseUrl:     integration.config.baseUrl,
    credentials: decryptCredentials(integration.config.auth?.credentials)
  };
}
```

**New routes: `server/src/routes/environments.js`**

```
GET    /api/integrations/:id/environments           - list environments
POST   /api/integrations/:id/environments           - add environment
PUT    /api/integrations/:id/environments/:envId    - update environment
DELETE /api/integrations/:id/environments/:envId    - delete environment
PATCH  /api/integrations/:id/environment            - { environmentId } set active
```

**UI - Environments tab on Integration detail page:**

```
Integration: Jira
  [Tools] [Triggers] [Environments] [Settings]

Environments
                           Active
  dev      sandbox.atlassian.net     ○
  staging  staging.atlassian.net     ○
  prod     acme.atlassian.net        ● ← active
                                     + Add Environment
```

Clicking a radio immediately calls `PATCH /:id/environment`. Add/Edit opens a modal with: label, base URL, credential fields.

Show active environment name as a badge on the integration card in the list:
```
[ Jira ]   prod ●    12 tools   [Edit]
```

**Effort:** Medium - new table + route file + UI tab. Tool execution change is small and backwards-compatible.

---

## Feature 16 — Audit Log

**Why:** Zapier has a persistent activity history log. Composio tracks all tool calls with access controls. Toolshed's Monitoring page shows recent calls but there is no searchable, exportable, long-term audit trail. This is a hard requirement for any enterprise or team use.

**Data model - new table: `tool_call_log`**

```sql
CREATE TABLE tool_call_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  tool_id        UUID REFERENCES tools(id) ON DELETE SET NULL,
  tool_name      VARCHAR(200),            -- snapshot at call time (tool may be deleted later)
  status_code    SMALLINT,
  duration_ms    INTEGER,
  error          TEXT,
  -- inputs: store sanitised (strip credential-like keys)
  inputs         JSONB,
  called_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tool_call_log_user_idx        ON tool_call_log (user_id, called_at DESC);
CREATE INDEX tool_call_log_tool_idx        ON tool_call_log (tool_id,  called_at DESC);
CREATE INDEX tool_call_log_integration_idx ON tool_call_log (integration_id, called_at DESC);
```

**Where to write logs - `server/src/routes/mcp.js` after every tool call:**

```js
// Add after the tool call completes (success or failure)
async function logToolCall({ userId, integrationId, toolId, toolName, statusCode, durationMs, error, inputs }) {
  const safeInputs = sanitiseInputs(inputs); // strip keys containing 'token','key','secret','password'
  await ToolCallLog.create({ userId, integrationId, toolId, toolName, statusCode, durationMs, error, inputs: safeInputs });
}
```

**Retention - scheduled cleanup:**

```js
// server/src/services/logRetention.js
// Run daily; delete rows older than retentionDays (configurable in System Settings)
cron.schedule('0 3 * * *', async () => {
  const retentionDays = await SystemConfig.get('audit_log_retention_days', 90);
  await ToolCallLog.destroy({
    where: { calledAt: { [Op.lt]: subDays(new Date(), retentionDays) } }
  });
});
```

**New routes: `server/src/routes/auditLog.js`**

```
GET  /api/audit-log
  Query params: ?userId=&integrationId=&toolId=&from=&to=&status=error&page=1&limit=50

GET  /api/audit-log/export
  Same filters; returns CSV (set Content-Disposition: attachment)
```

**UI - new Audit Log page (or tab in Monitoring):**

```
Monitoring → [Tool Tester] [Audit Log]

Filters: [User ▾] [Integration ▾] [Status ▾] [From] [To]  [Export CSV]

Called at          User    Integration  Tool               Status  Duration
2026-04-16 14:32   imran   Jira         Get Transitions    200     312ms
2026-04-16 14:31   imran   Jira         Add Comment        500     88ms   ← red
...
```

Clicking a row expands: full inputs, error detail, response snippet.

**Effort:** Small - new table + 2 routes + one UI tab. The log write is a fire-and-forget `await` so it does not add latency to tool calls.

---

## Feature 17 — Response Transform UI

**Why:** APIs return large JSON responses with 30-50+ fields. Claude wastes context window on irrelevant data, which hurts both quality and cost. Neither Composio nor Zapier filters API responses - Toolshed can be smarter. The `transformResponse` JSONB column already exists on the `tools` table; it just has no UI and is not applied at runtime.

**Runtime - apply transform in `server/src/routes/mcp.js`:**

```js
// After receiving the API response, before returning to Claude:
function applyTransform(data, transform) {
  if (!transform || !transform.pick) return data;

  if (transform.type === 'jsonpath') {
    // use 'jsonpath-plus' library (lightweight, no extra deps for common cases)
    const { JSONPath } = require('jsonpath-plus');
    return JSONPath({ path: transform.pick, json: data, wrap: false });
  }

  if (transform.type === 'pick') {
    // simple field whitelist: { type: 'pick', fields: ['id','title','status','url'] }
    if (Array.isArray(data)) return data.map(item => pickFields(item, transform.fields));
    return pickFields(data, transform.fields);
  }

  return data;
}
```

**Transform schema stored in `tool.transformResponse`:**

```json
// Type 1 - field whitelist (easiest to understand):
{ "type": "pick", "fields": ["id", "title", "state", "html_url"] }

// Type 2 - JSONPath expression (for nested/array responses):
{ "type": "jsonpath", "pick": "$.issues[*].{id,summary,status.name}" }
```

**UI - add "Response Transform" section to the tool edit modal:**

```
Tool Editor
  ...existing fields...

  ▼ Response Transform  (optional - reduces tokens sent to Claude)

     Type:  [None ▾]  [Pick fields ▾]  [JSONPath ▾]

     --- Pick fields ---
     Fields to keep (comma-separated):
     [ id, title, status, url                        ]

     Preview: paste a sample response →
     [ {                                ]    →   [ {           ]
     [   "id": 1,                       ]    →   [   "id": 1,  ]
     [   "title": "Fix login",          ]    →   [   "title":  ]
     [   "body": "...(200 chars)...",   ]    →   [   "status": ]
     [   "state": "open",               ]    →   [   "url": "  ]
     [   "html_url": "...",             ]    →   [ }           ]
     [   (40 more fields...)            ]
```

**Libraries needed:**
- `jsonpath-plus` (client: none needed - preview runs in browser with the same library via CDN or bundled)

**Effort:** Small - runtime already has the column. Backend: ~50 lines in mcp.js. Frontend: transform section in tool modal + live preview component (~150 lines).

---

## Feature 18 — Tool Health Monitoring & Alerting

**Why:** In production, APIs go down, credentials expire, endpoints change. Toolshed has call logging but no proactive alerting. Adding health checks means operators know a tool is broken *before* Claude tells their users "sorry, that failed."

**Data model - add columns to `tools` table (migration):**

```sql
ALTER TABLE tools ADD COLUMN health_check_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tools ADD COLUMN health_check_cron     VARCHAR(50);   -- e.g. "*/15 * * * *"
ALTER TABLE tools ADD COLUMN health_check_inputs   JSONB;         -- test inputs
ALTER TABLE tools ADD COLUMN health_last_checked   TIMESTAMPTZ;
ALTER TABLE tools ADD COLUMN health_last_status    SMALLINT;      -- last HTTP status code
ALTER TABLE tools ADD COLUMN health_last_error     TEXT;
ALTER TABLE tools ADD COLUMN health_fail_count     SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE tools ADD COLUMN health_circuit_open   BOOLEAN  NOT NULL DEFAULT false;
```

**Scheduler - `server/src/services/healthChecker.js`:**

```js
async function checkTool(tool) {
  const start = Date.now();
  try {
    const result = await executeToolInternal(tool, tool.healthCheckInputs || {});
    const ok = result.statusCode >= 200 && result.statusCode < 300;

    await tool.update({
      healthLastChecked: new Date(),
      healthLastStatus:  result.statusCode,
      healthLastError:   ok ? null : result.error,
      healthFailCount:   ok ? 0 : tool.healthFailCount + 1,
      healthCircuitOpen: tool.healthFailCount + (ok ? 0 : 1) >= CIRCUIT_OPEN_THRESHOLD
    });

    if (!ok && tool.healthFailCount + 1 >= ALERT_THRESHOLD) {
      await sendHealthAlert(tool);
    }
  } catch (err) {
    await tool.update({ healthLastError: err.message, healthFailCount: tool.healthFailCount + 1 });
  }
}
```

**Circuit breaker in `mcp.js`:**

```js
// Before executing any tool call:
if (tool.healthCircuitOpen) {
  return { error: `Tool "${tool.name}" is currently unavailable (circuit open). Check Tool Health in Toolshed.` };
}
```

**Alert channel - System Settings:**

```
Settings → Alerts
  Alert channel: [None] [Slack webhook] [Email] [Custom webhook]
  Slack webhook URL: [_________________________]
  Alert threshold: [ 3 ] consecutive failures
  Circuit open after: [ 5 ] consecutive failures  (0 = never)
```

**UI changes:**

Tool card in the integration tools list gets a health badge:

```
[ Get Jira Issue ]  ● 200  12ms ago    ← green dot
[ Add Comment    ]  ● 200  12ms ago
[ Get Transitions]  ✕ 401  5min ago   ← red, credentials expired
```

Tools page → new "Health" tab showing all monitored tools in a table with last check, status, fail count, circuit state.

**Libraries needed:** None new - uses `node-cron` (same as Feature 14).

**Effort:** Medium - DB migration + scheduler service + alert sender + UI badge + Health tab.

---

## Feature 19 — Outbound Webhook Notifications

**Why:** When a tool call succeeds or fails, notify external systems. This is the outbound counterpart to Feature 14's inbound triggers. Use cases: post a Slack message every time a Jira ticket is created via Claude; alert PagerDuty on every tool failure; feed tool call data into n8n or Make.

**Data model - new table: `notification_hooks`**

```sql
CREATE TABLE notification_hooks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  url            TEXT NOT NULL,
  secret         VARCHAR(64),               -- for HMAC signing outbound payloads
  -- filters: which events to send
  on_success     BOOLEAN NOT NULL DEFAULT true,
  on_error       BOOLEAN NOT NULL DEFAULT true,
  -- scope: null = all integrations, set = specific integration
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Runtime - fire after tool call in `mcp.js`:**

```js
async function fireOutboundHooks(userId, integrationId, toolName, statusCode, inputs, response, durationMs) {
  const hooks = await NotificationHook.findAll({
    where: {
      userId,
      isActive: true,
      [Op.or]: [
        { integrationId: null },
        { integrationId }
      ]
    }
  });

  const isError = statusCode >= 400 || statusCode == null;

  for (const hook of hooks) {
    if (isError  && !hook.onError)   continue;
    if (!isError && !hook.onSuccess) continue;

    const payload = {
      event:         isError ? 'tool.error' : 'tool.success',
      toolName,
      integrationId,
      statusCode,
      durationMs,
      timestamp:     new Date().toISOString()
      // note: inputs/response intentionally omitted by default to avoid leaking secrets
    };

    const sig = hook.secret
      ? 'sha256=' + crypto.createHmac('sha256', hook.secret).update(JSON.stringify(payload)).digest('hex')
      : undefined;

    fetch(hook.url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...(sig ? { 'X-Toolshed-Signature': sig } : {}) },
      body:    JSON.stringify(payload)
    }).catch(() => {}); // fire-and-forget; never let a bad webhook break a tool call
  }
}
```

**UI - Settings → Notifications:**

```
Settings → Notifications → + Add Webhook

  Name:        Slack Alerts
  URL:         https://hooks.slack.com/...
  Scope:       [All integrations ▾]
  Notify on:   [✓] Success  [✓] Failure
  Secret:      [optional - for signature verification]

  [Test] button sends a sample payload immediately
```

**Effort:** Small - new table + ~80 lines in mcp.js (fire-and-forget, no latency impact) + one Settings sub-page.

---

## Feature 20 — Granular Access Control (read-only mode + per-tool permissions)

**Why:** Zapier supports per-AI-agent whitelisting and read-only mode. Toolshed has admin/user roles and integration sharing, but once a user can access an integration they can use all its tools. In a team environment, you may want to let junior staff or external AI agents use only GET tools, not tools that create/modify/delete data.

**Two layers:**

**Layer A - Read-only mode on shared integrations:**

Add `readOnly BOOLEAN` to the `integrations` table (or to `integration_sharing` if it exists). When `readOnly = true`, any tool from that integration whose `endpoint.method` is `POST`, `PUT`, `PATCH`, or `DELETE` is excluded from the MCP tool list.

```sql
ALTER TABLE integrations ADD COLUMN read_only BOOLEAN NOT NULL DEFAULT false;
```

```js
// In mcp.js tool list building:
const READ_ONLY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const tools = allTools.filter(t => {
  if (integration.readOnly && READ_ONLY_METHODS.has(t.endpoint?.method?.toUpperCase())) return false;
  return true;
});
```

**Layer B - Per-tool enable/disable per named endpoint (extends Feature 13):**

Add a `disabled_tool_ids TEXT[]` column to `mcp_endpoints`, or a junction table for explicit allow-listing:

```sql
-- Option A: blocklist (simpler for large integrations)
ALTER TABLE mcp_endpoints ADD COLUMN disabled_tool_ids UUID[] NOT NULL DEFAULT '{}';

-- Option B: allowlist junction (more explicit)
CREATE TABLE mcp_endpoint_tools (
  endpoint_id UUID REFERENCES mcp_endpoints(id) ON DELETE CASCADE,
  tool_id     UUID REFERENCES tools(id)         ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (endpoint_id, tool_id)
);
```

Option A is simpler and recommended to start with. The endpoint edit UI shows each tool with a toggle; disabled IDs are stored in the array.

**UI - add to Integration edit page:**

```
Integration: Jira
  [Tools] [Triggers] [Environments] [Settings]
                                        ↑
  Settings tab adds:
  ┌─────────────────────────────────┐
  │  Access                         │
  │  Read-only mode  [toggle]       │
  │  (Hide write tools from Claude) │
  └─────────────────────────────────┘
```

Named Endpoint edit page (Feature 13) gains a tool toggle list:

```
Edit Endpoint: Coding Agent

  Integration: GitHub   [✓ show all]
    [✓] search_issues      GET
    [✓] get_issue          GET
    [✓] create_issue       POST   ← can uncheck
    [✓] close_issue        POST   ← can uncheck
    [ ] delete_repository  DELETE ← already unchecked (dangerous)

  Integration: Jira     [✓ show all]
    ...
```

**Effort:** Small - DB column + filter in mcp.js + UI toggles. Layer A alone (~1 day) is immediately useful. Layer B adds per-tool granularity on top of Feature 13.

---

## Feature 21 — Claude Code Skill Registry

**Why:** Toolshed already stores and exposes prompt skills as MCP tools. With small additions it becomes a shareable registry of Claude Code slash commands (`/commit`, `/review-pr`, etc.) stored as SKILL.md files. Anyone connecting to Toolshed via MCP can ask Claude to list available skills and install any of them locally in one step — no file sharing, no copy-paste.

**What already works (no changes needed):**
- `PromptLibrary` table stores skill name, description, prompt body, and `isShared`
- MCP server registers each skill as `skill_<name>` and invokes it when called
- `GET /api/skills` lists all skills

**What is missing:**

1. Two extra columns on `prompt_library` for SKILL.md metadata
2. A new MCP tool `get_skill_file` that returns raw installable SKILL.md content
3. UI: import from SKILL.md file + "Copy SKILL.md" button
4. UI: "Claude Code" type flag so the Skills page can show a dedicated section

---

### Step 1 — DB migration: add SKILL.md metadata columns

```sql
ALTER TABLE prompt_library
  ADD COLUMN argument_hint  VARCHAR(200),
  ADD COLUMN allowed_tools  VARCHAR(500),
  ADD COLUMN skill_type     VARCHAR(20) NOT NULL DEFAULT 'prompt';
  -- skill_type: 'prompt' = existing behaviour, 'claude_code' = SKILL.md registry entry
```

Update `server/src/models/PromptLibrary.js`:

```js
argumentHint: {
  type: DataTypes.STRING(200),
  field: 'argument_hint'
},
allowedTools: {
  type: DataTypes.STRING(500),
  field: 'allowed_tools'
},
skillType: {
  type: DataTypes.STRING(20),
  defaultValue: 'prompt',
  field: 'skill_type'
}
```

---

### Step 2 — New MCP tool: `get_skill_file`

In `server/src/mcp/server.js`, alongside `registerSkill()`, register one extra static tool:

```js
registerSkillRegistryTools() {
  // Tool 1: list all claude_code type skills
  this.toolsMap.set('list_claude_code_skills', {
    type: 'builtin',
    handler: async () => {
      const { PromptLibrary } = loadModels();
      const skills = await PromptLibrary.findAll({
        where: { skillType: 'claude_code' },
        attributes: ['name', 'description', 'argumentHint', 'allowedTools']
      });
      return skills.map(s => ({
        name:          s.name,
        description:   s.description,
        argumentHint:  s.argumentHint || '',
        allowedTools:  s.allowedTools || '',
        installCommand: `Ask Claude to install skill "${s.name}" — it will call get_skill_file and write the file for you`
      }));
    }
  });

  // Tool 2: get the raw SKILL.md content for a named skill
  this.toolsMap.set('get_skill_file', {
    type: 'builtin',
    handler: async ({ name }) => {
      const { PromptLibrary } = loadModels();
      const skill = await PromptLibrary.findOne({
        where: { name, skillType: 'claude_code' }
      });
      if (!skill) return { error: `Skill "${name}" not found` };

      // Build the SKILL.md content
      const lines = ['---'];
      lines.push(`name: ${skill.name}`);
      if (skill.description)   lines.push(`description: ${skill.description}`);
      if (skill.argumentHint)  lines.push(`argument-hint: ${skill.argumentHint}`);
      if (skill.allowedTools)  lines.push(`allowed-tools: ${skill.allowedTools}`);
      lines.push('---');
      lines.push('');
      lines.push(skill.prompt);

      return {
        name:    skill.name,
        content: lines.join('\n'),
        installPath: `~/.claude/skills/${skill.name}/SKILL.md`,
        instructions: `Write the content to ${`~/.claude/skills/${skill.name}/SKILL.md`} to install this skill. Create the directory first if it does not exist.`
      };
    }
  });
}
```

Register these tools in `initialize()` and `refreshTools()` alongside the existing tool/skill registration.

Also add the schema declaration for MCP tool listing:

```js
// In the tools list returned to Claude:
{
  name: 'list_claude_code_skills',
  description: 'List all Claude Code slash command skills available in this Toolshed instance',
  inputSchema: { type: 'object', properties: {} }
},
{
  name: 'get_skill_file',
  description: 'Get the SKILL.md file content for a named Claude Code skill. Returns the content and the path to write it to for local installation.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The skill name (e.g. "commit", "review-pr")' }
    },
    required: ['name']
  }
}
```

---

### Step 3 — New route: `POST /api/skills/import-skillmd`

Accepts a raw SKILL.md string, parses frontmatter, and creates a `PromptLibrary` record:

```js
router.post('/import-skillmd', auth, async (req, res) => {
  const { content } = req.body;  // raw SKILL.md text
  if (!content) return res.status(400).json({ error: 'content is required' });

  // Parse frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return res.status(400).json({ error: 'Invalid SKILL.md format — missing frontmatter' });

  const fm   = {};
  fmMatch[1].split('\n').forEach(line => {
    const [k, ...v] = line.split(':');
    if (k) fm[k.trim()] = v.join(':').trim();
  });
  const body = fmMatch[2].trim();

  if (!fm.name) return res.status(400).json({ error: 'SKILL.md must have a name in frontmatter' });

  const { PromptLibrary } = loadModels();
  const skill = await PromptLibrary.create({
    userId:       req.user.id,
    name:         fm.name,
    description:  fm.description || '',
    argumentHint: fm['argument-hint'] || '',
    allowedTools: fm['allowed-tools'] || '',
    prompt:       body,
    outputFormat: 'text',
    isShared:     true,
    skillType:    'claude_code'
  });
  res.status(201).json(skill);
});
```

---

### Step 4 — UI changes in `client/src/pages/Skills.jsx`

**Add a "Claude Code Skills" tab** alongside the existing prompt templates tab:

```
Skills
  [Prompt Templates]  [Claude Code Skills]
                                ↑ new tab
```

**Claude Code Skills tab:**

```
┌──────────────────────────────────────────────────────┐
│  Claude Code Skills              [+ Import SKILL.md] │
├──────────────────────────────────────────────────────┤
│  /commit                                             │
│  Create a commit message and commit staged changes   │
│  argument-hint: [-m "message"]        [Copy] [Del]   │
├──────────────────────────────────────────────────────┤
│  /review-pr                                          │
│  Review a pull request from Bitbucket                │
│  argument-hint: [PR number]           [Copy] [Del]   │
└──────────────────────────────────────────────────────┘
```

**"Import SKILL.md" modal** - a textarea where you paste the SKILL.md content, then click Import. Calls `POST /api/skills/import-skillmd`.

**"Copy SKILL.md" button** - copies the reconstructed SKILL.md content to clipboard. Same content that `get_skill_file` returns.

---

### How it works end-to-end

**Adding your skills (one-time setup):**
1. Go to Skills → Claude Code Skills → Import SKILL.md
2. Paste the content of each `~/.claude/skills/<name>/SKILL.md`
3. Done - they're now in Toolshed and exposed via MCP

**Installing a skill (any user with MCP access):**
```
User: "What Claude Code skills are available?"
Claude: calls list_claude_code_skills → returns commit, review-pr, digest, ...

User: "Install the commit skill locally"
Claude: calls get_skill_file(name="commit")
        → gets content + installPath
        → writes ~/.claude/skills/commit/SKILL.md
        → "Done! /commit is now available in Claude Code."
```

**Effort:** Small - 1 migration + ~80 lines server + ~150 lines UI. Builds entirely on existing infrastructure.

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
