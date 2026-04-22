# MCPConnect — Feature Ideas

> Proposed features that are not bug fixes. Each entry explains the problem,
> the proposed solution, and why it is worth building.

---

## Feature 01 — Session Context Store: share AI session context across sessions, tools, and teammates

**Status:** Partially implemented — ownership + sharing design pending

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
| `store-session-context(name, content, shared?)` | Save a named context string. `shared` defaults to `false` (private). |
| `get-session-context(name)` | Retrieve a context you own or that is shared. Returns 404 for private contexts owned by others. |
| `list-session-contexts()` | List your own contexts plus all shared contexts. |
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
  createdBy INTEGER REFERENCES Users(id) ON DELETE SET NULL,
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
- Consider adding an optional `ttl` (time-to-live) field so temporary investigation
  contexts auto-expire and do not clutter the store.
- Admin UI: a list view under a "Contexts" section, with name, owner, shared badge,
  and age. No editor needed — Claude writes the content. Owner gets a share toggle
  and a delete button; non-owners see read-only.

**Effort estimate:** Small — the table exists, the routes exist. This revision adds
one column (`isShared`), a new migration, and ownership checks throughout the routes
and MCP tools. No new dependencies.

---

### Implementation Guide

This section gives the developer exact code to write. All patterns follow existing
MCPConnect conventions observed in the codebase.

> **Note for the developer:** Feature 01 was partially implemented. The table,
> model, REST routes (`session-context.js`), and React page (`SessionContexts.jsx`)
> already exist. This guide supersedes the original spec. Changes needed are:
> 1. Add `isShared` column via a new migration
> 2. Update model, REST routes, MCP DB seed records, and UI for ownership + sharing

#### Files already created (need updating)

| File | What to change |
|------|---------------|
| `server/src/models/SessionContext.js` | Add `isShared` field |
| `server/src/routes/session-context.js` | Add ownership checks + `isShared` filtering |
| `client/src/pages/SessionContexts.jsx` | Add shared badge, share toggle, owner-only controls |

#### New files to create

| File | Purpose |
|------|---------|
| `server/src/migrations/20260501-session-context-add-shared.js` | Alter migration — adds `isShared` to existing table |

---

#### 1. Sequelize model — `server/src/models/SessionContext.js`

Add `isShared` field. Do NOT include an `associate` block — the `belongsTo(User)`
association was removed in commit `d370b00` to fix a DB sync failure, and the routes
compare `createdBy` directly as an integer (`ctx.createdBy !== req.user.id`).

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SessionContext = sequelize.define('SessionContext', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    isShared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'SessionContext',
    timestamps: true
  });

  return SessionContext;
};
```

---

#### 2. New migration — `server/src/migrations/20260501-session-context-add-shared.js`

Adds `isShared` to the existing `SessionContext` table. Existing rows get
`isShared = false` (the column default), which is correct — pre-existing contexts
become private to whoever created them.

```js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('SessionContext', 'isShared', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('SessionContext', 'isShared');
  }
};
```

---

#### 3. REST routes — `server/src/routes/session-context.js`

Full rewrite. Key changes from the current implementation:

- GET routes filter by `createdBy = me OR isShared = true` instead of returning all
- POST upsert checks ownership before allowing update (403 if not owner)
- New `PATCH /:name/share` endpoint to toggle `isShared` (owner only)
- DELETE checks ownership (403 if not owner)
- User include removed (no `belongsTo` association — `createdBy` is a raw integer)

```js
const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');

const router = express.Router();

// Returns the Sequelize WHERE clause for "contexts readable by this user"
function readableWhere(userId) {
  return { [Op.or]: [{ createdBy: userId }, { isShared: true }] };
}

