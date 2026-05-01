# MCP Depot — Feature Ideas

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

Add four MCP tools to MCP Depot backed by a `SessionContext` table with user
ownership and opt-in sharing. Contexts are **private by default** — only the creator
can read, update, and delete their own context. Setting `shared: true` makes a
context readable by any MCP Depot user, while still keeping write/delete
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
  User: "Summarize what we've found and store it in MCP Depot as 'bitbucket-debug'"
  Claude: calls store-session-context('bitbucket-debug', summary, shared=true)

Session B (testing, possibly different machine or tool):
  User: "Load context 'bitbucket-debug' from MCP Depot"
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
  MCP Depot instance. Any MCP-compatible client can read and write contexts.
- **Cross-machine** — because it is stored in MCP Depot's DB (not the local
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

## Feature 03 — MCP Depot Sessions: split session tools into a separate disableable integration

**Status:** Implemented

**The problem:**

All 8 session persistence tools (`store-session-context`, `get-session-context`,
`list-session-contexts`, `delete-session-context`, `append-to-channel`,
`read-channel`, `list-channels`, `clear-channel`) currently live inside the main
`MCP Depot` integration. This means:

- Users who do not use Contexts or Channels still get all 8 tools advertised to
  Claude on every session. More tools = more tokens consumed on the tools/list
  response and more noise in Claude's tool selection.
- There is no way to turn off just the session tools without deleting them, which
  would break them for users who do want them.
- Every session reconnect re-queries all tools, including the 8 session tools,
  even if they are never called.

**The proposed solution:**

Create a second built-in integration called **MCP Depot Sessions** that owns the
8 session tools. The main `MCP Depot` integration keeps only the core tools:
`hello`, `list-tools`, `fetch-url`, `list-skills`, `get-skill`.

Users who do not need session persistence can disable `MCP Depot Sessions` from
the admin UI. Claude will no longer see those 8 tools, the tools/list response is
shorter, and the reconnect query is faster.

**Tool split:**

| Integration | Tools |
|---|---|
| `MCP Depot` (core, always-on) | `hello`, `list-tools`, `fetch-url`, `list-skills`, `get-skill` |
| `MCP Depot Sessions` (optional, enabled by default) | `store-session-context`, `get-session-context`, `list-session-contexts`, `delete-session-context`, `append-to-channel`, `read-channel`, `list-channels`, `clear-channel` |

**Name rationale:** "Sessions" matches the sidebar group already introduced in
Feature 02 (`Sessions > Contexts` and `Sessions > Channels`). It describes what
the tools do — not that they are optional — so it reads well both in the UI and
when Claude surfaces the integration name.

---

## Feature 04 — Dashboard: Sessions stat card and Quick Action shortcut

**Status:** Implemented

**The problem:**

The Dashboard was designed around the original MCP Depot use case: connect an API,
create tools, consume from Claude. It shows stat cards for Integrations, Tools, and
External MCP. Since Features 01-02, Session Contexts and Channels are first-class
features — but they are completely invisible on the Dashboard. A user has no idea
how many contexts exist, whether any are shared, or how active the channels are,
without navigating away.

The Quick Actions panel also has no shortcut into the Sessions area, treating it as
a secondary concern even though it is now a core part of what MCP Depot offers.

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

## Feature 05 — Single npm package: run MCP Depot with one command

**Status:** Implemented

**The problem:**

Setting up MCP Depot currently requires cloning the repository, understanding the
Docker Compose setup, and manually configuring the MCP client to point at the
running server. For a first-time user this is a significant barrier — especially
compared to tools like n8n, where `npx n8n` is all that is needed to get started.

**The proposed solution:**

Publish MCP Depot as a single npm package that starts everything with one command:

```sh
npx mcp-depot
```

The package starts the Postgres database, the Express server, and serves the
pre-built React client. The MCP client config entry becomes a single
`npx mcp-depot --mcp` command that starts only the stdio MCP wrapper.

| Command | What it starts |
|---------|---------------|
| `npx mcp-depot` | Full stack: DB, server, client UI |
| `npx mcp-depot --mcp` | stdio MCP wrapper only (for MCP client config) |
| `npx mcp-depot --server` | Server and DB only (headless, no client) |

**User experience (getting started in under 5 minutes):**

```sh
# Terminal 1 — start MCP Depot
npx mcp-depot
# Admin UI: http://localhost:5173

# Claude Code settings.json
{
  "mcpServers": {
    "mcp-depot": {
      "command": "npx",
      "args": ["mcp-depot", "--mcp"]
    }
  }
}
```

No git clone, no Docker Compose knowledge, no manual `.env` setup. Share
`npx mcp-depot` with a teammate and they are running in minutes.

**Why this is worth building:**

- **Adoption** — removes the single biggest barrier to first use. The current
  setup requires Docker knowledge and repo familiarity that most users do not have
  before they have seen the product work.
- **Proven model** — n8n runs this way at scale. The npm package is how most
  self-hosted n8n users run it locally.
- **The pieces already exist** — the Express server, the React build, and the
  `mcp-connect` stdio wrapper are all already written. The work is packaging and
  a CLI entry point.
- **Team sharing** — a team evaluating MCP Depot internally can share one command
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
    : new Sequelize({ dialect: 'sqlite', storage: path.join(os.homedir(), '.mcp-depot', 'data.db') });
  ```
  SQLite data is stored in `~/.mcp-depot/data.db` — no server process, no install.
- **Existing Docker/Postgres setup is completely unaffected.** `DATABASE_URL` is
  always injected by `docker-compose.yml`, so the SQLite fallback never triggers
  in the current deployment. Both paths coexist with no conflicts.
- Version the npm package independently of the Docker Compose setup so teams can
  choose whichever deployment path fits them.

**Effort estimate:** Medium — the individual pieces exist. The work is: npm
package scaffolding, a CLI entry point (`bin/mcp-depot.js`), serving the
pre-built client from Express, and adding the SQLite dialect + `sqlite3` dependency
for the zero-config case.


---

## Feature 06 — `--port` CLI flag: run server on a custom port

**Status:** Implemented (`f3c8a18`)

**The problem:**

Users who already have something running on port 3000 must set `PORT=3001 mcp-depot` as an env var. On Windows this requires `set PORT=3001 && mcp-depot` which is awkward. There is no CLI flag equivalent, and the README buries the `PORT` env var in a table.

**The proposed solution:**

Add `--port=<n>` flag to `bin/cli.js`:

```sh
mcp-depot --port 3001
mcp-depot --port=3001
```

**Implementation — `bin/cli.js`:**

```js
// Parse --port flag (supports --port=3001 and --port 3001)
const portFlagIndex = args.findIndex(a => a === '--port');
const portFlagValue = args.find(a => a.startsWith('--port='));
const portArg = portFlagValue
  ? portFlagValue.split('=')[1]
  : portFlagIndex !== -1 ? args[portFlagIndex + 1] : null;

if (portArg) process.env.PORT = portArg;
```

Place this before the `if (args.includes('--login'))` block so it applies to all modes.

Also update the startup log to reflect the actual port being used so users know where to connect.

**Effort estimate:** Small — 10 lines of code in `bin/cli.js`.

---

## Feature 07 — Auto-generate API key on first startup

**Status:** Implemented (`f3c8a18`)

**The problem:**

After a fresh install the user must:
1. Copy the generated password from the console
2. Open the browser, log in, reset the forced password
3. Navigate to Settings → API Keys → Generate API Key
4. Copy the key
5. Run `mcp-depot --login` (or manually edit the MCP client config)

Step 3-4 is a pure UX tax. The user already proved they have access to the machine (they can read the console). There is no security benefit to forcing them into the UI just to get a key they immediately need.

**The proposed solution:**

When the admin user is created for the first time in `server/src/config/database.js`, also generate an API key and print it in the same startup block alongside the password:

```
===========================================
DEFAULT ADMIN USER CREATED
===========================================
Email:   admin@mcpdepot.io
Password: REDACTED
API Key:  mcp_a3f8c2e1d4b7...
===========================================
IMPORTANT: Change this password after first login!
Use the API Key above for MCP client config or mcp-depot --login.
===========================================
```

**Implementation — `server/src/config/database.js`**, in the block that creates the admin user:

```js
// After creating adminUser, before logging credentials:
const apiKey = adminUser.generateApiKey();
adminUser.apiKeyEnabled = true;
await adminUser.save();

// Add to the logger.info block:
logger.info(`API Key:  ${apiKey}`);
```

`generateApiKey()` already exists on the User model — it sets `this.apiKey` and returns the plaintext key. The only addition is enabling it (`apiKeyEnabled = true`) and persisting the save.

**Why this is safe:**

- The key is only printed once, at first startup, to the local console — the same place the password already appears.
- Anyone who can read the console already has enough access to reset the admin password, so exposing an API key to the same audience adds no new attack surface.
- The key can be revoked or regenerated at any time via Settings.

**Effort estimate:** Very small — 3 lines of code in `database.js`, 1 extra `logger.info` line.

---

## Feature 08 — Daemon mode: run MCP Depot as a background process

**Status:** Proposed

**The problem:**

Running `mcp-depot` occupies a terminal for as long as the server is up. Users who
want MCP Depot available permanently — at login, in the background, with no terminal
open — currently have to reach for external tools like `pm2`, `nohup`, or a manual
`systemd` unit. None of these are documented, and on Windows they require separate
installs (`pm2` or Windows Service wrappers).

The server is typically "always-on" infrastructure, not a foreground command, yet it
ships with no built-in way to express that.

**The proposed solution:**

Add three new `bin/cli.js` flags that turn MCP Depot into a self-managed daemon:

| Flag | Action |
|------|--------|
| `mcp-depot --daemon` | Fork the server into the background, write a PID file, redirect output to a log file, return the user to their shell |
| `mcp-depot --stop` | Read the PID file, send `SIGTERM` to the process, remove the PID file |
| `mcp-depot --status` | Check whether the PID in the PID file is still alive; print running/stopped + uptime |

Files managed by the daemon:

| File | Purpose |
|------|---------|
| `~/.mcp-depot/mcp-depot.pid` | PID of the running daemon |
| `~/.mcp-depot/mcp-depot.log` | stdout + stderr from the server (appended, not rotated) |

**Implementation — `bin/cli.js`:**

```js
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const { spawn } = require('child_process')

const DATA_DIR  = path.join(os.homedir(), '.mcp-depot')
const PID_FILE  = path.join(DATA_DIR, 'mcp-depot.pid')
const LOG_FILE  = path.join(DATA_DIR, 'mcp-depot.log')

function daemonStart() {
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'))
    try { process.kill(pid, 0); console.log(`Already running (PID ${pid})`); return } catch {}
    fs.unlinkSync(PID_FILE) // stale PID — clean up
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const out = fs.openSync(LOG_FILE, 'a')
  const proc = spawn(process.execPath, [__filename, '--server'], {
    detached: true,
    stdio: ['ignore', out, out]
  })
  proc.unref()
  fs.writeFileSync(PID_FILE, String(proc.pid))
  console.log(`MCP Depot started (PID ${proc.pid}) — logs: ${LOG_FILE}`)
}

function daemonStop() {
  if (!fs.existsSync(PID_FILE)) { console.log('Not running'); return }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'))
  try {
    process.kill(pid, 'SIGTERM')
    fs.unlinkSync(PID_FILE)
    console.log(`Stopped (PID ${pid})`)
  } catch { console.log('Process not found — removing stale PID file'); fs.unlinkSync(PID_FILE) }
}

