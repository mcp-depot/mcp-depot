# MCPConnect — Feature Ideas

> Proposed features that are not bug fixes. Each entry explains the problem,
> the proposed solution, and why it is worth building.

---

## Feature 01 — Session Context Store: share AI session context across sessions, tools, and teammates

**Status:** Ownership + sharing implemented — TTL pending

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

### Implementation Guide

This section gives the developer exact code to write. All patterns follow existing
MCPConnect conventions observed in the codebase.

> **Note for the developer:** Ownership + sharing (`isShared`) is fully implemented
> as of commit `44d8cc5`. The remaining work is TTL only:
> 1. Add `ttlHours` column via a new migration
> 2. Update model and routes to persist `ttlHours`
> 3. Add `ttlHours` param to the `store-session-context` DB seed record
> 4. Add the cleanup job to server startup

#### Files to update

| File | What to change |
|------|---------------|
| `server/src/models/SessionContext.js` | Add `ttlHours` field |
| `server/src/routes/session-context.js` | Add `ttlHours` to upsertSchema + create/update |
| `server/src/config/database.js` | Add `ttlHours` param to `store-session-context` seed |
| `server/src/server.js` (or app entry point) | Start the cleanup job on startup |

#### New files to create

| File | Purpose |
|------|---------|
| `server/src/migrations/20260502-session-context-add-ttl.js` | Alter migration — adds `ttlHours` to existing table |
| `server/src/services/session-context-cleanup.js` | Hourly cleanup job for expired contexts |

---

#### 1. Sequelize model — `server/src/models/SessionContext.js`

