# mcp-depot

**Connect your integrations to any AI assistant via Model Context Protocol (MCP)**

mcp-depot is a self-hosted MCP server that exposes your integrations (Jira, GitHub, Confluence, Jenkins, custom APIs) as MCP tools. Connect once, use from Claude Code, Cursor, Windsurf, and more.

---

## Features

- **Unified API Gateway** — Connect Jira, GitHub, Confluence, Jenkins, REST APIs, and more
- **MCP Tool Server** — Exposes integrations as MCP tools for AI assistants
- **OpenAPI Import** — Auto-generate tools from OpenAPI specs
- **Session Contexts** — Share AI working context across sessions and teammates
- **Session Channels** — Append-only logs shared across parallel AI sessions
- **Workflow Automation** — Chain tools into automated workflows
- **Monitoring** — Track tool usage, response times, and errors
- **Encryption** — Sensitive credentials encrypted at rest

---

## Quick Start

### Option 1 — npm (zero config)

```bash
npx mcp-depot
```

Opens the admin UI at `http://localhost:3000`. Data stored in `~/.mcp-depot/data.db` (SQLite). No database setup, no Docker required.

Admin credentials are printed to the console on first run. Look for the startup log block:

```
DEFAULT ADMIN USER CREATED
Email:    admin@mcp-depot.io
Password: <generated>
API Key:  <generated>
```

### Option 2 — Docker Compose (recommended for teams)

```bash
git clone https://github.com/mcp-depot/mcp-depot
cd mcp-depot
docker compose up -d

# Get admin credentials from logs
docker compose logs server | grep -E "Email:|Password:|API Key:"

# Login at http://localhost:5173
```

---

## Connecting to Claude Code

### stdio (recommended for npm installs)

1. Install and authenticate:

```bash
npm install -g mcp-depot
mcp-depot --login
```

Follow the prompts to enter your server URL and API key.

2. Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcp-depot": {
      "command": "mcp-depot",
      "args": ["--mcp"]
    }
  }
}
```

### HTTP (Docker / server with MCP_ENABLED=true)

```json
{
  "mcpServers": {
    "mcp-depot": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

See [docs/connect/claude-code.md](./docs/connect/claude-code.md) for full setup guide.

---

## CLI Flags

| Command | What it does |
|---------|-------------|
| `mcp-depot` | Full stack — server + admin UI + SQLite |
| `mcp-depot --server` | Server only, no UI |
| `mcp-depot --port 8080` | Run on a custom port |
| `mcp-depot --login` | Save server URL and API key for stdio transport |
| `mcp-depot --mcp` | MCP stdio wrapper (used by AI clients) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(not set)* | Postgres connection string. When set, SQLite is not used. |
| `SQLITE_PATH` | `~/.mcp-depot/data.db` | Override SQLite file location. Ignored if `DATABASE_URL` is set. |
| `PORT` | `3000` | Port the server listens on. |
| `JWT_SECRET` | *(required)* | Secret for signing auth tokens. Set this in production. |
| `MCP_ENABLED` | `false` | Set to `true` to enable the HTTP MCP transport at `/mcp`. Docker Compose sets this automatically. |
| `ADMIN_EMAIL` | `admin@mcp-depot.io` | Admin account email created on first run. |

---

## Connect to AI Clients

See [docs/connect/README.md](./docs/connect/README.md) for detailed guides:

| Client | Guide |
|--------|-------|
| Claude Code | [docs/connect/claude-code.md](./docs/connect/claude-code.md) |
| Cursor | [docs/connect/cursor.md](./docs/connect/cursor.md) |
| Windsurf | [docs/connect/windsurf.md](./docs/connect/windsurf.md) |
| Zed | [docs/connect/zed.md](./docs/connect/zed.md) |
| Open WebUI | [docs/connect/open-webui.md](./docs/connect/open-webui.md) |

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  AI Client  │────▶│  mcp-depot  │────▶│   Integration    │
│(Claude Code)│     │   Server    │     │(Jira, GitHub ...) │
└─────────────┘     │   :3000     │     └──────────────────┘
                    └─────────────┘
                          │
               ┌──────────┴──────────┐
               │                     │
        ┌──────────────┐    ┌─────────────────┐
        │  PostgreSQL  │    │  SQLite          │
        │  (Docker /   │    │  (npx / local)   │
        │   teams)     │    └─────────────────┘
        └──────────────┘
```

---

## Tech Stack

- **Backend**: Node.js, Express, Sequelize
- **Database**: PostgreSQL (teams/Docker) or SQLite (local/npm)
- **Frontend**: React, Vite
- **Protocol**: Model Context Protocol (MCP)
- **Logging**: Pino
- **Metrics**: Prometheus

---

## License

AGPL-3.0 — see [LICENSE](./LICENSE)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