function daemonStatus() {
  if (!fs.existsSync(PID_FILE)) { console.log('Status: stopped'); return }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'))
  try { process.kill(pid, 0); console.log(`Status: running (PID ${pid})`) }
  catch { console.log(`Status: stopped (stale PID ${pid})`); fs.unlinkSync(PID_FILE) }
}
```

Then in the arg-parsing block:

```js
if (args.includes('--daemon')) { daemonStart(); return }
if (args.includes('--stop'))   { daemonStop();  return }
if (args.includes('--status')) { daemonStatus(); return }
```

**Cross-platform behaviour:**

| Platform | How it works |
|----------|-------------|
| macOS / Linux | `spawn` with `detached: true` + `proc.unref()` is native and reliable. The process survives terminal close. |
| Windows | `detached: true` works on Windows too — Node.js spawns a new process group. `SIGTERM` is replaced by `process.kill(pid)` which sends the Windows equivalent. |

**Why not recommend `pm2`?**

`pm2` is an excellent tool but it is a separate install with its own mental model,
config files, and ecosystem. For a self-hosted tool that ships as a single npm package,
requiring users to install a second process manager to achieve a basic "run in
background" UX is friction that should not exist. The daemon flags keep everything
inside `mcp-depot` itself.

**Nice-to-have (not in scope for first version):**

- `mcp-depot --daemon --restart-on-crash`: wrap the server in a simple retry loop before forking
- Log rotation: cap `mcp-depot.log` at 10 MB, keep one `.1` backup
- `--install-service`: register as a `launchd` plist (macOS) or `systemd` unit (Linux) for start-at-login behaviour

**Effort estimate:** Small — ~80 lines of code in `bin/cli.js`, no new dependencies.

---

## Feature 09 — Built-in integration UX: lock indicators, disable instead of delete, guided extension

**Status:** Implemented

**The problem:**

Built-in integrations ("MCP Depot" and "MCP Depot Sessions") have two silent
restrictions that produce confusing UX:

1. **Can't be deleted** — the Delete button either errors or is absent with no
   explanation. Users don't know why.
2. **Can't have tools added to them** — "Add Tool" is blocked or absent. Users
   who want to add a tool think they're missing something and try again.

Neither restriction is explained in the UI. Users hit a wall with no guidance.

The key insight that makes this tractable: **all integrations share the same single
MCP connection**. From Claude's perspective, a tool added to a custom integration
named "My Tools" is indistinguishable from one in "MCP Depot". So the restriction
on adding tools to built-ins is not a capability gap — it is a UX clarity gap.
Users who want to add a custom tool just need to be pointed toward creating a new
integration instead of looking for an "Add" button that isn't there.

**The proposed solution — three changes:**

### Change 1 — Visual lock indicator on built-in integrations

Add a "System" badge to the integration card and list row for any integration with
`isBuiltIn: true` (or equivalent flag):

```
┌─────────────────────────────────┐
│ [plug icon]  MCP Depot   SYSTEM │
│ 5 tools · enabled               │
└─────────────────────────────────┘
```

The badge should be visually distinct from user-created integrations — a muted
colour (not accent) to signal "read-only" rather than "special feature". A lock
icon alongside the badge reinforces the intent.

### Change 2 — Replace Delete with Disable/Enable for built-ins

Built-in integrations should never be deletable — they are re-seeded at startup
anyway, so deleting them only produces confusion when they reappear.

Replace the Delete button on built-in integrations with a **Disable/Enable toggle**:

| State | Button label | Effect |
|-------|-------------|--------|
| Enabled | Disable | Hides all tools of this integration from MCP (`/mcp/tools` response). Tools are not deleted — just not served. |
| Disabled | Enable | Restores the tools to the MCP response. |

This satisfies the Feature 03 requirement for MCP Depot Sessions (users who do not
want 8 extra session tools cluttering Claude's tool list can just disable the
integration). It also gives users who want a "clean" MCP Depot a path to hide the
built-in tools temporarily without losing them.

Implementation: add an `enabled` boolean column to the Integration model (already
likely present for user integrations). The `/mcp/tools` route filters out disabled
integrations. The toggle calls `PATCH /integrations/:id` with `{ enabled: false }`.

### Change 3 — Replace "Add Tool" with an explanatory prompt + shortcut

On built-in integrations, instead of a disabled or absent "Add Tool" button, show
an inline note:

> "Built-in tools are managed by MCP Depot and cannot be edited.
>  To add your own tools, [Create a new integration →]"

The link opens the new-integration dialog pre-filled with nothing (a fresh start).
This turns a wall into a signpost.

**What does NOT change:**

- Built-in tools remain uneditable and undeletable — this is correct. Showing them
  in a read-only list with a lock icon on each row is sufficient.
- The underlying seeding logic is untouched — built-ins are still re-created on
  startup if missing.
- User-created integrations are unaffected.

**Why not allow adding custom tools directly to built-in integrations?**

Tempting, but it creates a maintenance problem: if MCP Depot adds or renames a
built-in tool in a future version, the update code has to be careful not to delete
user-added tools in the same integration. Keeping built-ins locked eliminates that
class of upgrade bug entirely. Since all integrations share one MCP connection, a
custom integration is a complete equivalent — there is no functional reason to mix
user tools with system tools.

**Effort estimate:** Small — UI badge (CSS + flag check), disable toggle (one DB
column + one route handler), and replacing a missing button with an explanatory
message. No new pages needed.

---

## Feature 10 — Warn when installed locally instead of globally

**Status:** Proposed

**The problem:**

`mcp-depot` is a CLI tool meant to be installed globally (`npm install -g mcp-depot`).
If a user installs it locally (`npm install mcp-depot`) it still technically runs,
but the `mcp-depot` command will not be available on PATH and the experience breaks
in subtle ways. npm's `preferGlobal` flag (added to `package.json`) is deprecated
and silently ignored by modern npm — it provides no runtime protection.

**The proposed solution:**

Add a runtime check at the top of `bin/cli.js` that detects a local install and
prints a clear warning before continuing:

```js
// Warn if not installed globally
const isGlobal = process.env.npm_config_global === 'true' ||
  !__dirname.includes('node_modules');
if (!isGlobal) {
  console.warn('\x1b[33mWarning: mcp-depot is designed to be installed globally.\x1b[0m');
  console.warn('\x1b[33mRun: npm install -g mcp-depot\x1b[0m\n');
}
```

This does not block execution — it warns and continues — so it does not break
`npx mcp-depot` or any other invocation path. The yellow ANSI colour makes it
visible without being alarming.

**Effort estimate:** 5 lines in `bin/cli.js`.

---

## Feature 11 — Session Contexts UI: edit TTL and shared flag inline

**Status:** Proposed

**The problem:**

The only way to change the TTL of an existing session context is to ask Claude to call
`store-session-context` again with a new `ttlHours` value (which upserts the row).
There is no way to do it from the UI. A user who wants to extend a context from 7 days
to 30 days, or pin it permanently, must either go through Claude or wait for it to expire
and re-create it.

The `shared` flag has the same gap — Feature 01's implementation notes describe a share
toggle in the UI, but currently only Claude can set it via the `shared` parameter on
`store-session-context`.

**The proposed solution:**

Add two inline controls to each context row in the Session Contexts list view:

| Control | Action |
|---------|--------|
| **TTL dropdown / input** | Let the owner change the TTL: preset options (1 day, 7 days, 30 days, 90 days) plus a "Pin permanently" option (sets `ttlHours = 0`). Saves via `PATCH /api/mcp/session-contexts/:name` with `{ ttlHours }`. |
| **Shared toggle** | Switch already implied by Feature 01 but not explicitly tracked. Saves via `PATCH /api/mcp/session-contexts/:name` with `{ shared }`. |

Both controls are owner-only. Non-owners see the current values read-only (expiry countdown, shared badge).

**API requirement:**

The `PATCH /api/mcp/session-contexts/:name` route (or equivalent) must accept partial updates:
```json
{ "ttlHours": 720 }   // extend to 30 days
{ "ttlHours": 0 }     // pin permanently (server stores NULL)
{ "shared": true }    // share with all users
```

Only the owner can call this. Returns 403 for non-owners, 404 if not found.

**UI placement:**

In the existing Contexts table row (owner view only):

```
Name          Content preview   Shared   Expires           Actions
bitbucket-debug  "Found that..."  [ ] Off  in 4 days [▼]   [Delete]
                                                      ^ TTL dropdown appears on click
```

On click/focus the TTL cell shows a `<select>` with presets + a "Pin permanently" option.
The shared cell is already a toggle (Feature 01 spec). Both save on change with a brief
"Saved" confirmation - no modal needed.

**Why this is worth building:**

- Contexts accumulate. A user who stores 10 contexts over a week will want to extend
  the ones worth keeping and let the rest expire. Doing this through Claude ("update
  bitbucket-debug to expire in 30 days") works but adds unnecessary friction for a
  simple housekeeping task.
- Pinning permanently is especially useful for reference contexts (team conventions,
  API endpoint lists, project structure) that should not expire. No Claude session
  needed to extend them repeatedly.
- The `PATCH` route is simple to add and re-uses existing model update logic.

**Effort estimate:** Small - one new `PATCH` route, one Sequelize `update()` call, and
two inline controls in `SessionContexts.jsx`.

---

## Feature 12 — Render markdown in Session Contexts and Skills UI

**Status:** Proposed

**The problem:**

Session context content and skill prompts are written in markdown - Claude produces
markdown summaries, bullet lists, headings, code blocks, and tables. Both views
currently render content inside a `<pre>` tag which shows raw markdown source as
plain text. Users see literal `##`, `**bold**`, ` ``` `, `| col |` instead of
formatted output.

**Affected locations:**

| File | Line | What is displayed |
|------|------|-------------------|
| `client/src/pages/SessionContexts.jsx` | 163 | `<pre>{selected.content}</pre>` — context content in the detail modal |
| `client/src/pages/Skills.jsx` | 211 | `<pre style="...">` — skill prompt/output preview panel |

**The proposed solution:**

Create a shared `MarkdownRenderer` component using `react-markdown` +
`remark-gfm`. Use per-element component overrides (not just a CSS class) to
precisely control spacing, colour, and table layout. This is the same pattern used
in the Claude Code Session Manager Tauri app (`MarkdownContent.tsx`).

**Install:**
```bash
npm install react-markdown remark-gfm
```

`remark-gfm` is required for GitHub Flavored Markdown: tables, strikethrough, task
lists, and autolinks. Without it, `| col |` syntax renders as plain text.

**New file — `client/src/components/MarkdownRenderer.jsx`:**
```jsx
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownRenderer({ content, style }) {
  return (
    <div className="md-body" style={style}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
          h4: ({ children }) => <h4 className="md-h4">{children}</h4>,
          p:  ({ children }) => <p  className="md-p">{children}</p>,
          strong: ({ children }) => <strong className="md-strong">{children}</strong>,
          em:     ({ children }) => <em className="md-em">{children}</em>,
          code: ({ children, className: cls }) => {
            const isBlock = cls?.includes('language-');
            return isBlock
              ? <code className="md-code-block">{children}</code>
              : <code className="md-code-inline">{children}</code>;
          },
          // Passthrough — prevents double <pre><code> wrapping
          pre: ({ children }) => <>{children}</>,
          ul: ({ children }) => <ul className="md-ul">{children}</ul>,
          ol: ({ children }) => <ol className="md-ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{children}</li>,
          blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
          hr: () => <hr className="md-hr" />,
          a:  ({ children, href }) => (
            <a className="md-link" href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Table — wrapped in a div so it scrolls horizontally on narrow modals
          table:  ({ children }) => <div className="md-table-wrap"><table className="md-table">{children}</table></div>,
          thead:  ({ children }) => <thead className="md-thead">{children}</thead>,
          tbody:  ({ children }) => <tbody>{children}</tbody>,
          tr:     ({ children }) => <tr className="md-tr">{children}</tr>,
          th:     ({ children }) => <th className="md-th">{children}</th>,
          td:     ({ children }) => <td className="md-td">{children}</td>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
```

**CSS — add to global stylesheet (e.g. `index.css` or `App.css`):**
```css
/* ── Markdown renderer ───────────────────────────────────────── */
.md-body { font-size: 0.88rem; line-height: 1.7; color: var(--text-light); }

.md-h1 { font-size: 1.05rem; font-weight: 700; color: var(--text); margin: 1.1rem 0 0.45rem; padding-bottom: 0.35rem; border-bottom: 1px solid var(--border-light); }
.md-h2 { font-size: 0.95rem; font-weight: 700; color: var(--text); margin: 0.9rem 0 0.35rem; }
.md-h3 { font-size: 0.88rem; font-weight: 600; color: var(--text-secondary); margin: 0.75rem 0 0.3rem; }
.md-h4 { font-size: 0.85rem; font-weight: 600; color: var(--text-dim); margin: 0.6rem 0 0.25rem; }

.md-p       { color: var(--text-light); margin: 0.35rem 0; }
.md-p:last-child { margin-bottom: 0; }
.md-strong  { color: var(--text); font-weight: 600; }
.md-em      { color: var(--text-secondary); font-style: italic; }

.md-code-inline {
  background: var(--surface-hover); color: var(--primary);
  font-family: monospace; font-size: 0.8rem;
  padding: 2px 6px; border-radius: 4px;
}
.md-code-block {
  display: block; background: var(--surface-hover);
  border: 1px solid var(--border-light); border-radius: 8px;
  padding: 0.7rem 1rem; font-family: monospace; font-size: 0.78rem;
  color: var(--text-secondary); white-space: pre-wrap; overflow-x: auto;
  margin: 0.6rem 0;
}

.md-ul { list-style: disc;    padding-left: 1.25rem; margin: 0.3rem 0; }
.md-ol { list-style: decimal; padding-left: 1.25rem; margin: 0.3rem 0; }
.md-li { color: var(--text-light); margin: 0.15rem 0; }

.md-blockquote {
  border-left: 3px solid var(--primary); padding-left: 0.75rem;
  margin: 0.5rem 0; color: var(--text-dim); font-style: italic;
}
.md-hr { border: none; border-top: 1px solid var(--border-light); margin: 0.8rem 0; }
.md-link { color: var(--primary); text-decoration: none; }
.md-link:hover { text-decoration: underline; }

/* Tables */
.md-table-wrap { overflow-x: auto; margin: 0.6rem 0; }
.md-table      { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
.md-thead      { background: var(--surface-hover); }
.md-th {
  border: 1px solid var(--border-light); padding: 0.35rem 0.7rem;
  text-align: left; font-weight: 600; color: var(--text); white-space: nowrap;
}
.md-td {
  border: 1px solid var(--border-light); padding: 0.35rem 0.7rem;
  color: var(--text-light);
}
.md-tr:nth-child(even) .md-td { background: var(--surface-hover); }
```

**`SessionContexts.jsx` — replace the content `<pre>` (line 163):**
```jsx
import MarkdownRenderer from '../components/MarkdownRenderer';

// Before
<pre>{selected.content}</pre>

// After
<MarkdownRenderer
  content={selected.content}
  style={{ padding: '0.25rem 0', maxHeight: '60vh', overflowY: 'auto' }}
/>
```

**`Skills.jsx` — replace the prompt preview `<pre>` (line 211):**
```jsx
import MarkdownRenderer from '../components/MarkdownRenderer';

// Before
<pre style={{ padding: '1rem', background: 'var(--surface-hover)', ... }}>
  {selectedSkill.prompt}
</pre>

// After — only render as markdown when outputFormat is 'markdown'
{selectedSkill.outputFormat === 'markdown'
  ? <MarkdownRenderer
      content={selectedSkill.prompt}
      style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto' }}
    />
  : <pre style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', maxHeight: '300px', overflow: 'auto', fontSize: '0.85rem' }}>
      {selectedSkill.prompt}
    </pre>
}
```

**Key design decisions:**

- **`pre` passthrough** (`pre: ({ children }) => <>{children}</>`) — without this,
  fenced code blocks render as `<pre><pre><code>` (double-wrapped), causing wrong
  padding and background. The passthrough lets the `code` override handle it directly.
