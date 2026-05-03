# Developer Instructions

> This folder is untracked and ignored — safe for internal notes, planning docs, and review files.
> Use `internal/FEATURES.md` for new feature proposals and `internal/FIX_SUGGESTED.md` for bug tracking.

---

## Pending Action Items

### 1. Commit `.gitignore` changes

```sh
git add .gitignore
git commit -m "Update .gitignore — exclude SQL backups and server/node_modules"
```

Make sure `.gitignore` includes:
```
scripts/backups/
*.sql
*.sql.gz
server/node_modules/
```

---

### 2. Commit `server/package-lock.json`

Changed because `sqlite3` was added. Commit it:

```sh
git add server/package-lock.json
git commit -m "Update package-lock — add sqlite3 dependency"
```

---

### 3. Update package name to `mcp-depot`

In root `package.json`:

```json
{
  "name": "mcp-depot",
  "version": "1.0.0",
  "bin": {
    "mcp-depot": "./bin/cli.js"
  }
}
```

```sh
git add package.json
git commit -m "Rename package to mcp-depot"
```

---

### 4. Re-link local install after rename

```sh
npm link
```

Update Claude Code MCP entry:

```sh
claude mcp remove mcpconnect
claude mcp add mcpconnect -- mcp-depot --mcp
```

---

### 5. Remove CLEANUP.md from repo

Once all cleanup is done:

```sh
git rm CLEANUP.md
git commit -m "Remove CLEANUP.md — pre-publish checklist complete"
```

---

### 6. demo-mcp — move to examples/

Consider renaming `demo-mcp/` to `examples/demo-mcp/` and mentioning it in README
as a starter MCP server for testing the External MCP feature.

---

## Before First npm Publish

1. Check name is free: `npm info mcp-depot` — expect 404
2. Build client: `npm run build:client`
3. Dry run: `npm pack --dry-run` — verify only `bin/`, `server/src/`, `client/dist/` included
4. Login: `npm login`
5. Publish: `npm publish`

---

## Going Forward

- New feature proposals → `internal/FEATURES.md`
- Bug tracking / fix suggestions → `internal/FIX_SUGGESTED.md`
- Any internal notes / decisions → add a new `.md` file in `internal/`
- This folder is in `.gitignore` — nothing here will be committed or published

---

## Rename: MCPConnect → MCP Depot

All user-facing strings, class names, and identifiers currently say `MCPConnect` or `mcpconnect`. They should be updated to `MCP Depot`, `mcp-depot`, or `mcpdepot` as appropriate. **Do not rename the PostgreSQL database** (`mcpconnect` in `env.js`) - that is a deployment-time value controlled by the operator.

**Fresh installs** - update the seed code in `database.js` (names, descriptions, variables). New installs will see `MCP Depot` from day one.

**Existing installs** - the DB records already say `MCPConnect`. The developer must run the SQL script below once against their existing database. The PostgreSQL database name (`mcpconnect`) does not need to change.

```sql
-- Run once on existing installs after deploying the updated seed code
UPDATE integrations SET name = 'MCP Depot', description = 'Built-in MCP Depot API' WHERE name = 'MCPConnect';
UPDATE integrations SET name = 'MCP Depot Sessions' WHERE name = 'MCPConnect Sessions';
```

The client guard `integration.name === 'MCPConnect'` (Integrations.jsx lines 715-717) must be updated to `'MCP Depot'` in the same PR as the seed change, so the delete-protection still works on fresh installs.

---

### `bin/cli.js`

| Location | Current value | Replace with |
|----------|--------------|--------------|
| Lines 19, 29, 212, 226 | `.mcpconnect` (config/DB directory) | `.mcp-depot` |

> **Warning:** Renaming `.mcpconnect` to `.mcp-depot` breaks existing user installs - their `config.json` and `data.db` will not be found. Add a one-time migration at startup: if `~/.mcpconnect/` exists and `~/.mcp-depot/` does not, rename/copy the directory and log a notice to the user.

**Banner fix (lines 33-38 approx.)** - current box chars are misaligned on many terminals. Replace with:

```js
console.log(`
┌────────────────────────────────┐
│           mcp-depot            │
│    connect · sync · control    │
└────────────────────────────────┘
`);
```

The inner width is 32 chars. "mcp-depot" (9) is padded 11 left + 12 right. "connect · sync · control" (24) is padded 4 each side. Box chars are U+250C/250D/2514/2518/2502/2500 - these render correctly in all modern terminals.

---

### `server/package.json`

| Field | Current | Replace with |
|-------|---------|--------------|
| `name` | `mcpconnect-server` | `mcp-depot-server` |
| `description` | `MCPConnect - API Gateway...` | `MCP Depot - API Gateway...` |

---

### `server/src/index.js`

| Line | Current | Replace with |
|------|---------|--------------|
| 167 | `'MCPConnect Server started'` | `'MCP Depot server started'` |

---

### `server/src/mcp-server.js`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 8, 87 | `class MCPConnectClient` | `class MCPDepotClient` |

---

### `server/src/mcp/server.js`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 50, 437 | `class MCPConnectServer` / `new MCPConnectServer()` | `class MCPDepotServer` / `new MCPDepotServer()` |
| 66 | `name: 'mcpconnect'` | `name: 'mcp-depot'` |