// GET /session-contexts — own contexts + shared contexts
router.get('/', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const contexts = await SessionContext.findAll({
      where: readableWhere(req.user.id),
      order: [['updatedAt', 'DESC']]
    });
    res.json(contexts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /session-contexts/:name — own or shared only; 404 for private contexts by others
router.get('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({
      where: { name: req.params.name, ...readableWhere(req.user.id) }
    });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    res.json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const upsertSchema = Joi.object({
  name:    Joi.string().max(255).required(),
  content: Joi.string().required(),
  shared:  Joi.boolean().default(false)
});

// POST /session-contexts — create (owner set to caller) or update (owner only)
router.post('/', auth, async (req, res) => {
  const { error, value } = upsertSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name: value.name },
      defaults: {
        id:        randomUUID(),
        name:      value.name,
        content:   value.content,
        isShared:  value.shared,
        createdBy: req.user.id
      }
    });

    if (!created) {
      if (ctx.createdBy !== req.user.id) {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      await ctx.update({ content: value.content, isShared: value.shared });
    }

    res.status(created ? 201 : 200).json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /session-contexts/:name/share — toggle isShared (owner only)
router.patch('/:name/share', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name: req.params.name } });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    if (ctx.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    const isShared = typeof req.body.shared === 'boolean' ? req.body.shared : !ctx.isShared;
    await ctx.update({ isShared });
    res.json({ name: ctx.name, isShared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /session-contexts/:name — owner only
router.delete('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name: req.params.name } });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    if (ctx.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    await ctx.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

---

#### 4. MCP internal routes — additions to `server/src/routes/mcp.js`

The four MCP tools are backed by internal REST handlers at `/api/mcp/session-contexts/*`.
These currently have **no auth middleware**, so `req.user` is never set and `createdBy`
is always null. Ownership enforcement requires adding `checkMcpAuth` to these routes.

**How `checkMcpAuth` resolves a user (from `middleware/mcpAuth.js`):**

| Auth mode (system setting) | `req.user` result |
|---|---|
| `none` | Never set — ownership impossible |
| `optional` | Set only if caller sends a valid Bearer JWT; otherwise null |
| `required` | Always set — from `Authorization: Bearer <JWT>` or `X-API-Key: <user-api-key>` |

In `required` mode, Claude Code / MCP clients pass their API key via `X-API-Key` header.
`checkMcpAuth` looks it up with `User.findOne({ where: { apiKey } })` and sets `req.user`.
This is the correct mode for ownership to work reliably.

**Fallback for null user (optional/none mode):** if `req.user` is null, store
`createdBy: null`. Null-owner contexts are readable by everyone and only admins can
delete them. Do not throw an error — just degrade gracefully.

Add `checkMcpAuth` to the session context routes:

```js
const { checkMcpAuth } = require('../middleware/mcpAuth');

// Apply to all session context MCP routes:
router.post('/session-contexts/store',   checkMcpAuth, async (req, res) => { ... });
router.get('/session-contexts/get',      checkMcpAuth, async (req, res) => { ... });
router.get('/session-contexts/list',     checkMcpAuth, async (req, res) => { ... });
router.delete('/session-contexts/delete', checkMcpAuth, async (req, res) => { ... });
```

For the `store` handler, add `isShared` support and set `createdBy` from the resolved user:

```js
router.post('/session-contexts/store', checkMcpAuth, async (req, res) => {
  try {
    const { name, content, shared = false } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');
    const callerId = req.user?.id ?? null;  // null if authMode is none/optional with no token

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name },
      defaults: { id: randomUUID(), name, content, isShared: shared, createdBy: callerId }
    });
    if (!created) {
      // Only allow update if caller owns it, or context is ownerless (createdBy null)
      if (ctx.createdBy !== null && ctx.createdBy !== callerId) {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      await ctx.update({ content, isShared: shared });
    }
    res.json({ success: true, name, chars: content.length, shared, created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

For the `list` handler, apply the readable filter and return `isShared`:

```js
router.get('/session-contexts/list', checkMcpAuth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const { Op } = require('sequelize');
    const callerId = req.user?.id ?? null;

    // Own contexts + shared contexts + ownerless contexts (createdBy null)
    const where = callerId
      ? { [Op.or]: [{ createdBy: callerId }, { isShared: true }, { createdBy: null }] }
      : {};  // unauthenticated — return all (authMode is none, no ownership model active)

    const all = await SessionContext.findAll({ where, order: [['updatedAt', 'DESC']] });
    res.json(all.map(c => ({
      name:      c.name,
      isShared:  c.isShared,
      mine:      callerId ? c.createdBy === callerId : false,
      updatedAt: c.updatedAt,
      chars:     c.content.length
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Update the DB seed records in `server/src/config/database.js` — add `shared` param
to `store-session-context`:

```js
{
  name: 'store-session-context',
  description: 'Save a named context to MCPConnect. Private by default — set shared=true to make it readable by any MCPConnect user. Only the creator can update or delete it.',
  endpoint: {
    path: '/api/mcp/session-contexts/store',
    method: 'POST',
    params: {
      name:    { type: 'string',  required: true,  description: 'Unique human-readable key, e.g. "bitbucket-debug"' },
      content: { type: 'string',  required: true,  description: 'The context to store — markdown, JSON, bullet list, anything' },
      shared:  { type: 'boolean', required: false, description: 'If true, any MCPConnect user can read this context. Default false.' }
    },
    headers: {}
  }
},
```

The other three seed records (`get-session-context`, `list-session-contexts`,
`delete-session-context`) do not need param changes — their endpoints already handle
the new behaviour.

---

#### 5. React admin UI — `client/src/pages/SessionContexts.jsx`

Changes from the current implementation:

- Each row shows a **Private** / **Shared** badge
- Rows the current user owns show a **Share / Unshare** toggle and a **Delete** button
- Rows owned by others (shared contexts) show no edit controls
- The modal shows the owner (raw `createdBy` integer or username if available) and
  the shared status

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

export default function SessionContexts() {
  const { token, user } = useAuth();
  const [contexts, setContexts]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/session-contexts', token);
      setContexts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (name) => {
    if (!confirm(`Delete context "${name}"?`)) return;
    await api.delete(`/session-contexts/${encodeURIComponent(name)}`, token);
    setSelected(null);
    load();
  };

  const handleToggleShare = async (name, currentShared) => {
    await api.patch(`/session-contexts/${encodeURIComponent(name)}/share`, token, { shared: !currentShared });
    load();
    if (selected?.name === name) setSelected(s => ({ ...s, isShared: !currentShared }));
  };

  const isOwner = (ctx) => ctx.createdBy === user?.id;

  return (
    <div className="container">
      <div className="page-header">
        <h1>Session Contexts</h1>
        <p>Named context snapshots stored by AI sessions. Private by default — share to make visible to teammates.</p>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : contexts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h3>No contexts yet</h3>
          <p>Ask Claude to store a context using <code>store-session-context</code>.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Visibility</th>
              <th>Updated</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contexts.map(ctx => (
              <tr key={ctx.id} onClick={() => setSelected(ctx)} className="clickable-row">
                <td><code>{ctx.name}</code></td>
                <td>
                  <span className={`badge ${ctx.isShared ? 'badge-green' : 'badge-muted'}`}>
                    {ctx.isShared ? 'Shared' : 'Private'}
                  </span>
                </td>
                <td>{ctx.updatedAt ? new Date(ctx.updatedAt).toLocaleDateString() : '-'}</td>
                <td>{ctx.content?.length ?? 0} chars</td>
                <td onClick={e => e.stopPropagation()}>
                  {isOwner(ctx) && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleToggleShare(ctx.name, ctx.isShared)}
                      >
                        {ctx.isShared ? 'Unshare' : 'Share'}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(ctx.name)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.name}</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-meta">
                <span>{selected.isShared ? '🌐 Shared' : '🔒 Private'}</span>
                <span>Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-'}</span>
                <span>{selected.content?.length ?? 0} chars</span>
              </div>
              <pre className="context-preview">{selected.content}</pre>
            </div>
            <div className="modal-footer">
              {isOwner(selected) && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleToggleShare(selected.name, selected.isShared)}
                  >
                    {selected.isShared ? 'Make Private' : 'Share with team'}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(selected.name)}>Delete</button>
                </>
              )}
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

CSS additions needed in `client/src/index.css` (if not already present):

```css
.badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.badge-green { background: rgba(59,178,115,0.15); color: var(--success); }
.badge-muted { background: var(--surface-hover); color: var(--text-light); }
```

---

#### 6. End-to-end test (manual)

Once deployed, test the full cycle from a Claude Code session:

1. Ask Claude: *"Store a private context called 'my-notes' with content 'Investigation notes - do not share'."*
   - Claude calls `store-session-context({ name: 'my-notes', content: '...' })` (shared omitted → false)
   - Admin UI shows row with **Private** badge.

2. Ask Claude: *"Store a shared context called 'team-debug' with content 'Auth middleware confirmed. RoleRight issue.'."*
   - Claude calls `store-session-context({ name: 'team-debug', content: '...', shared: true })`
   - Admin UI shows row with **Shared** badge.

3. Open a second Claude Code window (simulating a teammate) and ask: *"Load context 'team-debug' from MCPConnect."*
   - Claude calls `get-session-context({ name: 'team-debug' })` — succeeds (shared).

4. Ask the teammate session to load 'my-notes':
   - Claude calls `get-session-context({ name: 'my-notes' })` — returns 404 (private, not owner).

5. Ask teammate to delete 'team-debug':
   - REST `DELETE /session-contexts/team-debug` returns 403 (not owner).

6. In the admin UI (as the owner), click **Unshare** on 'team-debug' — badge changes to **Private**.

---

#### 7. Optional: TTL (auto-expiry)

If the store gets cluttered, add a `ttlHours` column (nullable integer) and a
background job that runs every hour to delete expired rows:

```sql
ALTER TABLE SessionContext ADD COLUMN ttlHours INTEGER NULL;
```

```js
// In a cron or startup job:
const { Op } = require('sequelize');
const cutoff = new Date(Date.now() - ctx.ttlHours * 3600000);
await SessionContext.destroy({
  where: { ttlHours: { [Op.ne]: null }, updatedAt: { [Op.lt]: cutoff } }
});
```

This is optional — skip for the initial implementation and add only if users report
context clutter.

---

## Feature 02 — Session Channels: live append-only log shared across sessions

**Status:** Proposed

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
  createdBy INTEGER REFERENCES Users(id),
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

### Implementation Guide

#### Files to create

| File | Purpose |
|------|---------|
| `server/src/models/SessionChannel.js` | Sequelize model |
| `server/src/migrations/20260501-session-channel.js` | DB migration |
| `server/src/routes/session-channel.js` | REST routes |
| `client/src/pages/SessionChannels.jsx` | React admin UI page |

#### Files to modify

| File | Change |
|------|--------|
| `server/src/routes/index.js` | Register router under `/session-channels` |
| `server/src/mcp/server.js` | Register 4 new MCP tools |
| `client/src/App.jsx` | Add `/session-channels` route |
| `client/src/components/Sidebar.jsx` | Add "Channels" nav link |

---

#### 1. Sequelize model — `server/src/models/SessionChannel.js`

Same factory function pattern as Feature 01. Key differences: no `unique` on
`channel`, `updatedAt: false` to disable the automatic updatedAt column.

```js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SessionChannel = sequelize.define('SessionChannel', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    channel: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    tableName: 'SessionChannel',
    timestamps: true,
    updatedAt: false
  });

  return SessionChannel;
};
```

---

#### 2. Migration — `server/src/migrations/20260501-session-channel.js`

Same up/down pattern as Feature 01. Adds a composite index on `(channel, createdAt)`
for fast filtered reads.

```js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SessionChannel', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      channel: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      createdBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('SessionChannel', ['channel', 'createdAt'], {
      name: 'idx_session_channel_channel_created'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SessionChannel');
  }
};
```

---

#### 3. REST routes — `server/src/routes/session-channel.js`

Four endpoints. The read endpoint accepts an optional `since` ISO timestamp as a
query parameter and uses Sequelize's `Op.gt` to filter rows.

```js
const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');
const { loadModels } = require('../models');

const router = express.Router();

// GET /session-channels — list distinct channels with count and last activity
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { SessionChannel } = await loadModels();
    const rows = await SessionChannel.findAll({
      attributes: [
        'channel',
        [SessionChannel.sequelize.fn('COUNT', SessionChannel.sequelize.col('id')), 'messageCount'],
        [SessionChannel.sequelize.fn('MAX', SessionChannel.sequelize.col('createdAt')), 'lastActivity']
      ],
      group: ['channel'],
      order: [[SessionChannel.sequelize.literal('lastActivity'), 'DESC']]
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /session-channels/:channel — read messages, optional ?since=ISO timestamp
router.get('/:channel', authenticateToken, async (req, res) => {
  try {
    const { SessionChannel, User } = await loadModels();
    const where = { channel: req.params.channel };
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (isNaN(since)) return res.status(400).json({ error: 'Invalid since timestamp' });
      where.createdAt = { [Op.gt]: since };
    }
    const messages = await SessionChannel.findAll({
      where,
      include: [{ model: User, as: 'author', attributes: ['id', 'username'] }],
      order: [['createdAt', 'ASC']]
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const appendSchema = Joi.object({
  channel: Joi.string().max(255).required(),
  message: Joi.string().required()
});

// POST /session-channels — append a message to a channel
router.post('/', authenticateToken, async (req, res) => {
  const { error, value } = appendSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { SessionChannel } = await loadModels();
    const entry = await SessionChannel.create({
      id: require('crypto').randomUUID(),
      channel: value.channel,
      message: value.message,
      createdBy: req.user.id
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /session-channels/:channel — delete all messages in a channel
router.delete('/:channel', authenticateToken, async (req, res) => {
  try {
    const { SessionChannel } = await loadModels();
    const deleted = await SessionChannel.destroy({ where: { channel: req.params.channel } });
    if (!deleted) return res.status(404).json({ error: 'Channel not found or already empty' });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

Register in `server/src/routes/index.js`:

```js
const sessionChannelRouter = require('./session-channel');
router.use('/session-channels', sessionChannelRouter);
```

---

#### 4. MCP tool registration — additions to `server/src/mcp/server.js`

Add these four tools alongside the Feature 01 tools. The `read-channel` tool
returns messages formatted as a readable log with timestamps and authors.

```js
// --- Session Channel tools ---

this.server.tool(
  'append-to-channel',
  {
    description: 'Post a message to a named session channel. Use this to share findings, decisions, or progress as you work — other sessions can read the channel at any time to catch up.',
    inputSchema: z.object({
      channel: z.string().describe('Channel name, e.g. "pool-api" or "auth-debug"'),
      message: z.string().describe('The message to post — a finding, decision, error, or note')
    })
  },
  async ({ channel, message }) => {
    const { SessionChannel } = await loadModels();
    await SessionChannel.create({
      id: require('crypto').randomUUID(),
      channel,
      message
    });
    return { content: [{ type: 'text', text: `Posted to channel '${channel}'.` }] };
  }
);

this.server.tool(
  'read-channel',
  {
    description: 'Read messages from a named session channel. Pass a since timestamp (ISO 8601) to get only new messages since the last check — useful for polling in long sessions.',
    inputSchema: z.object({
      channel: z.string().describe('The channel name to read'),
      since:   z.string().optional().describe('ISO 8601 timestamp — only return messages after this time, e.g. "2026-04-22T10:00:00Z"')
    })
  },
  async ({ channel, since }) => {
    const { SessionChannel, User } = await loadModels();
    const { Op } = require('sequelize');
    const where = { channel };
    if (since) where.createdAt = { [Op.gt]: new Date(since) };

    const messages = await SessionChannel.findAll({
      where,
      include: [{ model: User, as: 'author', attributes: ['username'] }],
      order: [['createdAt', 'ASC']]
    });

    if (messages.length === 0) {
      return { content: [{ type: 'text', text: since ? `No new messages in '${channel}' since ${since}.` : `Channel '${channel}' is empty.` }] };
    }

    const lines = messages.map(m => {
      const ts = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
      const author = m.author?.username ?? 'unknown';
      return `[${ts}] ${author}: ${m.message}`;
    });

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

this.server.tool(
  'list-channels',
  {
    description: 'List all active session channels with message count and last activity time.',
    inputSchema: z.object({})
  },
  async () => {
    const { SessionChannel } = await loadModels();
    const rows = await SessionChannel.findAll({
      attributes: [
        'channel',
        [SessionChannel.sequelize.fn('COUNT', SessionChannel.sequelize.col('id')), 'messageCount'],
        [SessionChannel.sequelize.fn('MAX', SessionChannel.sequelize.col('createdAt')), 'lastActivity']
      ],
      group: ['channel'],
      order: [[SessionChannel.sequelize.literal('lastActivity'), 'DESC']]
    });

    if (rows.length === 0) return { content: [{ type: 'text', text: 'No channels exist yet.' }] };

    const lines = rows.map(r =>
      `- **${r.channel}** | ${r.dataValues.messageCount} messages | last activity ${new Date(r.dataValues.lastActivity).toISOString().slice(0, 10)}`
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

this.server.tool(
  'clear-channel',
  {
    description: 'Delete all messages in a session channel. Use this when the channel is no longer needed.',
    inputSchema: z.object({
      channel: z.string().describe('The channel name to clear')
    })
  },
  async ({ channel }) => {
    const { SessionChannel } = await loadModels();
    const deleted = await SessionChannel.destroy({ where: { channel } });
    if (!deleted) return { content: [{ type: 'text', text: `Channel '${channel}' not found or already empty.` }] };
    return { content: [{ type: 'text', text: `Channel '${channel}' cleared (${deleted} messages deleted).` }] };
  }
);
```

---

#### 5. React admin UI — `client/src/pages/SessionChannels.jsx`

Two-panel layout: channel list on the left, message timeline on the right.
The timeline auto-formats messages as a log with timestamps. No write controls
in the UI — Claude does all writing via MCP tools.

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

export default function SessionChannels() {
  const { token } = useAuth();
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadChannels = async () => {
    setLoading(true);
    try {
      const data = await api.get('/session-channels', token);
      setChannels(data);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (channel) => {
    setLoadingMessages(true);
    try {
      const data = await api.get(`/session-channels/${encodeURIComponent(channel)}`, token);
      setMessages(data);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => { loadChannels(); }, []);

  const handleSelect = (channel) => {
    setSelected(channel);
    loadMessages(channel);
  };

  const handleClear = async (channel) => {
    if (!confirm(`Clear all messages in "${channel}"?`)) return;
    await api.delete(`/session-channels/${encodeURIComponent(channel)}`, token);
    setSelected(null);
    setMessages([]);
    loadChannels();
  };

  const handleRefresh = () => {
    if (selected) loadMessages(selected);
  };

  return (
    <div className="page-container">
      <h1>Session Channels</h1>
      <p className="page-subtitle">
        Append-only logs shared across AI sessions. Sessions post as they work;
        others read at any time to catch up without interrupting.
      </p>

      <div className="two-panel">
        {/* Left: channel list */}
        <div className="panel-left">
          {loading && <p>Loading...</p>}
          {channels.map(ch => (
            <div
              key={ch.channel}
              className={`channel-row ${selected === ch.channel ? 'active' : ''}`}
              onClick={() => handleSelect(ch.channel)}
            >
              <span className="channel-name">{ch.channel}</span>
              <span className="channel-meta">
                {ch.dataValues?.messageCount ?? ch.messageCount} msgs
              </span>
            </div>
          ))}
          {!loading && channels.length === 0 && (
            <p className="empty-state">No channels yet. Ask Claude to post to a channel.</p>
          )}
        </div>

        {/* Right: message timeline */}
        <div className="panel-right">
          {selected ? (
            <>
              <div className="panel-header">
                <h2>{selected}</h2>
                <div className="panel-actions">
                  <button className="btn-secondary btn-sm" onClick={handleRefresh}>Refresh</button>
                  <button className="btn-danger btn-sm" onClick={() => handleClear(selected)}>Clear</button>
                </div>
              </div>
              {loadingMessages && <p>Loading messages...</p>}
              <div className="message-log">
                {messages.map(m => (
                  <div key={m.id} className="log-entry">
                    <span className="log-ts">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                    <span className="log-author">{m.author?.username ?? 'unknown'}</span>
                    <span className="log-message">{m.message}</span>
                  </div>
                ))}
                {!loadingMessages && messages.length === 0 && (
                  <p className="empty-state">No messages yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">Select a channel to view its log.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

Register in `App.jsx` and sidebar (same pattern as Feature 01):

```jsx
import SessionChannels from './pages/SessionChannels';
// ...
<Route path="/session-channels" element={<SessionChannels />} />
```

```jsx
<NavLink to="/session-channels">Channels</NavLink>
```

---

#### 6. End-to-end test (manual)

1. Open two Claude Code sessions both connected to the same MCPConnect instance.
2. In Session A: *"Post to channel 'test-channel': I found that X causes Y."*
   - Claude calls `append-to-channel({ channel: 'test-channel', message: 'I found that X causes Y.' })`
3. In Session B: *"Read channel 'test-channel'."*
   - Claude calls `read-channel({ channel: 'test-channel' })`
   - Response shows the message Session A posted.
4. In Session A: post a second message.
5. In Session B: *"Anything new since [timestamp from step 3]?"*
   - Claude calls `read-channel({ channel: 'test-channel', since: '<timestamp>' })`
   - Response shows only the second message.
6. In the admin UI, navigate to Channels, select `test-channel`, confirm both messages appear in the timeline.
7. Clear the channel via the UI and confirm the list empties.