- **`remark-gfm` is non-optional** — without it, markdown tables render as `| col |`
  plain text. Session contexts frequently contain comparison tables.
- **Per-element overrides, not a CSS class** — avoids CSS specificity conflicts with
  the existing modal and card styles. Each element is independently controlled.
- **Session contexts: always markdown.** Claude always writes formatted content.
- **Skills: only markdown when `outputFormat === 'markdown'`.** Text/template skills
  contain `{{variable}}` substitution syntax that should not be parsed as markdown.
- **Table scroll wrapper** — the `md-table-wrap` div allows tables wider than the
  modal to scroll horizontally instead of overflowing or wrapping badly.

**Effort estimate:** Very small - `npm install` (2 packages), one new component file,
a CSS block, and two import+JSX swaps in existing pages. No API or DB changes.

---

## Feature 13 — Agent Personas: named system prompt roles for any MCP client

**Status:** Proposed

**Design principle:** MCP Depot is client-agnostic. This feature must work equally for Claude Code, Cursor, opencode, Windsurf, and any other MCP-compatible client. It stores no client-specific config — only a system prompt and metadata that any AI assistant can use.

**The problem:**

Teams define specialised AI personas for recurring tasks — Security Reviewer, Code Reviewer, Documentation Writer, Incident Responder. Each persona is a carefully tuned system prompt. Today these live scattered across team members' local configs, project docs, or static GitHub repos like `gstack` and `awesome-claude-code-subagents`. There is no shared, live, team-managed store — no way to update a persona centrally and have every developer's next session pick it up.

**The proposed solution:**

Add an `AgentPersona` resource to MCP Depot. Each persona is a named system prompt that any MCP client can retrieve and apply to the current session or a subagent.

| Field | Description |
|-------|-------------|
| `name` | Role key, e.g. `"security-reviewer"` |
| `role` | Short display label, e.g. `"Security Reviewer"` |
| `systemPrompt` | Full system prompt for this persona |
| `description` | One-line summary of what this persona does |
| `isShared` | Private (owner only) or visible to all team members |

**MCP tools:**

| Tool | Description |
|------|-------------|
| `list-personas()` | List available agent personas |
| `get-persona(name)` | Retrieve the system prompt and metadata for a named persona |
| `store-persona(name, role, systemPrompt, description, shared?)` | Save or update a persona |

**Usage — works the same from any MCP client:**

```
User: "Review this PR for security issues using the security-reviewer persona"
AI:   calls get-persona('security-reviewer')
AI:   applies the returned system prompt to itself or a subagent/agent task
```

Whether the client is Claude Code spawning a Task(), Cursor priming an agent, or opencode launching a role-based session — the persona is retrieved identically. The client decides how to apply the system prompt; MCP Depot just stores and serves it.

**Schema:**

```sql
CREATE TABLE AgentPersona (
  id           UUID PRIMARY KEY,
  name         VARCHAR(255) UNIQUE NOT NULL,
  role         VARCHAR(100) NOT NULL,
  systemPrompt TEXT NOT NULL,
  description  TEXT,
  isShared     BOOLEAN NOT NULL DEFAULT FALSE,
  createdBy    UUID REFERENCES Users(id) ON DELETE SET NULL,
  createdAt    DATETIME,
  updatedAt    DATETIME
);
```

**Effort estimate:** Small — same model/route/MCP tool pattern as Skills and Contexts. New model, 4 REST routes, 3 MCP tools, a Personas page in the UI reusing the Skills page layout.

---

## Feature 15 — Helm chart: deploy MCP Depot to Kubernetes

**Status:** Proposed

**Why Helm over raw manifests:**

MCP Depot has three moving parts (server, client/nginx, PostgreSQL), two deployment targets (local k8s, cloud), and will be self-hosted by teams who want a `helm install` story rather than a multi-step YAML editing exercise. Helm gives:

- **Single values override per environment** — local cluster, staging, and prod differ only in `values.yaml`; the templates are identical
- **Toggleable components** — `postgres.enabled: false` removes the in-cluster DB when pointing at an external managed instance, no YAML surgery needed
- **Safe upgrades** — `helm upgrade` + `helm rollback` vs `kubectl apply` on modified files with no diff history
- **Publishable** — `helm install mcp-depot oci://ghcr.io/...` is a one-liner for any user with a k8s cluster; no git clone needed

---

**Chart layout:**

```
helm/mcp-depot/
├── Chart.yaml
├── values.yaml                   # defaults, all overridable
├── templates/
│   ├── _helpers.tpl              # name/label helpers
│   ├── configmap.yaml            # non-sensitive env vars
│   ├── secret.yaml               # jwtSecret, sessionSecret, db URL
│   ├── server-deployment.yaml
│   ├── server-service.yaml
│   ├── client-deployment.yaml
│   ├── client-service.yaml
│   ├── ingress.yaml
│   ├── postgres-statefulset.yaml # only rendered when postgres.enabled=true
│   ├── postgres-service.yaml
│   ├── postgres-pvc.yaml
│   └── hpa.yaml                  # optional, server only
└── .helmignore
```

---

**`values.yaml` — full default shape:**

```yaml
# ── Images ────────────────────────────────────────────────────────
server:
  image:
    repository: ghcr.io/your-org/mcp-depot-server
    tag: latest
    pullPolicy: IfNotPresent
  replicas: 1
  port: 3000
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
  env:
    NODE_ENV: production
    LOG_LEVEL: info

client:
  image:
    repository: ghcr.io/your-org/mcp-depot-client
    tag: latest
    pullPolicy: IfNotPresent
  replicas: 1
  port: 80
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi

# ── Database ──────────────────────────────────────────────────────
postgres:
  enabled: true                # set false to use externalDatabase
  image: postgres:17
  port: 5432
  database: mcpconnect
  user: admin
  password: changeme           # override at install time via --set or secretRef
  storage: 5Gi
  storageClass: ""             # leave blank for cluster default

externalDatabase:
  url: ""                      # postgres://user:pass@host:5432/db
                               # used only when postgres.enabled=false

# ── Secrets ───────────────────────────────────────────────────────
secrets:
  jwtSecret: ""                # required — set via --set secrets.jwtSecret=...
  sessionSecret: ""            # required — set via --set secrets.sessionSecret=...
  existingSecret: ""           # set to an existing k8s Secret name to skip creation
                               # secret must have keys: jwt-secret, session-secret, database-url

# ── Ingress ───────────────────────────────────────────────────────
ingress:
  enabled: true
  className: nginx             # or traefik, etc.
  host: mcp-depot.local        # override with your domain
  tls:
    enabled: false
    secretName: mcp-depot-tls  # name of TLS secret if tls.enabled=true
  annotations: {}              # e.g. cert-manager.io/cluster-issuer: letsencrypt

# ── Autoscaling ───────────────────────────────────────────────────
autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 4
  targetCPUUtilizationPercentage: 70

# ── Service accounts / RBAC ───────────────────────────────────────
serviceAccount:
  create: false
  name: ""
```

---

**Key templates:**

**`ingress.yaml`** — routes `/api/` to the server service and `/*` to the client service:

```yaml
spec:
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /api/
            pathType: Prefix
            backend:
              service:
                name: {{ include "mcp-depot.fullname" . }}-server
                port:
                  number: {{ .Values.server.port }}
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "mcp-depot.fullname" . }}-client
                port:
                  number: {{ .Values.client.port }}
```

**`secret.yaml`** — only rendered when `secrets.existingSecret` is empty:

```yaml
{{- if not .Values.secrets.existingSecret }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "mcp-depot.fullname" . }}-secrets
type: Opaque
stringData:
  jwt-secret: {{ .Values.secrets.jwtSecret | required "secrets.jwtSecret is required" | quote }}
  session-secret: {{ .Values.secrets.sessionSecret | required "secrets.sessionSecret is required" | quote }}
  database-url: {{ include "mcp-depot.databaseUrl" . | quote }}
{{- end }}
```

**`_helpers.tpl`** — `databaseUrl` helper picks internal postgres or external:

```
{{- define "mcp-depot.databaseUrl" -}}
{{- if .Values.postgres.enabled -}}
postgres://{{ .Values.postgres.user }}:{{ .Values.postgres.password }}@{{ include "mcp-depot.fullname" . }}-postgres:{{ .Values.postgres.port }}/{{ .Values.postgres.database }}
{{- else -}}
{{ .Values.externalDatabase.url | required "externalDatabase.url is required when postgres.enabled=false" }}
{{- end -}}
{{- end }}
```

**`postgres-statefulset.yaml`** — only rendered when `postgres.enabled=true`:

```yaml
{{- if .Values.postgres.enabled }}
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "mcp-depot.fullname" . }}-postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {{ include "mcp-depot.fullname" . }}-postgres
  template:
    spec:
      containers:
        - name: postgres
          image: {{ .Values.postgres.image }}
          env:
            - name: POSTGRES_DB
              value: {{ .Values.postgres.database }}
            - name: POSTGRES_USER
              value: {{ .Values.postgres.user }}
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "mcp-depot.secretName" . }}
                  key: postgres-password
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: {{ .Values.postgres.storageClass | quote }}
        resources:
          requests:
            storage: {{ .Values.postgres.storage }}
{{- end }}
```

---

**Install commands:**

```sh
# Local k8s (home lab) — in-cluster postgres, no TLS
helm install mcp-depot ./helm/mcp-depot \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set secrets.sessionSecret="$(openssl rand -hex 32)" \
  --set ingress.host="mcp-depot.local"

# Production — external managed DB, TLS via cert-manager
helm install mcp-depot ./helm/mcp-depot \
  --set postgres.enabled=false \
  --set externalDatabase.url="postgres://admin:pass@db.example.com/mcpconnect" \
  --set secrets.jwtSecret="..." \
  --set secrets.sessionSecret="..." \
  --set ingress.host="mcp-depot.example.com" \
  --set ingress.tls.enabled=true \
  --set "ingress.annotations.cert-manager\.io/cluster-issuer=letsencrypt"

# Upgrade (e.g. bump image tag)
helm upgrade mcp-depot ./helm/mcp-depot --reuse-values \
  --set server.image.tag=v1.2.0 \
  --set client.image.tag=v1.2.0

# Rollback if something breaks
helm rollback mcp-depot 1
```

---

**Infisical integration (for secret injection):**

The cluster already runs Infisical (seen in docker ps). Instead of storing secrets in `values.yaml` or `--set` flags, use the Infisical Kubernetes operator to inject them directly into the pod environment:

```yaml
# In server-deployment.yaml — replace the secretKeyRef blocks with:
envFrom:
  - secretRef:
      name: mcp-depot-infisical-secrets   # synced by InfisicalSecret CRD
```

```yaml
# infisical-secret.yaml (add to templates/)
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: mcp-depot-infisical-secrets
spec:
  authentication:
    universalAuth:
      secretsScope:
        projectSlug: mcp-depot
        envSlug: prod
        secretsPath: "/"
      credentialsRef:
        secretName: infisical-universal-auth
        secretNamespace: default
  destination:
    secretName: mcp-depot-infisical-secrets
    secretNamespace: {{ .Release.Namespace }}
  resyncInterval: 60
```

This removes secrets from Helm values entirely and keeps them in Infisical where they already are.

---

**Publishing the chart:**

```sh
# Package
helm package helm/mcp-depot

# Push to GitHub Container Registry as OCI chart
helm push mcp-depot-*.tgz oci://ghcr.io/your-org/charts

# Users install with:
helm install mcp-depot oci://ghcr.io/your-org/charts/mcp-depot \
  --set secrets.jwtSecret=... \
  --set ingress.host=mcp-depot.local
```

Alternatively, host a `charts/` directory on GitHub Pages and add a `Chart.yaml` repo index — this is the classic `helm repo add` approach, slightly more visible for open-source discoverability.

---

**What does NOT need changing in the application:**

- No code changes in server or client — the chart only wraps the existing Docker images
- `DATABASE_URL` env var already controls which database the server connects to
- The nginx client image already exists in docker-compose and just needs its build context pointed at `client/`
- `NODE_ENV=production` already disables `sync({ alter: true })` and runs migrations safely

---

**Effort estimate:** Medium — ~300 lines of YAML across 12 template files, all mechanical. The tricky parts are the `databaseUrl` helper, the Infisical CRD template (optional), and testing the ingress path split. No application code changes needed.

---

## Feature 14 — CSM integration: Claude Session Manager as a MCP Depot browser

**Status:** Proposed

**Note:** This feature lives primarily in the Claude Session Manager codebase, not in MCP Depot. MCP Depot's only requirement is its existing REST API and the new `list-personas` tool from Feature 13. No hooks, CLAUDE.md snippets, or other Claude-specific resources are stored in MCP Depot — those are CSM's own concern, sourced from community GitHub repos.

**The problem:**

MCP Depot stores client-agnostic resources — Skills, Agent Personas, Session Contexts — but browsing and acting on them from a developer's local Claude Code setup requires opening the web UI, copying content, and manually placing files. Claude Code Session Manager already sits on the desktop managing local Claude state. There is no bridge.

**The proposed solution:**

Add a **Hub tab** to CSM that connects to a configured MCP Depot instance and surfaces MCP Depot's generic resources alongside CSM's own Claude-specific library.

**Hub tab — two sections:**

**Section A: MCP Depot resources** (requires MCP Depot URL + API key in CSM settings)

| Resource | Browse | Action |
|----------|--------|--------|
| Skills | ✓ | Install → writes `~/.claude/commands/<name>.md` |
| Agent Personas | ✓ | Install → writes `~/.claude/agents/<name>.md` (or copies system prompt) |
| Session Contexts (shared) | ✓ | Read-only markdown view |

