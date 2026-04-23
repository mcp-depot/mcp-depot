# MCPConnect — Feature Ideas

> Proposed features that are not bug fixes. Each entry explains the problem,
> the proposed solution, and why it is worth building.

---

## Feature 01 — Session Context Store: share AI session context across sessions, tools, and teammates

**Status:** Implemented

**The problem:**

When two AI sessions work on the same problem — whether that is two Claude Code
windows, a Claude Code session and a Cursor session, or two teammates on different
machines — there is no way to share what one session has discovered with another.
The user becomes the manual bridge: copy-pasting error messages, re-explaining
context, watching the second session re-diagnose things the first already solved.

**The proposed solution:**

Add four MCP tools to MCPConnect backed by a `SessionContext` table with user
ownership and opt-in sharing. Contexts are **private by default** — only the creator
can read, update, and delete their own context. Setting `shared: true` makes a
context readable by any MCPConnect user, while still keeping write/delete
restricted to the owner.

| Tool | Description |
|------|-------------|
| `store-session-context(name, content, shared?, ttlHours?)` | Save a named context. `shared` defaults to `false`. `ttlHours` defaults to 168 (7 days); pass `0` to pin permanently. |
| `get-session-context(name)` | Retrieve a context you own or that is shared. Returns 404 for private contexts owned by others. |
| `list-session-contexts()` | List your own contexts plus all shared contexts, with expiry info. |
| `delete-session-context(name)` | Delete a context you own. Returns 403 if not the owner. |

**Access rules (summary):**

| Operation | Who can do it |
|-----------|--------------|
| Read (get / list) | Owner, or any user if `isShared = true` |
| Update content | Owner only (403 for others) |
| Toggle shared flag | Owner only |
| Delete | Owner only (403 for others) |

**The workflow:**

```
Session A (debugging):
  User: "Summarize what we've found and store it in MCPConnect as 'bitbucket-debug'"
  Claude: calls store-session-context('bitbucket-debug', summary, shared=true)

Session B (testing, possibly different machine or tool):
  User: "Load context 'bitbucket-debug' from MCPConnect"
  Claude: calls get-session-context('bitbucket-debug')
  Claude: reads it, instantly has Session A's full mental model — no re-diagnosis needed

Private use (no sharing needed):
  User: "Store my current investigation notes as 'auth-notes' - keep it private"
  Claude: calls store-session-context('auth-notes', notes)  // shared defaults to false
```

**Why this works well:**

- **Private by default** — sensitive investigation notes, personal working state, or
  half-formed thoughts stay private until explicitly shared.
- **AI-curated** — Claude generates the summary, so it captures what actually matters
  rather than dumping a raw transcript. The second session gets a decision-ready
  briefing, not noise.
- **Cross-tool** — a Claude Code session and a Cursor session share the same
  MCPConnect instance. Any MCP-compatible client can read and write contexts.
- **Cross-machine** — because it is stored in MCPConnect's DB (not the local
  filesystem), a teammate on a different machine loads the same context.
- **Named and discoverable** — `list-session-contexts()` shows what is available.
  No need to remember what you saved or where.

**Schema:**

```sql
CREATE TABLE SessionContext (
  id        UUID PRIMARY KEY,
  name      VARCHAR(255) UNIQUE NOT NULL,
  content   TEXT NOT NULL,
  isShared  BOOLEAN NOT NULL DEFAULT FALSE,
  ttlHours  INTEGER NULL,          -- NULL = never expire; default 168 (7 days) applied at write time
  createdBy UUID REFERENCES Users(id) ON DELETE SET NULL,
  createdAt DATETIME,
  updatedAt DATETIME
);
```

**Implementation notes:**

- `content` is freeform text — no schema enforcement. Claude writes whatever is
  useful: markdown summaries, JSON state, bullet lists of findings.
- `name` is unique across all users. Two users cannot create contexts with the same
  name. The first creator owns the name; others get a 409 conflict if they try to
  create it (they can update it only if they are the owner).
- `isShared` is stored on the row. The UI should surface this as a toggle so
  users can share or unshare without going through Claude.
- **TTL:** `ttlHours` stores how long a context lives after its last update. `NULL`
  means never expire. The default at write time is `168` (7 days) — applied by the
  server if the caller omits `ttlHours`. Passing `ttlHours: 0` pins the context
  permanently (stored as `NULL`). A background cleanup job deletes expired rows.
  The 7-day default is hardcoded for now; a system-setting override can be added later.
- Admin UI: a list view under a "Contexts" section, with name, owner, shared badge,
  expiry countdown, and age. No editor needed — the AI writes the content. Owner gets
  a share toggle and a delete button; non-owners see read-only.

**Effort estimate:** Small — the table exists, the routes exist. Remaining work adds
one column (`ttlHours`), a new migration, TTL param on the store tool, and a cleanup
job. No new dependencies.

---

## Feature 02 — Session Channels: live append-only log shared across sessions

**Status:** Implemented

**Relationship to Feature 01:**

