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
# 1. Clone and start
git clone https://github.com/your-org/mcpconnect.git
cd mcpconnect
docker-compose up -d

# 2. Open browser
open http://localhost:5173

# 3. Login
# Email: admin@mcpconnect.io
# Password: Demo@123
```

That's it! Add integrations, create tools, and connect to your AI assistant.

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