**Section B: Claude-local resources** (no MCP Depot needed — sourced directly from community GitHub repos)

| Resource | Source | Action |
|----------|--------|--------|
| Community hooks | `everything-claude-code`, `claude-code-templates` GitHub repos | Install → merges into `~/.claude/settings.json` |
| CLAUDE.md snippets | `claude-code-best-practice`, `claude-code-templates` GitHub repos | Install → appends to project CLAUDE.md |
| Subagent definitions | `awesome-claude-code-subagents` GitHub repo | Install → writes `~/.claude/agents/<name>.md` |

Section B pulls from static community GitHub repos at browse time (cached locally). It requires no server — just HTTP GET to raw GitHub content. This keeps hooks and CLAUDE.md snippets entirely out of MCP Depot, which is correct: they are Claude-specific and meaningless to other MCP clients.

**CSM configuration addition:**

```
Settings → MCP Depot
  URL:     http://your-mcp-depot:3001
  API Key: mcp_xxxxxxxxxxxx
  [ Test connection ]
```

**Why this split is the right architecture:**

MCP Depot stays client-agnostic. Cursor users, opencode users, and any future MCP client can use Skills and Personas without ever seeing Claude-specific concepts. CSM handles the Claude-specific layer locally. The two products complement rather than entangle each other.

**Effort estimate:** Medium — new Hub tab in CSM (Tauri/React), config panel, HTTP client for MCP Depot REST API, GitHub raw content fetcher for community resources, file-write handlers for each install action.

---

## Feature 16 — AI-driven integration builder: create tools and integrations from chat

**Status:** Implemented

**The problem:**

Adding a new integration to MCP Depot today requires a developer to write a JSON descriptor, map endpoints, define Zod schemas, restart the server, and verify the tool appears in the client. This is an intentional, inspectable workflow — but it is too slow when experimenting, and inaccessible to users who are not comfortable with JSON or the MCP Depot source layout.

**The proposed solution:**

Expose a small set of **meta-tools** through MCP Depot itself. Claude (or any MCP client) can call these tools in a conversation to register new integrations and tools at runtime, without editing files manually.

**Meta-tools exposed by MCP Depot:**

| Tool name | What it does |
|-----------|-------------|
| `mcp_register_integration` | Persists a new integration descriptor to `integrations/` and hot-reloads the server |
| `mcp_register_tool` | Adds a single tool definition to an existing integration |
| `mcp_list_integrations` | Returns all registered integrations and their tool counts |
| `mcp_describe_tool` | Returns the full schema + last-call sample for a named tool |
| `mcp_remove_tool` | Removes a tool from an integration (with confirmation flag) |

**Example conversation flow:**

```
User:  "I want to add a tool that fetches open GitHub issues for a given repo."

Claude calls mcp_register_integration({
  name: "github",
  baseUrl: "https://api.github.com",
  authType: "bearer",
  authEnvVar: "GITHUB_TOKEN"
})

Claude calls mcp_register_tool({
  integration: "github",
  name: "list_open_issues",
  description: "List open issues for a GitHub repository",
  method: "GET",
  path: "/repos/{owner}/{repo}/issues",
  params: {
    owner: { type: "string", required: true },
    repo:  { type: "string", required: true },
    state: { type: "string", default: "open" }
  },
  responseFields: ["number", "title", "html_url", "labels"]
})

Claude: "Done. You can now call list_open_issues({ owner: 'anthropics', repo: 'anthropic-sdk-python' })"
```

**Implementation guide for developers:**

1. **Meta-tool registration** - Add `src/tools/meta/` alongside the existing `src/tools/` directory. Each meta-tool is a standard MCP tool handler registered at server startup unconditionally (not from an integration file).

2. **`mcp_register_integration` handler** (`src/tools/meta/registerIntegration.js`):
   - Validate the descriptor with a Zod schema matching the existing integration JSON format
   - Write to `integrations/<name>.json`
   - Call the existing `loadIntegrations()` / `reloadTools()` function used at startup - this avoids duplicating registration logic
   - Return `{ ok: true, toolsAdded: N }` so the AI can confirm

3. **`mcp_register_tool` handler** (`src/tools/meta/registerTool.js`):
   - Read the target integration file, push the new tool entry, write back
   - Call `reloadTools()` to make it live immediately
   - Validate against the same Zod schema used for integration loading so errors surface early

4. **Hot-reload hook** - Extract a `reloadTools(integrationName?)` function from `src/server.js` startup path. Call it after any meta-tool write. No process restart required — MCP tools are registered dynamically via `server.tool()` on the `McpServer` instance.

5. **Persistence** - Meta-tool writes go to the same `integrations/` directory used by static files. They survive restarts. Add a `"source": "ai-generated"` field to the descriptor so the UI and CLI can distinguish AI-created tools from hand-authored ones.

6. **Security** - Meta-tools should be protected by an API key check (same as the REST API). Add a `META_TOOLS_ENABLED=true` env flag defaulting to `false` so operators explicitly opt in. Expose a clear warning in the README: enabling meta-tools lets any connected MCP client modify your server's tool set.

7. **UI integration** - In the integrations list, show a robot icon next to AI-generated integrations. Allow editing them in the same JSON editor as hand-authored ones.

**Effort estimate:** Medium-High — ~400 lines across 5 new handler files, hot-reload extraction (~50 lines), Zod schema reuse, UI badge. The hardest part is making `reloadTools()` idempotent (remove old tool registrations before re-adding to avoid duplicates on the `McpServer` instance).

---

## Feature 17 — Response field filtering: reduce token usage per tool

**Status:** Implemented

**The problem:**

REST APIs return far more fields than an AI agent needs. A Jira issue response can be 200+ fields; only 5 are typically relevant to the agent's task. Every extra field wastes tokens in the LLM context window and increases latency. There is currently no way in MCP Depot to trim responses before they are returned to the client.

**The proposed solution:**

Add an optional `responseFields` array to any tool definition. When present, MCP Depot filters the API response to include only the listed fields before returning it to the MCP client.

**Integration descriptor addition:**

```json
{
  "name": "get_issue",
  "method": "GET",
  "path": "/rest/api/3/issue/{issueKey}",
  "responseFields": ["key", "fields.summary", "fields.status.name", "fields.assignee.displayName"]
}
```

Dot-notation paths (`fields.status.name`) allow drilling into nested objects. Arrays are handled by applying the filter to each element.

**Implementation guide for developers:**

1. **Field filter utility** (`src/utils/fieldFilter.js`):
   ```js
   export function filterFields(obj, paths) {
     if (!paths || paths.length === 0) return obj;
     const result = {};
     for (const path of paths) {
       const parts = path.split('.');
       let src = obj, dst = result;
       for (let i = 0; i < parts.length - 1; i++) {
         if (src == null) break;
         dst[parts[i]] ??= {};
         dst = dst[parts[i]];
         src = src?.[parts[i]];
       }
       const leaf = parts.at(-1);
       if (src != null && leaf in src) dst[leaf] = src[leaf];
     }
     return result;
   }
   ```

2. **Apply in tool executor** (`src/executor/httpExecutor.js`) - after receiving the API response and before returning to the MCP caller, call `filterFields(responseBody, tool.responseFields)`.

3. **Array responses** - If the root response is an array, map `filterFields` over each element.

4. **UI support** - In the tool detail editor, add a "Response fields" tag input. Show a live preview using the last cached response sample (if available from Feature 19 analytics).

5. **Validation** - On server startup, warn (but do not error) if a `responseFields` path does not exist in the schema's example response. This catches typos early without blocking startup.

**Effort estimate:** Small — ~80 lines for the filter utility, ~20 lines in the executor, UI tag input. High value-to-effort ratio.

---

## Feature 18 — Integration health dashboard

**Status:** Implemented

**The problem:**

When MCP Depot is running with 10+ integrations, there is no quick way to see which are healthy (API reachable, auth working) and which are broken (expired token, service down). Failures are only discovered when a tool is actually called and returns an error.

**The proposed solution:**

Add a health-check endpoint and a dashboard panel that pings each integration's base URL with a lightweight probe request, reports status, and shows when each was last checked.

**REST API addition:**

```
GET /api/health
```

Response:
```json
{
  "integrations": [
    { "name": "jira", "status": "ok", "latencyMs": 142, "checkedAt": "2026-04-30T09:00:00Z" },
    { "name": "github", "status": "error", "error": "401 Unauthorized", "checkedAt": "2026-04-30T09:00:05Z" }
  ]
}
```

**Implementation guide for developers:**

1. **Probe strategy** - Each integration descriptor can define an optional `healthPath` (e.g. `"/rest/api/3/myself"` for Jira). If omitted, the prober does a `HEAD` request to the `baseUrl` root. Use a 5-second timeout.

2. **Health checker** (`src/health/checker.js`):
   - Expose `checkIntegration(integration)` → `{ status, latencyMs, error? }`
   - Expose `checkAll()` → runs all checks concurrently with `Promise.allSettled`
   - Cache results in memory; refresh every 60 seconds via `setInterval`

3. **REST route** (`src/routes/health.js`) - Return cached results immediately (do not block on live pings per request).

4. **UI panel** - Add a "Health" tab or sidebar widget. Green dot = ok, red dot = error, grey = never checked. Show latency badge. Add a "Re-check now" button that calls `POST /api/health/refresh`.

5. **Auth probing** - Pass the integration's configured auth header in the probe request. A `401` response flags an expired or missing token specifically, not just a network issue.

**Effort estimate:** Small-Medium — ~150 lines for checker + route, ~100 lines UI. The main subtlety is avoiding false positives when the `healthPath` requires a specific resource (use a known-good lightweight endpoint per integration type, documented in the descriptor spec).

---

## Feature 19 — Tool usage analytics UI

**Status:** Proposed

**The problem:**

MCP Depot already captures `ToolCall` records (call timestamp, tool name, duration, status) but this data is only accessible via the raw SQLite database. There is no way to see which tools are used most, which are failing, or what the average response time is without writing SQL queries manually.

**The proposed solution:**

Add an Analytics tab to the MCP Depot UI that surfaces the existing `ToolCall` data as visual summaries.

**Metrics to surface:**

| Metric | Chart type |
|--------|-----------|
| Calls per tool (last 7 days) | Horizontal bar chart |
| Success vs error rate per tool | Stacked bar |
| Average latency per tool | Sortable table |
| Call volume over time | Sparkline per integration |
| Last-called timestamp | Table column alongside tool list |

**Implementation guide for developers:**

1. **Analytics query module** (`src/db/analytics.js`):
   ```js
   export function getToolCallSummary(db, days = 7) {
     const since = Date.now() - days * 86400000;
     return db.prepare(`
       SELECT toolName, COUNT(*) as calls,
              AVG(durationMs) as avgMs,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
              MAX(calledAt) as lastCall
       FROM ToolCalls WHERE calledAt > ?
       GROUP BY toolName ORDER BY calls DESC
     `).all(since);
   }
   ```

2. **REST route** - `GET /api/analytics?days=7` returns the summary JSON. Add a `GET /api/analytics/timeline` for the sparkline time-series data.

3. **Frontend charts** - Use a zero-dependency SVG approach (draw `<rect>` elements directly) to avoid adding a charting library dependency. Keep the bundle size small. The existing UI uses vanilla JS — follow the same pattern.

4. **Retention policy** - Add a `ANALYTICS_RETENTION_DAYS=30` env var. On startup, run `DELETE FROM ToolCalls WHERE calledAt < ?` with the cutoff. Prevents unbounded DB growth.

5. **Export** - Add a "Download CSV" button that calls `GET /api/analytics/export?format=csv`. Useful for sharing usage data with a team.

**Effort estimate:** Small-Medium — queries are trivial, the work is the SVG chart rendering (~150 lines) and the REST routes (~80 lines).

---

## Feature 20 — MCP marketplace browser: one-click import from the official registry

**Status:** Proposed

**The problem:**

The official MCP registry (`modelcontextprotocol.io/registry` and the `mcp-get` CLI) lists hundreds of community MCP servers, but discovering and connecting to them requires reading docs, finding base URLs, and writing integration descriptors by hand. There is no way to browse and import them from within MCP Depot.

**The proposed solution:**

Add a **Marketplace** tab to the MCP Depot UI that fetches the public MCP registry index, lets users browse and search servers, and generates an integration descriptor stub with a single click.

**User flow:**

1. Open Marketplace tab → MCP Depot fetches `https://registry.mcp.so/api/servers` (or equivalent public index)
2. User searches "linear" → sees Linear MCP server card with description, author, tool count
3. User clicks "Import" → MCP Depot generates a stub `integrations/linear.json` with `baseUrl`, `authType`, and empty `tools: []`
4. User fills in their API key in Settings → tools are now available for the AI to call

**Implementation guide for developers:**

1. **Registry client** (`src/marketplace/registryClient.js`) - Fetch and cache the registry index with a 1-hour TTL. Handle pagination. Normalise across registry formats (the official spec is still evolving — write an adapter layer).

2. **Stub generator** (`src/marketplace/stubGenerator.js`) - Map registry metadata to the MCP Depot integration descriptor format. If the registry entry includes an OpenAPI spec URL, fetch it and auto-populate the `tools` array using the existing OpenAPI importer (Feature from the original roadmap). If not, generate an empty descriptor with a `// TODO: add tools` comment.

3. **UI tab** - Search input, card grid (name, description, tool count badge, "Import" button). Show an "Already imported" badge if an integration with the same name already exists in `integrations/`.

4. **Privacy note** - The registry fetch goes from the MCP Depot server, not the user's browser. Add a `MARKETPLACE_ENABLED=true` env flag (default `true`) so air-gapped deployments can disable it.