Feature 01 stores a single named snapshot - one session summarizes, another loads
it. Feature 02 stores a continuous log - both sessions append messages as they work,
and either session can read only what is new since it last checked. The DB pattern,
route pattern, model pattern, and MCP registration pattern are identical to Feature
01. The only structural differences are: no UNIQUE constraint on channel name
(multiple rows per channel), no `updatedAt` (append-only), and a `since` filter on
the read tool.

**The problem:**

Feature 01 requires one session to stop and summarize before the other can benefit.
When two sessions are working in parallel - or when one session wants to observe
another as it progresses - a snapshot model forces an artificial synchronization
point. The session being observed has to interrupt its work to produce a summary.

**The proposed solution:**

An append-only channel log. Sessions post short messages as they go - findings,
decisions, errors hit, things tried. The other session reads the channel at any time
and gets a running log of everything posted, with an optional `since` timestamp to
get only new entries since the last check.

| Tool | Description |
|------|-------------|
| `append-to-channel(channel, message)` | Post a message to a named channel |
| `read-channel(channel, since?)` | Read all messages in a channel, optionally filtered to entries after a given ISO timestamp |
| `list-channels()` | List all channels with message count and last activity |
| `clear-channel(channel)` | Delete all messages in a channel |

**The workflow:**

```
Session A (implementing a feature, posting as it goes):
  Claude: calls append-to-channel('pool-api', 'Auth middleware runs before route - confirmed')
  Claude: calls append-to-channel('pool-api', 'Hit 403 - needs RoleRight entry for POOL/VIEW')
  Claude: calls append-to-channel('pool-api', 'Fixed - added RoleRight id=42 to RoleRight-data.json')

Session B (reviewing, checking in periodically):
  User: "What has Session A posted to pool-api?"
  Claude: calls read-channel('pool-api')
  Claude: sees all three messages in order - instantly up to speed, no summary requested

  User (30 min later): "Anything new on pool-api?"
  Claude: calls read-channel('pool-api', since='2026-04-22T10:15:00Z')
  Claude: sees only messages posted after that timestamp - just the delta
```

**Why this is better than summarizing for parallel work:**

- **No interruption** - Session A never has to stop and write a summary. It just
  appends a one-liner whenever it finds something worth noting.
- **Incremental** - Session B gets only what is new. The `since` parameter means
  it does not re-read the whole history every time it checks in.
- **Parallel-friendly** - both sessions can append to the same channel simultaneously.
  There is no single owner of the log.
- **Audit trail** - the full history is preserved. If something breaks later, the
  log shows the sequence of decisions that led there.

**Schema:**

```sql
CREATE TABLE SessionChannel (
  id        UUID PRIMARY KEY,
  channel   VARCHAR(255) NOT NULL,
  message   TEXT NOT NULL,
  createdBy UUID REFERENCES Users(id),
  createdAt DATETIME NOT NULL
  -- no updatedAt: rows are never updated, only inserted or deleted
);

CREATE INDEX idx_session_channel_channel_created
  ON SessionChannel(channel, createdAt);
```

The index on `(channel, createdAt)` makes the `since` filter fast even with thousands
of rows.

**Effort estimate:** Very small - same as Feature 01. The route and model are
simpler (no upsert logic, no updatedAt). The main addition is the `since` query
parameter on the read route and the composite index.

---

## Feature 03 — MCPConnect Sessions: split session tools into a separate disableable integration

**Status:** Implemented

**The problem:**

All 8 session persistence tools (`store-session-context`, `get-session-context`,
`list-session-contexts`, `delete-session-context`, `append-to-channel`,
`read-channel`, `list-channels`, `clear-channel`) currently live inside the main
`MCPConnect` integration. This means:

- Users who do not use Contexts or Channels still get all 8 tools advertised to
  Claude on every session. More tools = more tokens consumed on the tools/list
  response and more noise in Claude's tool selection.
- There is no way to turn off just the session tools without deleting them, which
  would break them for users who do want them.
- Every session reconnect re-queries all tools, including the 8 session tools,
  even if they are never called.

**The proposed solution:**

Create a second built-in integration called **MCPConnect Sessions** that owns the
8 session tools. The main `MCPConnect` integration keeps only the core tools:
`hello`, `list-tools`, `fetch-url`, `list-skills`, `get-skill`.

Users who do not need session persistence can disable `MCPConnect Sessions` from
the admin UI. Claude will no longer see those 8 tools, the tools/list response is
shorter, and the reconnect query is faster.

**Tool split:**

| Integration | Tools |
|---|---|
| `MCPConnect` (core, always-on) | `hello`, `list-tools`, `fetch-url`, `list-skills`, `get-skill` |
| `MCPConnect Sessions` (optional, enabled by default) | `store-session-context`, `get-session-context`, `list-session-contexts`, `delete-session-context`, `append-to-channel`, `read-channel`, `list-channels`, `clear-channel` |

**Name rationale:** "Sessions" matches the sidebar group already introduced in
Feature 02 (`Sessions > Contexts` and `Sessions > Channels`). It describes what
the tools do — not that they are optional — so it reads well both in the UI and
when Claude surfaces the integration name.

