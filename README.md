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

Opens the admin UI at `http://localhost:3000`. Data stored in `~/.mcpconnect/data.db` (SQLite). No database setup, no Docker required.

### Option 2 — Docker Compose (recommended for teams)

```bash
git clone <repo-url>
cd mcp-depot
docker compose up -d

# Get admin password from logs
docker compose logs server | grep "Password:"

# Login at http://localhost:5173
# Email: admin@mcpconnect.io
# Password: (from logs above)
```

---

## Connecting to Claude Code

Add this to your Claude Code `settings.json`:

```json
{
  "mcpServers": {
    "mcp-depot": {
      "command": "npx",
      "args": ["mcp-depot", "--mcp"]
    }
  }
}
```

---

## CLI Flags

| Command | What it does |
|---------|-------------|
| `npx mcp-depot` | Full stack — server + admin UI + SQLite |
| `npx mcp-depot --mcp` | MCP stdio wrapper only (for Claude Code) |
| `npx mcp-depot --server` | Server only, no UI |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(not set)* | Postgres connection string. When set, SQLite is not used. |
| `SQLITE_PATH` | `~/.mcpconnect/data.db` | Override SQLite file location. Ignored if `DATABASE_URL` is set. |
| `PORT` | `3000` | Port the server listens on. |
| `JWT_SECRET` | *(required)* | Secret for signing auth tokens. Set this in production. |

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