5. **Offline fallback** - Bundle a static snapshot of the top-50 registry entries as `src/marketplace/registry-snapshot.json`. Use this as fallback when the live fetch fails.

**Effort estimate:** Medium — registry client + adapter (~150 lines), stub generator (~100 lines), UI tab (~200 lines). Main uncertainty is registry API stability.

---

## Feature 21 — CLI management tool

**Status:** Implemented

**The problem:**

Managing MCP Depot integrations and tools today requires using the web UI or editing JSON files directly. For CI/CD pipelines, scripted environments, or developers who prefer terminal workflows, there is no programmatic interface.

**The proposed solution:**

Add an `mcphub` CLI binary that talks to the MCP Depot REST API and covers the most common management tasks.

**Commands:**

```
mcphub integrations list
mcphub integrations add  --name github --base-url https://api.github.com --auth bearer --env GITHUB_TOKEN
mcphub integrations remove <name>

mcphub tools list [--integration <name>]
mcphub tools add  --integration github --name list_repos --method GET --path /user/repos
mcphub tools remove <integration> <tool>

mcphub health
mcphub analytics [--days 7]

mcphub import openapi <url-or-file> --integration <name>
```

**Implementation guide for developers:**

1. **Package** - Add `cli/` at the repo root. Use `commander` (already a common dep) or write a minimal arg parser to avoid new dependencies. Publish as `mcphub` binary via `"bin": { "mcphub": "./cli/index.js" }` in `package.json`.

2. **API client** - The CLI calls the same REST API as the UI. Read `MCPHUB_URL` and `MCPHUB_API_KEY` from environment variables (with `--url` / `--key` flags as overrides). Store them in `~/.mcphub/config.json` after first `mcphub login`.

3. **Output modes** - Default to human-readable table output. Add `--json` flag for machine-readable output (pipe-friendly). Use `--quiet` to suppress all output except errors (for CI use).

4. **`mcphub import openapi`** - Fetch the spec, call the existing OpenAPI importer logic, write the resulting integration file, and reload the server via `POST /api/reload`. This is the killer CLI feature: `mcphub import openapi https://petstore.swagger.io/v2/swagger.json --integration petstore` creates a fully-populated integration in one command.

5. **Tab completion** - Generate a `mcphub completion bash` / `mcphub completion zsh` command that outputs a completion script. Integration and tool names are fetched from the live API.

**Effort estimate:** Medium — ~400 lines for the CLI itself, ~50 lines adding the `reload` REST route. The OpenAPI importer reuse is the highest-value part.

---

## Feature 22 — Composite tool builder UI

**Status:** Proposed

**The problem:**

MCP Depot already has `compositeExecutor.js` which can chain multiple tool calls into a single composite tool. But creating a composite tool requires writing the chain definition as JSON by hand. There is no visual editor.

**The proposed solution:**

Add a **Composite tools** section to the MCP Depot UI with a visual step-builder where users can:
1. Pick a base tool as step 1
2. Map fields from step 1's response into step 2's input parameters
3. Chain up to 5 steps
4. Name the composite tool and save it

**Example composite: "get issue assignee email"**

```
Step 1: jira → get_issue(issueKey: $input.issueKey)
           ↓  response.fields.assignee.accountId
Step 2: jira → get_user(accountId: $step1.accountId)
           ↓  response.emailAddress
Output: { email: $step2.emailAddress }
```

**Implementation guide for developers:**

1. **Composite descriptor schema** - Already defined in `compositeExecutor.js`. Expose it as a Zod schema so the UI and API can validate against the same definition.

2. **REST endpoints** - `GET /api/composites`, `POST /api/composites`, `PUT /api/composites/:name`, `DELETE /api/composites/:name`. Persist composite definitions to `composites/` directory alongside `integrations/`.

3. **UI builder** - Step list with drag-to-reorder. Each step has:
   - Integration + tool dropdown (populated from live `/api/integrations`)
   - Parameter mapping: for each required param, a text input that accepts `$input.field` or `$stepN.field` syntax with autocomplete from prior steps' response schemas

4. **Response schema inference** - To enable autocomplete for `$stepN.field`, MCP Depot needs to know each tool's response shape. Extend the tool descriptor with an optional `responseSchema` object. If absent, fall back to the last-call sample from `ToolCalls` (Feature 19).

5. **Testing** - Add a "Run test" button in the builder that executes the composite with user-provided `$input` values and shows each step's output. This lets users verify the field mapping before saving.

**Effort estimate:** Medium-High — composite descriptor and REST API are straightforward (~200 lines). The visual builder with field mapping autocomplete is the hard part (~400 lines UI).

---

## Feature 23 — OIDC / SSO authentication

**Status:** Proposed

**The problem:**

MCP Depot's current authentication is a single shared API key. In a team environment, this means everyone uses the same credential, there is no per-user audit trail, and revoking one person's access requires rotating the key for everyone.

**The proposed solution:**

Add OIDC authentication as an alternative to the API key. When enabled, the MCP Depot UI redirects unauthenticated users to the configured identity provider (Google, GitHub, Okta, or any OIDC-compliant IdP). API calls from MCP clients continue to use API keys (one per user, issued after OIDC login).

**Configuration:**

```env
AUTH_MODE=oidc                     # 'apikey' (default) or 'oidc'
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:3001/auth/callback
OIDC_ALLOWED_DOMAINS=yourcompany.com   # optional domain allowlist
```

**Implementation guide for developers:**

1. **OIDC flow** - Use `openid-client` (well-maintained, handles discovery, PKCE, token refresh). Add routes: `GET /auth/login` (redirect to IdP), `GET /auth/callback` (exchange code for tokens, set session cookie), `GET /auth/logout`.

2. **Session management** - Use `express-session` with a SQLite store (add a `Sessions` table). Store the OIDC `sub` claim and email. Session cookie is HTTP-only, secure when behind HTTPS.

3. **Per-user API keys** - After first OIDC login, generate a user-scoped API key and persist it to a `UserApiKeys` table (`sub`, `keyHash`, `createdAt`, `lastUsedAt`). Show the key once in the UI ("Copy your API key"). This key is used for MCP client connections — OIDC session cookies are for UI only.

4. **Audit log** - Add `userId` (OIDC sub) to the `ToolCalls` table. Surface it in Feature 19 analytics filtered by user.

5. **Domain allowlist** - If `OIDC_ALLOWED_DOMAINS` is set, reject logins from other email domains after the OIDC callback. Return a 403 with a clear "Your email domain is not authorised" message.

6. **Graceful degradation** - When `AUTH_MODE=apikey` (the default), none of this code runs. Gate all OIDC routes and middleware behind the mode check so existing single-user deployments are unaffected.

**Effort estimate:** Medium-High — OIDC flow itself is ~150 lines with `openid-client`. Session store, user API key management, and audit logging add ~200 more. UI additions (user menu, API key display) ~100 lines.

---

## Feature 24 — Per-tool response caching with TTL

**Status:** Proposed

**The problem:**

Some tools are called repeatedly with the same arguments but return data that changes infrequently — for example, `list_projects` (Jira projects rarely change), `get_user_profile`, or `get_sprint_board`. Each call hits the upstream API unnecessarily, burning rate limits and adding latency.

**The proposed solution:**

Add an optional `cacheTtlSeconds` field to any tool definition. When set, MCP Depot caches the response keyed by `(toolName, serialisedArgs)` and returns the cached result for subsequent identical calls within the TTL window.

**Tool descriptor addition:**

```json
{
  "name": "list_projects",
  "method": "GET",
  "path": "/rest/api/3/project",
  "cacheTtlSeconds": 300
}
```

**Implementation guide for developers:**

1. **Cache store** - Use an in-memory `Map<string, { value, expiresAt }>`. A SQLite-backed cache is not needed for a TTL cache — on restart, the cache is cold anyway. Add a `CACHE_MAX_ENTRIES=500` env var and evict the oldest entry when the limit is reached (simple LRU using insertion order of `Map`).

2. **Cache key** - `SHA256(toolName + JSON.stringify(sortedArgs))` — sort args keys before serialising so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the same key.

3. **Cache interceptor** (`src/executor/cacheInterceptor.js`) - Wrap the HTTP executor. Before executing: check cache, return hit if valid. After executing: store in cache if `cacheTtlSeconds` is set.

4. **Cache invalidation** - Expose `POST /api/cache/invalidate` with optional `{ toolName }` body. With no body, clears all. Useful for the UI "Force refresh" button.

5. **Cache headers** - When returning a cached response, add `X-MCP-Cache: HIT` and `X-MCP-Cache-Age: <seconds>` to the MCP response metadata. Helps with debugging.

6. **UI indicator** - In the tool detail view, show "Cached (expires in Xs)" when the tool has an active cache entry. Add a "Clear cache" button.

**Effort estimate:** Small — ~100 lines for the cache store and interceptor. UI additions ~50 lines. Very high value-to-effort ratio for read-heavy integrations.

---

## Feature 25 — Webhook-triggered tools

**Status:** Proposed

**The problem:**

All MCP Depot tools are currently pull-based: the AI client asks, MCP Depot fetches. Some useful integrations are push-based: a CI build finishes, a PR is opened, a monitoring alert fires. There is no way to surface these events to an AI agent without the agent polling.

**The proposed solution:**

Add inbound webhook support. Each integration can define `webhookTools` — tools that are not HTTP-called by the AI, but are populated by an incoming HTTP POST from an external system. The AI can then call `get_pending_events` to consume the queue.

**Integration descriptor addition:**

```json
{
  "name": "github-webhooks",
  "webhookTools": [
    {
      "name": "pr_opened",
      "description": "Fires when a pull request is opened on any watched repo",
      "webhookPath": "/webhooks/github",
      "webhookSecret": "${GITHUB_WEBHOOK_SECRET}",
      "eventFilter": { "action": "opened", "pull_request": true },
      "payloadFields": ["pull_request.number", "pull_request.title", "pull_request.html_url", "repository.full_name"]
    }
  ]
}
```

**Tools exposed to the AI:**

| Tool | Description |
|------|-------------|
| `pr_opened_get_next` | Returns the next unconsumed `pr_opened` event from the queue |
| `pr_opened_peek_all` | Returns all unconsumed events without consuming them |
| `pr_opened_count` | Returns the number of pending events |

**Implementation guide for developers:**

1. **Webhook receiver** (`src/webhooks/receiver.js`) - Register `POST /webhooks/:integrationName/:toolName` at startup for each webhook tool. Validate HMAC signature using the `webhookSecret` (support SHA-256 for GitHub/GitLab standard). Apply `eventFilter` to skip irrelevant deliveries. Apply `payloadFields` filter (same utility as Feature 17) to store only needed fields.

2. **Event queue** - Persist events to a `WebhookEvents` SQLite table: `(id, integrationName, toolName, payload, receivedAt, consumedAt)`. `consumedAt = NULL` means pending.

3. **AI-facing tools** - At server startup, for each webhook tool, generate three tool handlers (`get_next`, `peek_all`, `count`) and register them on the `McpServer`. `get_next` marks the event consumed (`consumedAt = NOW()`) after returning it.

4. **Webhook endpoint authentication** - Support three patterns: HMAC secret (GitHub/GitLab), `Authorization: Bearer` token, or unauthenticated (for internal systems). Configurable per tool.

5. **Retention** - Auto-delete consumed events older than `WEBHOOK_RETENTION_HOURS=72`. Run cleanup on server startup and hourly via `setInterval`.

6. **UI** - Add a "Webhooks" tab showing live incoming events (SSE stream from `GET /api/webhooks/stream`), pending counts per tool, and the generated webhook URL to paste into GitHub/GitLab settings.

---

## Feature 26 — MCP tool annotations from HTTP semantics

**Status:** Implemented (`<commit-hash>`)