> **Note:** The `name` field on line 66 is the MCP server identifier exposed to Claude. Changing it changes how Claude sees the server. Coordinate with users who have the server already configured.

---

### `server/src/config/database.js`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 86, 129 | `'admin@mcpconnect.io'` | `'admin@mcpdepot.io'` |
| 122, 128, 129, 139, 297, 329, 437 | `mcpconnectIntegration` (variable) | `mcpDepotIntegration` |
| 142 | `name: 'MCPConnect'` | `name: 'MCP Depot'` |
| 143 | `'Built-in MCPConnect API'` | `'Built-in MCP Depot API'` |
| 153, 155, 169, 248, 249, 253, 258, 263, 336, 341, 346, 351 | descriptions containing `MCPConnect` | Replace `MCPConnect` with `MCP Depot` |
| 223 | `'Default MCPConnect tools created!'` | `'Default MCP Depot tools created!'` |
| 225, 227, 234, 295, 304, 306, 313, 320 | `'MCPConnect Sessions'` | `'MCP Depot Sessions'` |
| 444 | `'Additional MCPConnect tools added!'` | `'Additional MCP Depot tools added!'` |

---

### `server/src/routes/mcp.js`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 108 | `'Hello from MCPConnect!'` | `'Hello from MCP Depot!'` |
| 346, 1210 | `'User-Agent': 'MCPConnect/1.0'` | `'User-Agent': 'MCP-Depot/1.0'` |
| 960 | `name: 'MCPConnect API'` | `name: 'MCP Depot API'` |
| 962 | `'MCPConnect - Connect your integrations...'` | `'MCP Depot - Connect your integrations...'` |
| 998 | `'Use mcp-connect wrapper: mcp-connect ...'` | `'Use mcp-depot wrapper: mcp-depot --mcp'` |

---

### `server/src/services/metrics.js`

| Line | Current | Replace with |
|------|---------|--------------|
| 3 | `{ app: 'mcpconnect' }` | `{ app: 'mcp-depot' }` |

---

### `server/src/routes/system.js`

| Line | Current | Replace with |
|------|---------|--------------|
| 128 | `'mcpconnect-export.json'` | `'mcp-depot-export.json'` |

---

### `client/src/components/Navbar.jsx`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 21 | `alt="MCPConnect Logo"` | `alt="MCP Depot Logo"` |
| 22 | `MCPConnect` (text node) | `MCP Depot` |

---

### `client/src/components/Sidebar.jsx`

| Line | Current | Replace with |
|------|---------|--------------|
| 68 | `MCPConnect` (sidebar brand text) | `MCP Depot` |

---

### `client/src/pages/Login.jsx`

| Line | Current | Replace with |
|------|---------|--------------|
| 57 | `<h2>MCPConnect</h2>` | `<h2>MCP Depot</h2>` |

---

### `client/src/pages/Register.jsx`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 47, 68 | `<h2>MCPConnect</h2>` | `<h2>MCP Depot</h2>` |

---

### `client/src/pages/Workflows.jsx`

| Line | Current | Replace with |
|------|---------|--------------|
| 169 | `MCPConnect` (navbar brand link) | `MCP Depot` |

---

### `client/src/pages/Integrations.jsx`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 344 | `mcpconnect-integrations-` (download filename) | `mcp-depot-integrations-` |
| 715, 716, 717 | `integration.name === 'MCPConnect'` | `integration.name === 'MCP Depot'` |

> **Note:** Lines 715-717 guard the delete button on the built-in integration. The string must match the seeded integration name exactly - update in the same PR as the seed change in `database.js`.

---

### `client/src/pages/Settings.jsx`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 108 | `mcp-connect --login` | `mcp-depot --login` |
| 120 | `claude mcp add mcpconnect -- mcp-connect` | `claude mcp add mcp-depot -- mcp-depot --mcp` |
| 125 | `opencode mcp add mcpconnect -- mcp-connect` | `opencode mcp add mcp-depot -- mcp-depot --mcp` |
| 130 | `mcp-connect` (code block) | `mcp-depot --mcp` |
| 137 | `mcp-connect --login` (error tip) | `mcp-depot --login` |
| 140 | hardcoded Windows path with `mcp-connect` | remove or replace with `~/.mcp-depot/config.json` |
| 389, 392 | `MCPConnect programmatically` / `via MCPConnect` | `MCP Depot programmatically` / `via MCP Depot` |
| 717 | `from other MCPConnect instances` | `from other MCP Depot instances` |
| 754 | `mcpconnect-export-` (download filename) | `mcp-depot-export-` |

---

### `client/src/pages/Tools.jsx`

| Lines | Current | Replace with |
|-------|---------|--------------|
| 1271, 1281, 1287, 1293, 1317, 1328, 1335, 1342 | `Using MCPConnect tools` / `Using MCPConnect JIRA tools` / etc. | `Using MCP Depot tools` / `Using MCP Depot JIRA tools` / etc. |

---

### `client/src/pages/Skills.jsx`

| Line | Current | Replace with |
|------|---------|--------------|
| 224 | `Connect to MCPConnect via MCP` | `Connect to MCP Depot via MCP` |