Add `ttlHours` field. `NULL` means never expire.

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
    ttlHours: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null   // null = never expire
    },
    createdBy: {
      type: DataTypes.UUID,
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

#### 2. New migration — `server/src/migrations/20260502-session-context-add-ttl.js`

Adds `ttlHours` to the existing `SessionContext` table. Existing rows get
`ttlHours = null` (never expire). The server's cleanup job will not touch them
until a future `store-session-context` call sets a TTL on them.

```js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('SessionContext', 'ttlHours', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('SessionContext', 'ttlHours');
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

const DEFAULT_TTL_HOURS = 168; // 7 days

const upsertSchema = Joi.object({
  name:     Joi.string().max(255).required(),
  content:  Joi.string().required(),
  shared:   Joi.boolean().default(false),
  ttlHours: Joi.number().integer().min(0).allow(null).default(DEFAULT_TTL_HOURS)
  // 0 = pin permanently (stored as null); omit = use default (7 days)
});

// POST /session-contexts — create (owner set to caller) or update (owner only)
router.post('/', auth, async (req, res) => {
  const { error, value } = upsertSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');

    const ttlHours = value.ttlHours === 0 ? null : value.ttlHours;  // 0 → pin forever

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name: value.name },
      defaults: {
        id:        randomUUID(),
        name:      value.name,
        content:   value.content,
        isShared:  value.shared,
        ttlHours,
        createdBy: req.user.id
      }
    });

    if (!created) {
      if (ctx.createdBy !== req.user.id) {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      await ctx.update({ content: value.content, isShared: value.shared, ttlHours });
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

For the `store` handler, add `isShared` and `ttlHours` support and set `createdBy` from the resolved user:

```js
const DEFAULT_TTL_HOURS = 168; // 7 days — applied if ttlHours is omitted

router.post('/session-contexts/store', checkMcpAuth, async (req, res) => {
  try {
    const { name, content, shared = false, ttlHours: rawTtl = DEFAULT_TTL_HOURS } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');
    const callerId = req.user?.id ?? null;  // null if authMode is none/optional with no token
    const ttlHours = rawTtl === 0 ? null : rawTtl;  // 0 → pin forever (stored as null)

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name },
      defaults: { id: randomUUID(), name, content, isShared: shared, ttlHours, createdBy: callerId }
    });
    if (!created) {
      // Only allow update if caller owns it, or context is ownerless (createdBy null)
      if (ctx.createdBy !== null && ctx.createdBy !== callerId) {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      await ctx.update({ content, isShared: shared, ttlHours });
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
    res.json(all.map(c => {
      const expiresAt = c.ttlHours != null
        ? new Date(new Date(c.updatedAt).getTime() + c.ttlHours * 3600000).toISOString()
        : null;
      return {
        name:      c.name,
        isShared:  c.isShared,
        mine:      callerId ? c.createdBy === callerId : false,
        updatedAt: c.updatedAt,
        ttlHours:  c.ttlHours,   // null = pinned (never expires)
        expiresAt,               // ISO timestamp of expiry, or null if pinned
        chars:     c.content.length
      };
    }));
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
  description: `Save a named context to MCPConnect for later retrieval across sessions or by teammates.

Visibility: private by default. Set shared=true to make it readable by any MCPConnect user.

Expiry (TTL): contexts expire based on their last write time — reading a context does NOT reset the clock, only writing does.
- Default: 168 hours (7 days) from the last store call.
- To pin permanently: pass ttlHours=0.
- To refresh the clock on an active context: call store-session-context again with the same name and content.

Before storing, if the user has not specified how long to keep this context, ask them:
  "Should this context expire after 7 days, or would you like to keep it permanently? (default: 7 days)"
If the user does not answer or says they don't mind, use the default (omit ttlHours).

When listing or reading contexts, if any context is expiring within 24 hours, proactively tell the user and offer to refresh it.`,
  endpoint: {
    path: '/api/mcp/session-contexts/store',
    method: 'POST',
    params: {
      name:     { type: 'string',  required: true,  description: 'Unique human-readable key, e.g. "bitbucket-debug". The first creator owns the name; others cannot overwrite it.' },
      content:  { type: 'string',  required: true,  description: 'The context to store — markdown, JSON, bullet list, anything useful to another session.' },
      shared:   { type: 'boolean', required: false, description: 'If true, any MCPConnect user can read this context. Default false (private).' },
      ttlHours: { type: 'number',  required: false, description: 'Hours until this context expires, measured from its last write. Default 168 (7 days). Pass 0 to pin permanently (never expires). Calling store-session-context again on the same name resets the expiry clock.' }
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
- Each row shows a live **Expires** countdown (ticks every minute) — **Pinned** badge for permanent contexts
- Countdown is color-coded: normal when > 24 h remaining, amber when 1-24 h, red when < 1 h
- Rows the current user owns show a **Share / Unshare** toggle and a **Delete** button
- Rows owned by others (shared contexts) show no edit controls
- The modal shows shared status, expiry, and size

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

// Returns { label, urgency } for a context's TTL.
// urgency: 'pinned' | 'ok' | 'soon' | 'urgent'
function expiryInfo(ctx, now) {
  if (ctx.ttlHours == null) return { label: 'Pinned', urgency: 'pinned' };
  const expiresAt = new Date(ctx.updatedAt).getTime() + ctx.ttlHours * 3600000;
  const msLeft = expiresAt - now;
  if (msLeft <= 0) return { label: 'Expired', urgency: 'urgent' };
  const hLeft = msLeft / 3600000;
  if (hLeft < 1) {
    const mLeft = Math.ceil(msLeft / 60000);
    return { label: `${mLeft}m`, urgency: 'urgent' };
  }
  if (hLeft < 24) {
    const h = Math.floor(hLeft);
    const m = Math.floor((hLeft - h) * 60);
    return { label: `${h}h ${m}m`, urgency: 'soon' };
  }
  const d = Math.floor(hLeft / 24);
  const h = Math.floor(hLeft % 24);
  return { label: `${d}d ${h}h`, urgency: 'ok' };
}

export default function SessionContexts() {
  const { token, user } = useAuth();
  const [contexts, setContexts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [now, setNow]           = useState(Date.now());

  // Tick every minute so countdowns update without a page refresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/session-contexts', token);
      setContexts(Array.isArray(data) ? data : (data?.data || data?.contexts || []));
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
          <p>From your AI session, call <code>store-session-context</code> with a name and content.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Visibility</th>
              <th>Expires</th>
              <th>Updated</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contexts.map(ctx => {
              const { label, urgency } = expiryInfo(ctx, now);
              return (
                <tr key={ctx.id} onClick={() => setSelected(ctx)} className="clickable-row">
                  <td><code>{ctx.name}</code></td>
                  <td>
                    <span className={`badge ${ctx.isShared ? 'badge-green' : 'badge-muted'}`}>
                      {ctx.isShared ? 'Shared' : 'Private'}
                    </span>
                  </td>
                  <td>
                    <span className={`expiry expiry-${urgency}`}>{label}</span>
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
              );
            })}
          </tbody>
        </table>
      )}

      {selected && (() => {
        const { label, urgency } = expiryInfo(selected, now);
        return (
          <div className="modal-overlay" onClick={() => setSelected(null)}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{selected.name}</h2>
                <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="modal-meta">
                  <span>{selected.isShared ? '🌐 Shared' : '🔒 Private'}</span>
                  <span>Expires: <span className={`expiry expiry-${urgency}`}>{label}</span></span>
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
        );
      })()}
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

/* TTL expiry countdown */
.expiry { font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.expiry-pinned { color: var(--text-light); }
.expiry-ok     { color: var(--text-light); }
.expiry-soon   { color: var(--warning, #d97706); font-weight: 600; }
.expiry-urgent { color: var(--danger,  #e53e3e); font-weight: 600; }
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

#### 7. Cleanup job — `server/src/services/session-context-cleanup.js`

Background job that deletes expired contexts. A row is expired when its `ttlHours`
is not null AND `updatedAt + ttlHours hours < NOW()`. The job runs once at server
startup and then every hour via `setInterval`.

```js
'use strict';

const { Op } = require('sequelize');

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function runCleanup(loadModels) {
  try {
    const { SessionContext } = loadModels();
    const candidates = await SessionContext.findAll({
      where: { ttlHours: { [Op.ne]: null } },
      attributes: ['id', 'updatedAt', 'ttlHours']
    });
    const now = Date.now();
    const expiredIds = candidates
      .filter(c => now > new Date(c.updatedAt).getTime() + c.ttlHours * 3600000)
      .map(c => c.id);
    if (expiredIds.length > 0) {
      await SessionContext.destroy({ where: { id: { [Op.in]: expiredIds } } });
      console.log(`[session-context-cleanup] Deleted ${expiredIds.length} expired context(s)`);
    }
  } catch (err) {
    console.error('[session-context-cleanup] Cleanup error:', err.message);
  }
}

function startCleanupJob(loadModels) {
  runCleanup(loadModels);
  setInterval(() => runCleanup(loadModels), INTERVAL_MS);
}

module.exports = { startCleanupJob };
```

The JS-filter approach (load candidates, compute expiry in JS) avoids SQL dialect
differences between SQLite, PostgreSQL, and MySQL.

**Wiring into server startup** — in `server/src/server.js` (or wherever the app
initialises after the DB sync):

```js
const { startCleanupJob } = require('./services/session-context-cleanup');
const { loadModels } = require('./config/database');

// After sequelize.sync():
startCleanupJob(loadModels);
```

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
| `server/src/config/database.js` | Register `SessionChannel` model in `loadModels()` (same pattern as `SessionContext`) |
| `server/src/routes/index.js` | Register router under `/session-channels` |
| `server/src/mcp/server.js` | Register 4 new MCP tools |
| `client/src/App.jsx` | Add `/session-channels` route |
| `client/src/components/Sidebar.jsx` | Replace flat "Session Contexts" link with collapsible "Sessions" group |
| `client/src/pages/SessionContexts.jsx` | Replace emojis with Lucide icons |
| `client/src/index.css` | Add collapsible nav group styles |

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
      type: DataTypes.UUID,
      allowNull: true
      // no references — FK constraint on model causes sequelize.sync() failure (same as SessionContext)
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
        type: Sequelize.UUID,
        allowNull: true
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
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');

const router = express.Router();

// GET /session-channels — list distinct channels with count and last activity
router.get('/', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const { sequelize } = SessionChannel;
    const rows = await SessionChannel.findAll({
      attributes: [
        'channel',
        [sequelize.fn('COUNT', sequelize.col('id')), 'messageCount'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastActivity']
      ],
      group: ['channel'],
      order: [[sequelize.literal('lastActivity'), 'DESC']]
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /session-channels/:channel — read messages, optional ?since=ISO timestamp
router.get('/:channel', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const where = { channel: req.params.channel };
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (isNaN(since)) return res.status(400).json({ error: 'Invalid since timestamp' });
      where.createdAt = { [Op.gt]: since };
    }
    const messages = await SessionChannel.findAll({
      where,
      order: [['createdAt', 'ASC']]
      // No User include — no belongsTo association defined (same pattern as SessionContext)
      // createdBy UUID is returned as-is in each row
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
router.post('/', auth, async (req, res) => {
  const { error, value } = appendSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { SessionChannel } = loadModels();
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
router.delete('/:channel', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
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
    const { SessionChannel } = loadModels();
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
    const { SessionChannel } = loadModels();
    const { Op } = require('sequelize');
    const where = { channel };
    if (since) where.createdAt = { [Op.gt]: new Date(since) };

    const messages = await SessionChannel.findAll({
      where,
      order: [['createdAt', 'ASC']]
      // No User include — no belongsTo association defined (same pattern as SessionContext)
    });

    if (messages.length === 0) {
      return { content: [{ type: 'text', text: since ? `No new messages in '${channel}' since ${since}.` : `Channel '${channel}' is empty.` }] };
    }

    const lines = messages.map(m => {
      const ts = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
      return `[${ts}] ${m.message}`;
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
    const { SessionChannel } = loadModels();
    const { sequelize } = SessionChannel;
    const rows = await SessionChannel.findAll({
      attributes: [
        'channel',
        [sequelize.fn('COUNT', sequelize.col('id')), 'messageCount'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastActivity']
      ],
      group: ['channel'],
      order: [[sequelize.literal('lastActivity'), 'DESC']]
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
    const { SessionChannel } = loadModels();
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
import { useAuth } from '../context/AuthContext';
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
      setChannels(Array.isArray(data) ? data : (data?.data || data?.channels || []));
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (channel) => {
    setLoadingMessages(true);
    try {
      const data = await api.get(`/session-channels/${encodeURIComponent(channel)}`, token);
      setMessages(Array.isArray(data) ? data : (data?.data || data?.messages || []));
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

Register in `App.jsx`:

```jsx
import SessionChannels from './pages/SessionChannels';
// ...
<Route path="/session-channels" element={<SessionChannels />} />
```

---

#### 6. Sidebar navigation — collapsible "Sessions" group

Both Session Contexts and Session Channels live under a single collapsible **Sessions**
group in the sidebar. The group shows a right-pointing chevron that rotates down when
expanded. Clicking the group header toggles it open/closed. No hover-open — click is
more predictable on all screen sizes.

**Icons** — use [Lucide React](https://lucide.dev) throughout. Install if not already
present: `npm install lucide-react`. Replace all emoji usage with Lucide icons across
both session pages as well.

| Location | Emoji removed | Lucide icon to use |
|----------|-------------|-------------------|
| Sidebar — Sessions group | - | `<Layers size={16} />` |
| Sidebar — Contexts sub-item | - | `<FileStack size={16} />` |
| Sidebar — Channels sub-item | - | `<MessagesSquare size={16} />` |
| Sidebar — expand indicator | - | `<ChevronRight size={14} />` (rotates 90° when open) |
| SessionContexts empty state | 💬 | `<MessageSquare size={40} strokeWidth={1.5} />` |
| SessionContexts modal — shared | 🌐 | `<Globe size={14} />` |
| SessionContexts modal — private | 🔒 | `<Lock size={14} />` |

**Sidebar component changes** — replace the existing flat `Session Contexts` NavLink
with a collapsible group. Adapt to whichever pattern the existing sidebar uses for
active state and styling.

```jsx
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Layers, FileStack, MessagesSquare, ChevronRight } from 'lucide-react';

function SessionsNavGroup() {
  const location = useLocation();
  const isSessionRoute = location.pathname.startsWith('/session');
  const [open, setOpen] = useState(isSessionRoute); // auto-open when on a session page

  return (
    <div className="nav-group">
      <button
        className={`nav-group-header ${isSessionRoute ? 'active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <Layers size={16} />
        <span>Sessions</span>
        <ChevronRight
          size={14}
          className="nav-group-chevron"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div className="nav-group-children">
          <NavLink to="/session-contexts" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <FileStack size={16} />
            <span>Contexts</span>
          </NavLink>
          <NavLink to="/session-channels" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <MessagesSquare size={16} />
            <span>Channels</span>
          </NavLink>
        </div>
      )}
    </div>
  );
}
```

**CSS additions** in `client/src/index.css`:

```css
/* Collapsible nav group */
.nav-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 12px;
  color: var(--text-light);
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  border-radius: 6px;
}
.nav-group-header:hover,
.nav-group-header.active { color: var(--text); background: var(--surface-hover); }

.nav-group-chevron { margin-left: auto; transition: transform 0.15s ease; }

.nav-group-children { padding-left: 12px; }
.nav-group-children .nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-light);
  text-decoration: none;
}
.nav-group-children .nav-link:hover,
.nav-group-children .nav-link.active { color: var(--text); background: var(--surface-hover); }
```

---

#### 7. End-to-end test (manual)

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