**Inspired by:** [rmcp-openapi](https://gitlab.com/lx-industries/rmcp-openapi) (Rust OpenAPI-to-MCP bridge)

**The problem:**

The MCP specification defines an `annotations` object on every tool with three hints: `readOnlyHint`, `destructiveHint`, and `idempotentHint`. These hints tell the MCP client — and the AI model — how risky a tool call is before it executes. Claude uses them to decide whether to ask for confirmation, and some clients use them to colour-code tools in their UI.

MCP Depot currently registers all tools with no annotations, so every tool looks equally risky to the client. A `GET /issues` call and a `DELETE /issue/{id}` call are indistinguishable from the AI's perspective.

**The proposed solution:**

At tool registration time, derive annotations automatically from the HTTP method defined in the tool descriptor. No configuration change required from the user.

**Mapping rules (aligned with RFC 9110 HTTP semantics):**

| HTTP method | `readOnlyHint` | `destructiveHint` | `idempotentHint` |
|-------------|---------------|------------------|-----------------|
| GET, HEAD   | `true`        | `false`          | `true`          |
| PUT, PATCH  | `false`       | `false`          | `true`          |
| DELETE      | `false`       | `true`           | `true`          |
| POST        | `false`       | `true`           | `false`         |

**Implementation guide for developers:**

1. **Annotation deriver** (`src/tools/annotations.js`):
   ```js
   export function deriveAnnotations(method) {
     const m = method.toUpperCase();
     return {
       readOnlyHint:    m === 'GET' || m === 'HEAD',
       destructiveHint: m === 'DELETE' || m === 'POST',
       idempotentHint:  m !== 'POST',
       openWorldHint:   true,   // always true — tool calls an external API
     };
   }
   ```

2. **Apply at registration** - In the tool registration path (`src/tools/toolRegistry.js` or wherever `server.tool()` is called), pass the derived annotations as the third argument:
   ```js
   server.tool(
     toolName,
     description,
     { annotations: deriveAnnotations(tool.method) },
     inputSchema,
     handler
   );
   ```

3. **Allow override** - Let the tool descriptor include an explicit `annotations` object that takes precedence over the derived values. Useful for POST endpoints that are actually read-only (e.g. Jira's `POST /search` is a query, not a mutation):
   ```json
   {
     "name": "search_issues",
     "method": "POST",
     "path": "/rest/api/3/issue/search",
     "annotations": { "readOnlyHint": true, "destructiveHint": false }
   }
   ```

4. **UI display** - In the tool list, show small method badges coloured by risk: `GET` = green, `POST/DELETE` = amber/red. This gives the same visual signal the MCP client gets.

**Effort estimate:** Tiny — ~30 lines of logic. High value: Claude will stop treating `delete_issue` and `list_issues` as equivalent-risk operations, which directly reduces unwanted confirmation prompts on read-only tools and adds appropriate caution on destructive ones.

---

## Feature 27 — Tag-based operation filtering for OpenAPI imports

**Status:** Implemented

**Inspired by:** [rmcp-openapi](https://gitlab.com/lx-industries/rmcp-openapi) (Rust OpenAPI-to-MCP bridge)

**The problem:**

Enterprise OpenAPI specs (Jira, Salesforce, GitHub) can have 200-500 operations. Importing the whole spec floods the MCP client with tools the AI will never need, inflates the tool list, and wastes tokens in the system prompt. There is currently no way to selectively import only the operations relevant to a use case.

**The proposed solution:**

Add a `filter` block to the integration descriptor that includes or excludes OpenAPI operations by their `tags` array. Include and exclude rules can be combined.

**Integration descriptor addition:**

```json
{
  "name": "jira",
  "openApiUrl": "https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json",
  "filter": {
    "tags": {
      "include": ["Issues", "Comments", "Sprints"],
      "exclude": ["Webhooks", "Avatars", "Application roles"]
    },
    "operationIds": {
      "exclude": ["deleteComment", "deleteIssue"]
    }
  }
}
```

Rules are applied in order: `tags.include` (allowlist) → `tags.exclude` (denylist) → `operationIds.exclude`. If `tags.include` is omitted, all tags are allowed by default.

**Implementation guide for developers:**

1. **Filter evaluator** (`src/openapi/filter.js`):
   ```js
   export function shouldInclude(operation, filter) {
     if (!filter) return true;
     const tags = operation.tags ?? [];
     const { tags: tagFilter, operationIds: opFilter } = filter;

     if (tagFilter?.include?.length) {
       if (!tags.some(t => tagFilter.include.includes(t))) return false;
     }
     if (tagFilter?.exclude?.length) {
       if (tags.some(t => tagFilter.exclude.includes(t))) return false;
     }
     if (opFilter?.exclude?.length) {
       if (opFilter.exclude.includes(operation.operationId)) return false;
     }
     return true;
   }
   ```

2. **Apply in OpenAPI importer** - After parsing the spec and before generating tool descriptors, pass each operation through `shouldInclude(operation, integration.filter)`. Skip excluded operations entirely — they never become tools.

3. **UI support** - In the integration editor, when an `openApiUrl` is set, add a "Tags" multi-select populated from the spec's unique tags. Selecting tags sets `filter.tags.include`. Show a live count: "17 of 312 operations selected".

4. **Validation feedback** - After applying the filter, log at `info` level: `"jira: imported 17 tools (295 filtered out by tag/operationId rules)"`. This helps users understand what was excluded without having to count manually.

**Effort estimate:** Small — ~60 lines for the filter evaluator, ~20 lines in the importer, ~100 lines UI for the tag picker. Payoff is large for any OpenAPI-backed integration.

---

## Feature 28 — Binary and image response handling

**Status:** Implemented

**Inspired by:** [rmcp-openapi](https://gitlab.com/lx-industries/rmcp-openapi) (Rust OpenAPI-to-MCP bridge)

**The problem:**

When a tool calls an API endpoint that returns binary content — a chart image, a PDF attachment, a QR code — MCP Depot currently has no defined handling. Passing raw bytes to the MCP client produces garbled output or crashes the JSON serialiser. The AI cannot work with the content at all.

**The proposed solution:**

Detect binary responses by `Content-Type`, base64-encode the body, and return it in the MCP `EmbeddedResource` format with the MIME type preserved. The MCP client and AI model can then render or process the binary content natively.

**MCP response format for binary content:**

```json
{
  "type": "resource",
  "resource": {
    "uri": "data:image/png;base64,iVBORw0KGgo...",
    "mimeType": "image/png",
    "blob": "<base64-encoded bytes>"
  }
}
```

For image MIME types (`image/*`), also emit an `ImageContent` block so vision-capable models can see the image directly in their context.

**Implementation guide for developers:**

1. **Binary detection** (`src/executor/responseHandler.js`):
   ```js
   const BINARY_MIME_PREFIXES = ['image/', 'application/pdf', 'application/octet-stream', 'audio/', 'video/'];
   const IMAGE_MIME_PREFIX = 'image/';

   export function isBinary(contentType) {
     return BINARY_MIME_PREFIXES.some(p => contentType?.startsWith(p));
   }

   export function isImage(contentType) {
     return contentType?.startsWith(IMAGE_MIME_PREFIX);
   }
   ```

2. **Binary branch in executor** - After receiving the HTTP response, check `Content-Type` before attempting `response.json()`. If binary, read as `ArrayBuffer`, convert to base64:
   ```js
   if (isBinary(contentType)) {
     const buffer = await response.arrayBuffer();
     const b64 = Buffer.from(buffer).toString('base64');
     return buildBinaryResult(b64, contentType);
   }
   ```

3. **Result builder** - Return an `EmbeddedResource` for all binary types, plus an additional `ImageContent` for images:
   ```js
   function buildBinaryResult(b64, mimeType) {
     const resource = { type: 'resource', resource: { uri: `data:${mimeType};base64,${b64}`, mimeType, blob: b64 } };
     if (isImage(mimeType)) {
       return [{ type: 'image', data: b64, mimeType }, resource];
     }
     return [resource];
   }
   ```

4. **Size guard** - Add a `BINARY_MAX_BYTES=5242880` (5 MB) env var. If the response body exceeds the limit, return a text error instead of base64-encoding a huge blob. Log a warning with the actual size.

5. **Tool descriptor opt-in** (optional) - Add a `"binaryResponse": true` field to tool definitions that are known to return binary content. When set, skip the `Content-Type` sniff and go straight to binary handling. Useful for endpoints that return binary without a precise content-type header.

**Effort estimate:** Small — ~80 lines in the response handler. The base64 encoding and MCP type wrappers are straightforward. The main testing effort is ensuring JSON endpoints are not accidentally treated as binary when they return `application/octet-stream` incorrectly.

---

## Feature 29 — Response transformers: programmable post-processing per tool

**Status:** Implemented (`45d7c7a`)

**Inspired by:** [rmcp-openapi](https://gitlab.com/lx-industries/rmcp-openapi) (Rust OpenAPI-to-MCP bridge)

**The problem:**

Feature 17 (response field filtering) handles the common case of trimming unwanted fields. But some integrations need more than field selection: removing all `null` values to reduce noise, restructuring a deeply nested response into a flat shape, renaming keys to match a consistent naming convention, or prepending context the AI needs to interpret the data correctly.

A static `responseFields` allowlist cannot express these transformations.

**The proposed solution:**

Add a `responseTransformer` field to the integration descriptor that references a named transformer function. Transformers are defined in a `transformers/` directory as plain JavaScript modules and applied after the HTTP response is received and before it is returned to the MCP client.

**Integration descriptor addition:**

```json
{
  "name": "get_issue",
  "method": "GET",
  "path": "/rest/api/3/issue/{issueKey}",
  "responseTransformer": "stripNulls"
}
```

**Transformer module** (`transformers/stripNulls.js`):

```js
export default function stripNulls(response) {
  return JSON.parse(JSON.stringify(response, (_, v) => v === null ? undefined : v));
}
```

**Built-in transformers (bundled with MCP Depot):**

| Name | What it does |
|------|-------------|
| `stripNulls` | Removes all `null` and `undefined` values recursively |
| `flattenSingle` | Unwraps `{ items: [...] }` wrappers — returns the array directly |
| `snakeToTitle` | Converts `snake_case` keys to `Title Case` for readability |
| `truncateStrings(N)` | Truncates all string values longer than N chars — for token budget control |
| `addTimestamp` | Prepends `{ _fetchedAt: "ISO date" }` to help the AI reason about freshness |

**Implementation guide for developers:**

1. **Transformer loader** (`src/transformers/loader.js`) - At server startup, scan `transformers/` for `*.js` files and load them into a `Map<name, fn>`. Also register the built-in transformers under their reserved names. Log a warning if a descriptor references a transformer name that was not found.

2. **Apply in executor** - After `filterFields()` (Feature 17) and before returning to the MCP client, call the transformer if set:
   ```js
   let body = await parseResponse(response);
   if (tool.responseFields) body = filterFields(body, tool.responseFields);
   if (tool.responseTransformer) {
     const fn = transformerLoader.get(tool.responseTransformer);
     if (fn) body = fn(body);
   }
   return body;
   ```

3. **Global transformer** - Add a top-level `"defaultResponseTransformer": "stripNulls"` field to the integration descriptor that applies to all tools in that integration unless a tool overrides it with its own `responseTransformer`.

4. **Sandboxing** - User-provided transformer files run in the same Node.js process. Document this clearly: transformers have full Node access. For a future hardened mode, evaluate running them in a `vm.Script` context with a restricted global.

5. **UI editor** - In the tool detail panel, show a "Transformer" dropdown listing available transformer names. Add a link to the `transformers/` directory for users who want to write custom ones.

**Effort estimate:** Small-Medium — loader and executor integration ~100 lines, built-in transformers ~80 lines, UI dropdown ~30 lines. The open-ended power of custom transformers makes this a strong differentiator for advanced users.

---

## Feature 30 — MCP Prompts registry

**Status:** Implemented (`69e6226`)

**Inspired by:** [IBM/mcp-context-forge](https://github.com/IBM/mcp-context-forge) (enterprise MCP gateway)

**The problem:**

The MCP specification defines three server capabilities: **Tools**, **Resources**, and **Prompts**. MCP Depot exposes only Tools. The Prompts capability — which lets a client call `prompts/list` and `prompts/get` to retrieve named, parameterised prompt templates — is entirely absent.

This matters because Claude and other MCP clients can surface MCP Prompts directly in their UI (Claude shows them in the `/` slash-command menu). A team that stores prompt templates in MCP Depot can share them across all developers without copying text into every project's CLAUDE.md.

**The proposed solution:**

Add a Prompts registry to MCP Depot. Prompts are stored as named templates with variable slots, retrieved via the standard MCP `prompts/list` and `prompts/get` protocol methods, and managed through the existing UI and REST API.

**MCP protocol methods to implement:**

| Method | What it does |
|--------|-------------|
| `prompts/list` | Returns all registered prompt names and descriptions |
| `prompts/get` | Returns the rendered prompt messages for a named prompt, with caller-supplied argument values substituted |

**Prompt template format:**

```json
{
  "name": "summarise_issue",
  "description": "Summarise a Jira issue into a one-paragraph executive summary",
  "arguments": [
    { "name": "issueKey",  "description": "Jira issue key e.g. P20009868-42", "required": true },
    { "name": "audience",  "description": "Target audience: engineer, manager, or executive", "required": false, "default": "engineer" }
  ],
  "template": "You are summarising Jira issue {{issueKey}} for a {{audience}}.\n\nFetch the issue details and write a one-paragraph summary that is appropriate for the audience. Focus on: what the problem is, what was done, and the current status."
}
```

`{{variable}}` syntax for substitution (same convention used by Handlebars and Mustache — familiar to JS developers).

**`prompts/get` response shape (MCP spec):**

```json
{
  "description": "Summarise a Jira issue into a one-paragraph executive summary",
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "text",
        "text": "You are summarising Jira issue P20009868-42 for an engineer.\n\nFetch the issue details..."
      }
    }
  ]
}
```

**Implementation guide for developers:**

1. **Schema and persistence** - Add a `Prompts` table to the SQLite database: `(id, name, description, argumentsJson, template, createdAt, updatedAt)`. `argumentsJson` stores the arguments array as a JSON string. Add a unique index on `name`.

2. **Template renderer** (`src/prompts/renderer.js`):
   ```js
   export function renderTemplate(template, args) {
     return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
       if (key in args) return String(args[key]);
       throw new Error(`Missing required argument: ${key}`);
     });
   }
   ```
   Apply defaults for optional arguments before rendering: merge `{ ...defaults, ...callerArgs }`.

3. **MCP handler registration** - In `src/server.js`, alongside `server.tool()` registrations, add:
   ```js
   server.prompt('*', async ({ name, arguments: args }) => {
     const prompt = db.prepare('SELECT * FROM Prompts WHERE name = ?').get(name);
     if (!prompt) throw new McpError(ErrorCode.InvalidParams, `Prompt not found: ${name}`);
     const parsedArgs = JSON.parse(prompt.argumentsJson);
     const defaults = Object.fromEntries(
       parsedArgs.filter(a => a.default != null).map(a => [a.name, a.default])
     );
     const text = renderTemplate(prompt.template, { ...defaults, ...(args ?? {}) });
     return { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text } }] };
   });
   ```
   For `prompts/list`, the SDK calls the registered handler with a `list` intent — return all prompt names and descriptions from the DB.

4. **REST API** - Add CRUD routes under `/api/prompts`: `GET /api/prompts`, `POST /api/prompts`, `PUT /api/prompts/:name`, `DELETE /api/prompts/:name`. Mirror the pattern already used for `/api/integrations`.

5. **UI tab** - Add a "Prompts" tab in the MCP Depot sidebar. Show a list of prompts with name, description, and argument count. Detail panel: name, description, arguments editor (table with name/description/required/default columns), and a template textarea with `{{variable}}` syntax highlighting.

6. **Argument validation** - On `prompts/get`, check all `required: true` arguments are present in the caller's `arguments` object. Return a clear `InvalidParams` error if any are missing, naming the specific argument.

**Effort estimate:** Medium — DB schema + renderer (~60 lines), MCP handler registration (~40 lines), REST routes (~80 lines), UI tab (~200 lines). The SDK already handles `prompts/list` routing — the main work is the UI and the variable substitution edge cases (missing args, nested braces, non-string values).

---

## Feature 31 — Rate limiting per integration and per tool

**Status:** Implemented

**Inspired by:** [IBM/mcp-context-forge](https://github.com/IBM/mcp-context-forge) (enterprise MCP gateway)

**The problem:**

A runaway AI agent — or a badly-written tool chain — can exhaust an upstream API's rate limit quota in minutes. Jira Cloud allows 10,000 requests per hour; a looping agent calling `search_issues` in a sub-agent loop can hit that in under 10 minutes. There is currently no throttle between MCP Depot and the upstream APIs it proxies.

**The proposed solution:**

Add optional rate limit configuration at the integration level and the individual tool level. When a limit is exceeded, MCP Depot returns a structured `RateLimitExceeded` error to the MCP client rather than forwarding the request upstream, so the AI can back off gracefully.

**Integration descriptor addition:**

```json
{
  "name": "jira",
  "baseUrl": "https://yoursite.atlassian.net",
  "rateLimit": {
    "requestsPerMinute": 60,
    "requestsPerHour": 1000
  },
  "tools": [
    {
      "name": "search_issues",
      "rateLimit": { "requestsPerMinute": 10 }
    }
  ]
}
```

Tool-level limits are checked first, then integration-level limits. Both must pass for the request to proceed.

**Implementation guide for developers:**

1. **Rate limiter** (`src/ratelimit/limiter.js`) - Use a sliding window counter backed by the existing in-memory store (no Redis needed for single-instance). Each window entry is a `{ count, windowStart }` object keyed by `"integration:tool:window"`. On each request, advance the window if expired, increment the counter, and compare against the limit:
   ```js
   export class SlidingWindowLimiter {
     #windows = new Map();

     check(key, limit, windowMs) {
       const now = Date.now();
       const entry = this.#windows.get(key) ?? { count: 0, windowStart: now };
       if (now - entry.windowStart > windowMs) {
         this.#windows.set(key, { count: 1, windowStart: now });
         return { allowed: true, remaining: limit - 1 };
       }
       if (entry.count >= limit) {
         const resetIn = Math.ceil((entry.windowStart + windowMs - now) / 1000);
         return { allowed: false, remaining: 0, resetInSeconds: resetIn };
       }
       entry.count++;
       return { allowed: true, remaining: limit - entry.count };
     }
   }
   ```

2. **Interceptor** (`src/ratelimit/interceptor.js`) - Wrap the tool executor. Before making the upstream HTTP call, run `check()` for both tool-level and integration-level limits. If either returns `allowed: false`, throw a structured MCP error:
   ```js
   throw new McpError(
     ErrorCode.InvalidRequest,
     `Rate limit exceeded for ${toolName}. Retry in ${resetInSeconds}s.`,
     { retryAfterSeconds: resetInSeconds }
   );
   ```

3. **Headers** - On successful calls, attach remaining quota to the MCP response metadata: `X-RateLimit-Remaining: 42` and `X-RateLimit-Reset: 30`. The AI can read these to self-throttle before hitting the limit.

4. **UI display** - In the tool detail panel, show a live rate limit gauge: "42 / 60 requests this minute". Add rate limit fields to the integration and tool editors.

5. **Global defaults** - Add `RATE_LIMIT_DEFAULT_RPM=300` and `RATE_LIMIT_DEFAULT_RPH=5000` env vars as a safety net applied to all tools unless overridden. Set them high enough not to interfere with normal use but low enough to catch runaway loops.

**Effort estimate:** Small-Medium — sliding window implementation ~80 lines, interceptor ~40 lines, UI gauges ~60 lines. No external dependency needed.

---

## Feature 32 — OpenTelemetry observability

**Status:** Proposed

**Inspired by:** [IBM/mcp-context-forge](https://github.com/IBM/mcp-context-forge) (enterprise MCP gateway)

**The problem:**

Feature 19 (analytics UI) surfaces tool call data from a local SQLite table — useful for a single developer but limited for teams and production deployments. There is no distributed tracing, no integration with existing observability stacks (Grafana, Datadog, New Relic, Jaeger), and no way to correlate an MCP Depot tool call with the wider agent session that triggered it.

**The proposed solution:**

Instrument MCP Depot with OpenTelemetry. Emit a span for every tool call with standard semantic attributes. Export via OTLP to any compatible backend. When a W3C `traceparent` header is present on the incoming MCP request (forwarded by the client), attach it as the parent span so the tool call appears as a child in the caller's distributed trace.

**Spans and attributes to emit:**

| Span name | Key attributes |
|-----------|---------------|
| `mcp.tool.call` | `tool.name`, `integration.name`, `http.method`, `http.url`, `http.status_code`, `duration_ms`, `error` (if failed) |
| `mcp.prompt.get` | `prompt.name`, `prompt.arguments_count` |
| `mcp.openapi.import` | `integration.name`, `tools_imported`, `tools_filtered` |

**Implementation guide for developers:**

1. **Package** - Add `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, and `@opentelemetry/semantic-conventions` to `package.json`. Gate installation behind an `OTEL_ENABLED=true` env flag so existing deployments pick up zero new dependencies by default.

2. **Initialisation** (`src/telemetry/otel.js`) - Initialise the SDK at process startup, before any other module loads:
   ```js
   import { NodeSDK } from '@opentelemetry/sdk-node';
   import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

   export function initTelemetry() {
     if (process.env.OTEL_ENABLED !== 'true') return;
     const sdk = new NodeSDK({
       serviceName: process.env.OTEL_SERVICE_NAME ?? 'mcp-depot',
       traceExporter: new OTLPTraceExporter({
         url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
       }),
     });
     sdk.start();
   }
   ```

3. **Tool call instrumentation** - Wrap the tool executor with a span:
   ```js
   import { trace, context, propagation } from '@opentelemetry/api';
   const tracer = trace.getTracer('mcp-depot');

   // Extract parent context from MCP request headers if present
   const parentCtx = propagation.extract(context.active(), requestHeaders);
   const span = tracer.startSpan('mcp.tool.call', {}, parentCtx);
   span.setAttributes({ 'tool.name': toolName, 'integration.name': integrationName });
   try {
     const result = await executeUpstream(tool, args);
     span.setStatus({ code: SpanStatusCode.OK });
     return result;
   } catch (err) {
     span.recordException(err);
     span.setStatus({ code: SpanStatusCode.ERROR });
     throw err;
   } finally {
     span.end();
   }
   ```

4. **Configuration env vars** (standard OTEL variables, no custom ones needed):
   - `OTEL_ENABLED=true` — opt-in flag
   - `OTEL_SERVICE_NAME=mcp-depot` — service name in traces
   - `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` — collector URL
   - `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>` — for SaaS backends

5. **Metrics** - In addition to traces, emit an OTLP metric counter `mcp.tool.calls.total` with labels `tool_name`, `integration_name`, `status`. This feeds dashboards in Grafana without needing the full trace pipeline.

6. **Readme section** - Document the `docker-compose.observability.yml` snippet that spins up an OpenTelemetry Collector + Jaeger UI locally, so developers can test traces without a SaaS account.

**Effort estimate:** Medium — SDK setup ~50 lines, instrumentation of executor + prompts handler ~80 lines, metrics ~30 lines. The open standard means zero vendor lock-in: the same code works with Jaeger locally, Grafana Cloud in staging, and Datadog in production.

---

## Feature 33 — Multi-instance federation

**Status:** Proposed

**Inspired by:** [IBM/mcp-context-forge](https://github.com/IBM/mcp-context-forge) (enterprise MCP gateway)

**The problem:**

A growing team often ends up running multiple MCP Depot instances — one per project, one per team, or one per environment. A developer working across projects must configure multiple MCP server connections in their client. There is no way for one MCP Depot instance to route a tool call to another instance, or to present a unified tool list composed from several instances.

**The proposed solution:**

Add a lightweight federation layer. A designated **hub** instance can register one or more **upstream** MCP Depot instances. The hub advertises all tools from all upstreams under namespaced names (`<upstream-alias>/<tool-name>`) and proxies calls to the correct instance transparently. Clients connect only to the hub.

**Hub configuration** (`config/federation.json`):

```json
{
  "upstreams": [
    {
      "alias": "platform",
      "url": "http://mcp-depot-platform:3001",
      "apiKey": "${PLATFORM_MCPDEPOT_KEY}",
      "syncIntervalSeconds": 60
    },
    {
      "alias": "security",
      "url": "http://mcp-depot-security:3001",
      "apiKey": "${SECURITY_MCPDEPOT_KEY}",
      "syncIntervalSeconds": 60
    }
  ]
}
```

A client connecting to the hub sees tools like `platform/search_issues`, `platform/get_sprint`, `security/scan_repo` alongside the hub's own tools.

**Implementation guide for developers:**

1. **Upstream sync** (`src/federation/sync.js`) - On startup and every `syncIntervalSeconds`, call `GET /api/integrations` on each upstream to fetch its tool list. Cache the tool descriptors in memory. Register each tool on the hub's `McpServer` under the namespaced name `<alias>/<toolName>`. On re-sync, deregister stale tools and register new ones.

2. **Proxy executor** (`src/federation/proxyExecutor.js`) - When a federated tool is called, forward the call to the upstream's MCP endpoint (not the REST API — use the MCP protocol directly over HTTP so streaming responses are preserved):
   ```js
   async function proxyToolCall(upstream, toolName, args) {
     const response = await fetch(`${upstream.url}/mcp`, {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${upstream.apiKey}`, 'Content-Type': 'application/json' },
       body: JSON.stringify({ method: 'tools/call', params: { name: toolName, arguments: args } }),
     });
     return response.json();
   }
   ```

3. **Health-aware routing** - Before registering a tool from an upstream, check that upstream's `/api/health` (Feature 18). If an upstream is unhealthy, mark its tools as unavailable and return a clear error (`"Upstream 'platform' is currently unreachable"`) rather than a timeout. Re-register when health recovers.

4. **UI** - Add a "Federation" section to the MCP Depot settings page. Show each configured upstream with its alias, URL, sync status, tool count, and last-synced timestamp. Add a "Sync now" button. Federated tools appear in the main tool list with an upstream badge (`platform →`).

5. **Loop prevention** - A hub must not be registered as an upstream of itself (or of any upstream that already points back to the hub). On registration, call `GET /api/federation/upstreams` on the candidate upstream and reject if the hub's own URL appears in its upstream list.

6. **Security** - Each upstream connection uses its own API key from the environment. Never store API keys in `federation.json` directly — require `${ENV_VAR}` syntax and resolve at startup. Log a startup error and refuse to register the upstream if the env var is missing.

**Effort estimate:** Medium — upstream sync + proxy executor ~200 lines, health-aware routing ~50 lines, UI panel ~150 lines. Loop detection ~30 lines. The main complexity is handling upstream tool re-registration cleanly when the `McpServer` SDK does not have a first-class `unregister` API.

---

## Feature 34 — Generic async watcher: long-running tool calls that wait for external systems

**Status:** Implemented

**The problem:**

Most MCP tools are stateless and fast: call an API, return the result. But many real developer workflows involve waiting for an asynchronous external process — a CI build, a deployment, a pipeline run, a background job. Today the only option is for the AI to poll repeatedly by calling the same tool in a loop, which burns tool calls, fills context with intermediate status messages, and puts the polling logic in the prompt rather than the server.

**The proposed solution:**

Add a generic `watch_until_done` tool backed by a pluggable **source adapter** system. The AI makes a single tool call. MCPHUB takes ownership of the polling loop internally, sends `notifications/progress` ticks back to the client while waiting, and resolves the tool call only when the watched process reaches a terminal state — returning a structured summary of the outcome.

From the AI's perspective: one tool call in, one result out, however long it takes.

**Tool interface:**

```js
watch_until_done({
  source: "jenkins",           // which adapter to use
  trigger: {                   // adapter-specific identifiers
    job: "Components/lcs",
    build: "PR-42"
  },
  pollIntervalSeconds: 30,     // optional, adapter provides a sensible default
  timeoutSeconds: 3600         // optional, default 1 hour
})
```

**Return value (on completion):**

```json
{
  "source": "jenkins",
  "status": "FAILURE",
  "duration": "8m 14s",
  "summary": "Stage 'test' failed: 3 test cases failed in PoolServiceTest",
  "details": {
    "failedStage": "test",
    "consoleExcerpt": "...last 40 lines of relevant output...",
    "artifactUrls": ["http://jenkins/job/lcs/PR-42/artifact/surefire-reports/"]
  }
}
```

**Source adapter interface:**

Each adapter is a small module in `src/watchers/adapters/` that implements three functions:

```js
export default {
  // Return the current status and whether it is terminal
  async poll(trigger, credentials) {
    // → { status: "RUNNING", terminal: false, progress?: "3 / 10 stages" }
    // → { status: "SUCCESS", terminal: true }
    // → { status: "FAILURE", terminal: true }
  },

  // Called once when a terminal state is reached — fetch logs, artifacts, summary
  async collectResult(trigger, status, credentials) {
    // → { summary, details }
  },

  defaults: {
    pollIntervalSeconds: 30,
    terminalStates: ["SUCCESS", "FAILURE", "ABORTED"]
  }
}
```

**Built-in adapters:**

| Adapter | What it watches | Terminal states |
|---------|----------------|----------------|
| `jenkins` | Jenkins build by job + build number | `SUCCESS`, `FAILURE`, `ABORTED`, `UNSTABLE` |
| `github_actions` | GitHub Actions workflow run | `completed`, `cancelled` |
| `bitbucket_pipelines` | Bitbucket Pipeline run | `SUCCESSFUL`, `FAILED`, `STOPPED` |
| `vercel` | Vercel deployment | `READY`, `ERROR`, `CANCELED` |
| `kubernetes` | Pod or Rollout readiness | `Running+Ready`, `CrashLoopBackOff`, `Failed` |
| `custom` | Any REST endpoint | Caller-defined field path + terminal values |

The `custom` adapter is the escape hatch for anything not covered — the caller specifies the poll URL, which JSON field to read for status, and what values count as terminal:

```js
watch_until_done({
  source: "custom",
  trigger: {
    pollUrl: "https://api.example.com/jobs/{{jobId}}/status",
    statusField: "state",
    terminalStates: ["done", "failed", "cancelled"],
    resultField: "result"
  }
})
```

**Implementation guide for developers:**

1. **Watcher engine** (`src/watchers/engine.js`) - The core loop. Runs inside the async tool handler so the MCP connection stays open for the duration:
   ```js
   export async function runWatcher({ adapter, trigger, credentials, meta, onProgress, signal }) {
     const { pollIntervalSeconds } = { ...adapter.defaults, ...meta };
     const deadline = Date.now() + (meta.timeoutSeconds ?? 3600) * 1000;
     let elapsed = 0;

     while (Date.now() < deadline) {
       if (signal?.aborted) throw new Error('Watch cancelled');
       const { status, terminal, progress } = await adapter.poll(trigger, credentials);
       elapsed += pollIntervalSeconds;
       onProgress({ status, progress, elapsed });
       if (terminal) {
         const result = await adapter.collectResult(trigger, status, credentials);
         return { status, ...result };
       }
       await sleep(pollIntervalSeconds * 1000);
     }
     throw new Error(`Watch timed out after ${meta.timeoutSeconds}s`);
   }
   ```

2. **Tool handler** (`src/tools/watchUntilDone.js`) - Registers the tool on the `McpServer`. Uses the SDK's progress notification API to send ticks while waiting:
   ```js
   server.tool('watch_until_done', schema, async (args, { progressToken, signal }) => {
     const adapter = await loadAdapter(args.source);
     const result = await runWatcher({
       adapter,
       trigger: args.trigger,
       credentials: resolveCredentials(args.source),
       meta: { pollIntervalSeconds: args.pollIntervalSeconds, timeoutSeconds: args.timeoutSeconds },
       signal,
       onProgress: ({ status, progress, elapsed }) => {
         server.notification({
           method: 'notifications/progress',
           params: {
             progressToken,
             progress: elapsed,
             total: args.timeoutSeconds ?? 3600,
             message: `${status}${progress ? ` — ${progress}` : ''} (${fmtDuration(elapsed)})`
           }
         });
       }
     });
     return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
   });
   ```

3. **Credentials** - Each adapter reads credentials from environment variables resolved at call time. The Jenkins adapter reads `JENKINS_URL`, `JENKINS_USER`, and `JENKINS_TOKEN`. Document required env vars per adapter in the README. Never pass credentials through the tool arguments.

4. **Adapter loader** (`src/watchers/adapters/index.js`):
   ```js
   const KNOWN = ['jenkins', 'github_actions', 'bitbucket_pipelines', 'vercel', 'kubernetes', 'custom'];
   export async function loadAdapter(source) {
     if (!KNOWN.includes(source)) throw new Error(`Unknown watcher source: ${source}`);
     return (await import(`./${source}.js`)).default;
   }
   ```

5. **Jenkins adapter** (`src/watchers/adapters/jenkins.js`) - Polls `/job/{folder}/{job}/{build}/api/json` for build status. On terminal FAILURE, fetches the last 80 lines of `/consoleText` and calls `/wfapi/describe` to identify which pipeline stage failed and why. Returns a `summary` string and `details` object structured for easy AI consumption.

6. **Cancellation** - The MCP SDK passes an `AbortSignal` to tool handlers when the client cancels the call. Thread it to the watcher engine's `signal` parameter so a cancelled watch stops polling immediately.

7. **UI live panel** - Add a "Watchers" panel to the MCP Depot UI (SSE-streamed from `GET /api/watchers/active`). Show each active watch: source, trigger, current status, elapsed time, and a "Cancel" button. Gives visibility into what MCPHUB is waiting on even when the AI session is not actively displaying progress.

8. **Composability** - The watcher integrates naturally with Feature 22 (composite tool builder). A composite could chain: `create_pull_request` → `watch_until_done(source=jenkins, trigger=$step1.buildId)` → `post_comment(body=$step2.summary)` — push code, wait for CI, post result as a PR comment, all as one composite tool.

**Effort estimate:** Medium-High — watcher engine + tool handler ~200 lines, Jenkins adapter ~150 lines (the most detailed one — failure stage extraction from wfapi is the tricky part), remaining adapters ~50 lines each, UI live panel ~100 lines.

---

## Feature 35 — MCP client identity: capture which AI tool made each call

**Status:** Proposed

**The problem:**

Every tool call in MCPHUB is currently logged with `callerType: 'mcp'` regardless of which AI client made it. Claude Code, opencode, Cursor, Zed, and any other MCP client are completely indistinguishable in the audit log, analytics, and monitoring UI. This makes it impossible to answer questions like "which tools does Claude Code use most?", "are opencode users hitting different errors?", or "can I apply a higher rate limit to automated agents vs. interactive users?"

**The proposed solution:**

Capture the `clientInfo` object from the MCP `initialize` handshake — which every compliant MCP client sends when it first connects — and attach the client name and version to every subsequent tool call logged from that session.

**What the MCP protocol provides:**

Every MCP client sends an `initialize` request on connect with a `clientInfo` block:

```json
{
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "clientInfo": { "name": "claude-code", "version": "1.5.0" },
    "capabilities": { ... }
  }
}
```

**Known client names:**

| Client | `clientInfo.name` |
|--------|------------------|
| Claude Code | `claude-code` |
| Cursor | `cursor` |
| opencode | `opencode` |
| Zed | `zed` |
| Continue | `continue` |
| Windsurf | `windsurf` |
| Unknown / custom | *(absent or arbitrary string)* |

**Implementation guide for developers:**

1. **Session→clientInfo map** - Add a `Map` at the `MCPDepotServer` class level to hold session identity. Populate it by intercepting the `initialize` request before the SDK's default handler runs:

   ```js
   // mcp/server.js — in initialize(), after creating this.server
   this._sessionClientMap = new Map();

   this.server.server.setRequestHandler(InitializeRequestSchema, async (req, extra) => {
     const clientInfo = req.params?.clientInfo ?? { name: 'unknown' };
     const sessionId = extra?.sessionId;
     if (sessionId) this._sessionClientMap.set(sessionId, clientInfo);
     // delegate to SDK default handler
     return { protocolVersion: LATEST_PROTOCOL_VERSION, serverInfo: { name: 'mcp-depot', version: '1.0.0' }, capabilities: this.server.server.getCapabilities() };
   });
   ```

2. **Pass clientInfo into tool handlers** - The MCP SDK passes an `extra` context object as the second argument to tool handlers. Extract the session ID from it and resolve clientInfo:

   ```js
   this.server.tool(toolName, schema, async (params, extra) => {
     const clientInfo = this._sessionClientMap.get(extra?.sessionId) ?? { name: 'unknown' };
     const result = await this.executeTool(tool, params, clientInfo);
     ...
   });
   ```

3. **Update `logToolCall`** - Replace the hardcoded `callerType: 'mcp'` with the resolved client name, and add `callerVersion`:

   ```js
   await logToolCall({
     ...existingFields,
     callerType:    clientInfo.name    ?? 'mcp',
     callerVersion: clientInfo.version ?? null,
   });
   ```

   Add `callerVersion` as a nullable STRING column to `ToolCalls` via a migration if it does not already exist.

4. **stdio transport fallback** - For stdio, there is no `sessionId` per-call. Capture `clientInfo` once at connect time and store as `this._stdioClientInfo`. Use it for all tool calls on that transport:

   ```js
   // In startStdio(), after connect:
   this.server.server.oninitialized = () => {
     this._stdioClientInfo = this.server.server.getClientVersion() ?? { name: 'unknown' };
   };
   ```

5. **Session cleanup** - Remove entries from `_sessionClientMap` when a session ends to avoid unbounded growth. Hook into the transport's session-close event, or run a periodic cleanup that removes entries older than the session timeout.

6. **User-Agent fallback** - For HTTP transport requests where `clientInfo` is absent (non-compliant clients), fall back to the `User-Agent` request header. Pass it through from the Express request context into the tool handler via `extra` metadata if the SDK supports it, or capture it in the transport layer.

7. **Analytics UI update** - Extend the Feature 19 analytics dashboard with a "By client" breakdown: a bar chart of call volume grouped by `callerType`. Add a `callerType` filter dropdown to the tool call log table. This answers at a glance which AI clients use MCPHUB most.

8. **Rate limiting integration** - Feed `clientInfo.name` into the rate limiter (Feature 31) as an additional key dimension: `${toolId}:${userId}:${clientName}`. This allows different limits for interactive Claude Code sessions vs. automated agent pipelines connecting as the same user.

**Effort estimate:** Small — session map + initialize intercept ~50 lines, tool handler threading ~20 lines per handler, migration + logToolCall update ~20 lines, analytics UI addition ~60 lines. The SDK already delivers `clientInfo` — this is purely a capture-and-forward problem.

---

## Feature 36 — Connected clients panel: live view of active MCP sessions

**Status:** Proposed

**Depends on:** Feature 35 / Issue 115 (session→clientInfo map must be in place first)

**The problem:**

There is no way to see which AI clients are currently connected to MCP Depot. The dashboard shows a static "MCP enabled / disabled" indicator but gives no insight into who is connected, how long they have been connected, or what they last called. When something goes wrong — a tool hangs, a client sends unexpected calls, an agent goes rogue — there is no live view to diagnose it.

**The proposed solution:**

Add a **Connected Clients** panel to the dashboard (and a dedicated section in the Monitoring page) that shows all active MCP sessions in real time, streamed via Server-Sent Events.

**What the panel shows:**

```
Connected Clients  ● 2 active
┌─────────────────┬──────────┬──────────────┬──────────────────┬──────────┐
│ Client          │ Version  │ Connected    │ Last call        │ Calls    │
├─────────────────┼──────────┼──────────────┼──────────────────┼──────────┤
│ claude-code     │ 1.5.0    │ 4 mins ago   │ search_issues    │ 12       │
│ cursor          │ 0.42.1   │ 22 mins ago  │ get_sprint       │ 3        │
└─────────────────┴──────────┴──────────────┴──────────────────┴──────────┘
```

For stdio transport (single client): a single row with the connected client's identity and uptime.

**Session record structure** (held in `_sessionClientMap`, extended from Feature 35):

```js
{
  sessionId:    "abc123",
  clientName:   "claude-code",
  clientVersion:"1.5.0",
  connectedAt:  1234567890000,
  lastCallAt:   1234567891000,
  lastTool:     "search_issues",
  callCount:    12
}
```

**Implementation guide for developers:**

1. **Extend `_sessionClientMap`** - When `initialize` is received (Feature 35 step 1), store the full session record including `connectedAt: Date.now()` and `callCount: 0`. Update `lastCallAt`, `lastTool`, and `callCount` inside each tool handler after a successful call.

2. **Track disconnects** - Hook into the `StreamableHTTPServerTransport` session lifecycle to remove entries on close. If the SDK does not expose a close event, run a periodic sweep that removes sessions with `lastCallAt` older than a configurable `SESSION_IDLE_TIMEOUT_MINUTES` (default: 30):

   ```js
   setInterval(() => {
     const cutoff = Date.now() - (SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000);
     for (const [id, session] of this._sessionClientMap) {
       if (session.lastCallAt < cutoff) this._sessionClientMap.delete(id);
     }
   }, 60_000);
   ```

3. **REST endpoint** - `GET /api/mcp/sessions` returns the active session list as JSON. Used for the initial page load.

4. **SSE stream** - `GET /api/mcp/sessions/stream` emits an event whenever the session map changes (new connection, disconnect, last-call update). The client subscribes on mount and updates the panel live without polling:

   ```js
   // Server: emit on any session map change
   function broadcastSessionUpdate() {
     const payload = JSON.stringify(getActiveSessions());
     sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
   }
   ```

5. **Dashboard widget** - A compact widget in the top section of the Dashboard page, next to the existing stats cards. Shows active client count as a badge, lists clients in a small table. Collapses to a single "N clients connected" line if more than 5 are active.

6. **Monitoring page section** - A more detailed view on the Monitoring page with full session history (including recently disconnected sessions in a muted style), per-session call count, and a timeline sparkline of call frequency.

7. **Active tool indicator** - When a tool call is in progress for a session (started but not yet returned), mark that row with a subtle spinner. This is especially useful for long-running calls like the async watcher (Feature 34) — you can see at a glance that a watch is running and which client triggered it.

8. **stdio transport** - For stdio there is no `sessionId`. Represent the single stdio client as a fixed entry keyed `"stdio"`, populated from `this._stdioClientInfo` (Feature 35 step 4). Show it as "1 client (stdio)" with the same fields.

**Effort estimate:** Small-Medium — session record extension ~30 lines, REST + SSE endpoints ~60 lines, dashboard widget ~80 lines, monitoring section ~60 lines. Builds entirely on the session map from Feature 35 — the two features should be implemented in the same PR.
