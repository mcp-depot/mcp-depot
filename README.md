# MCPConnect

**Connect your integrations to any AI assistant via Model Context Protocol (MCP)**

MCPConnect is an API gateway that exposes your integrations (JIRA, GitHub, Confluence, Jenkins, custom APIs) as MCP tools. Connect once, use from Claude Code, Cursor, Windsurf, and more.

---

## Features

- **Unified API Gateway** — Connect JIRA, GitHub, Confluence, Jenkins, REST APIs, and more
- **MCP Tool Server** — Exposes integrations as MCP tools for AI assistants
- **OpenAPI Import** — Auto-generate tools from OpenAPI specs
- **Workflow Automation** — Chain tools into automated workflows
- **Rate Limiting** — Per-tool rate limits to prevent API throttling
- **Monitoring** — Track tool usage, response times, and errors
- **Encryption** — Sensitive credentials encrypted at rest

---

## Quick Start

```bash
# Option 1 — npm (zero config)
npx mcpconnect

# Option 2 — Docker
git clone https://github.com/mcpconnect/mcpconnect.git
cd mcpconnect
docker-compose up -d

# 2. Open browser
open http://localhost:5173

# 3. Get admin password from server logs
docker-compose logs server | grep "Password:"

# 4. Login with:
# Email: admin@mcpconnect.io
# Password: (password from logs)
```

That's it! Add integrations, create tools, and connect to your AI assistant.

---

## Getting Started

### Option 1 — npm (zero config)

```bash
npx mcpconnect
```

Opens the admin UI at http://localhost:3000. Data is stored in ~/.mcpconnect/data.db (SQLite). No database setup, no Docker required.

### Option 2 — Docker Compose (recommended for teams)

```bash
docker compose up
```

Runs with Postgres. Admin UI at http://localhost:5173, server at http://localhost:3000.

---

## Connecting to Claude Code

Add this to your Claude Code settings.json:

```json
{
  "mcpServers": {
    "mcpconnect": {
      "command": "npx",
      "args": ["mcpconnect", "--mcp"]
    }
  }
}
```

---

## CLI flags

| Command | What it does |
|---------|-------------|
| `npx mcpconnect` | Full stack — server + admin UI + SQLite |
| `npx mcpconnect --mcp` | MCP stdio wrapper only (for Claude Code) |
| `npx mcpconnect --server` | Server only, no UI |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | (not set) | Postgres connection string. When set, SQLite is not used. |
| SQLITE_PATH | ~/.mcpconnect/data.db | Override SQLite file location. Ignored if DATABASE_URL is set. |
| PORT | 3000 | Port the server listens on. |
| JWT_SECRET | (required) | Secret for signing auth tokens. Set this in production. |

---

## Upgrading from Docker to npm

If you were running via Docker and want to switch to npx mcpconnect:

- Set DATABASE_URL to your existing Postgres URL — data is preserved
- Remove the Claude Code MCP config pointing at mcp-connect and replace with the npx mcpconnect --mcp entry above

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
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Client  │────▶│MCPConnect   │────▶│ Integration │
│(Claude Code)│     │   Server    │     │(JIRA, GitHub)│
└─────────────┘     │   :3000     │     └─────────────┘
                   └─────────────┘
                        │
                   ┌─────────────┐
                   │  PostgreSQL │
                   └─────────────┘
```

---

## Tech Stack

- **Backend**: Node.js, Express, Sequelize, PostgreSQL
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