---

## Feature 04 — Dashboard: Sessions stat card and Quick Action shortcut

**Status:** Implemented

**The problem:**

The Dashboard was designed around the original MCPConnect use case: connect an API,
create tools, consume from Claude. It shows stat cards for Integrations, Tools, and
External MCP. Since Features 01-02, Session Contexts and Channels are first-class
features — but they are completely invisible on the Dashboard. A user has no idea
how many contexts exist, whether any are shared, or how active the channels are,
without navigating away.

The Quick Actions panel also has no shortcut into the Sessions area, treating it as
a secondary concern even though it is now a core part of what MCPConnect offers.

Additionally, the Getting Started guide's step 3 points only to External MCP as
the optional path, which undersells Sessions as a beginner-friendly alternative.

**The proposed solution:**

Three small, targeted changes — no structural rework needed.

**Change 1 — Add a Sessions stat card (fourth position in the grid):**

Fetch from `/session-contexts` and `/session-channels` and display:

| Stat | Detail |
|------|--------|
| Contexts | total count, with shared count as sub-label |
| Channels | total count |

Example card appearance:

```
[Layers icon]
  3
Sessions
  2 contexts · 1 channel
  1 shared
[View →]
```

Link the card to `/session-contexts`.

**Change 2 — Add a Quick Action for Sessions:**

Add a fourth quick action alongside Add Integration / Create Skill / API Settings:

```
[MessagesSquare icon]  Browse Sessions
```

Links to `/session-contexts`.

**Change 3 — Update Getting Started step 3:**

Current text:
> **Configure External MCP (Optional)**
> Connect to external MCP servers for additional tools

Updated text:
> **Explore Optional Features**
> Connect external MCP servers for more tools, or use Session Contexts & Channels to share AI working state across sessions and teammates

---

## Feature 05 — Single npm package: run MCPConnect with one command

**Status:** Implemented

**The problem:**

Setting up MCPConnect currently requires cloning the repository, understanding the
Docker Compose setup, and manually configuring the MCP client to point at the
running server. For a first-time user this is a significant barrier — especially
compared to tools like n8n, where `npx n8n` is all that is needed to get started.

**The proposed solution:**

Publish MCPConnect as a single npm package that starts everything with one command:

```sh
npx mcpconnect
```

The package starts the Postgres database, the Express server, and serves the
pre-built React client. The MCP client config entry becomes a single
`npx mcpconnect --mcp` command that starts only the stdio MCP wrapper.

| Command | What it starts |
|---------|---------------|
| `npx mcpconnect` | Full stack: DB, server, client UI |
| `npx mcpconnect --mcp` | stdio MCP wrapper only (for MCP client config) |
| `npx mcpconnect --server` | Server and DB only (headless, no client) |

**User experience (getting started in under 5 minutes):**

```sh
# Terminal 1 — start MCPConnect
npx mcpconnect
# Admin UI: http://localhost:5173

# Claude Code settings.json
{
  "mcpServers": {
    "mcpconnect": {
      "command": "npx",
      "args": ["mcpconnect", "--mcp"]
    }
  }
}
```

No git clone, no Docker Compose knowledge, no manual `.env` setup. Share
`npx mcpconnect` with a teammate and they are running in minutes.

**Why this is worth building:**

- **Adoption** — removes the single biggest barrier to first use. The current
  setup requires Docker knowledge and repo familiarity that most users do not have
  before they have seen the product work.
- **Proven model** — n8n runs this way at scale. The npm package is how most
  self-hosted n8n users run it locally.
- **The pieces already exist** — the Express server, the React build, and the
  `mcp-connect` stdio wrapper are all already written. The work is packaging and
  a CLI entry point.
- **Team sharing** — a team evaluating MCPConnect internally can share one command
  rather than a multi-step setup document.

**Key design decisions:**

- Ship the React client as a pre-built static `dist/` bundle inside the npm
  package. The server serves it directly — no Vite or build step at runtime.
- **Database: SQLite by default, Postgres when `DATABASE_URL` is set.** Sequelize
  supports both dialects with the same models and queries — no code changes needed
  beyond the connection config. The launcher auto-detects:
  ```js
  const db = process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL)
    : new Sequelize({ dialect: 'sqlite', storage: path.join(os.homedir(), '.mcpconnect', 'data.db') });
  ```
  SQLite data is stored in `~/.mcpconnect/data.db` — no server process, no install.
- **Existing Docker/Postgres setup is completely unaffected.** `DATABASE_URL` is
  always injected by `docker-compose.yml`, so the SQLite fallback never triggers
  in the current deployment. Both paths coexist with no conflicts.
- Version the npm package independently of the Docker Compose setup so teams can
  choose whichever deployment path fits them.

**Effort estimate:** Medium — the individual pieces exist. The work is: npm
package scaffolding, a CLI entry point (`bin/mcpconnect.js`), serving the
pre-built client from Express, and adding the SQLite dialect + `sqlite3` dependency
for the zero-config case.
