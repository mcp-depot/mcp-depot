# mcp-depot

**Connect your integrations to any AI assistant via Model Context Protocol (MCP)**

mcp-depot is a self-hosted MCP server that exposes your integrations (Jira, GitHub, Confluence, Jenkins, custom APIs) as MCP tools. Connect once, use from Claude Code, Cursor, Windsurf, and more.

---

## Features

- **Unified API Gateway** — Connect Jira, GitHub, Confluence, Jenkins, REST APIs, and more
- **MCP Tool Server** — Exposes integrations as MCP tools for AI assistants
- **OpenAPI Import** — Auto-generate tools from OpenAPI specs
- **Composite Tools** — Chain multiple API calls into single AI-invokable tools
- **User Management** — Admin UI for creating and managing users
- **OAuth Login** — Secure authentication with Google and GitHub
- **Tags** — Organize and filter Integrations and Skills with tags
- **Session Contexts** — Share AI working context across sessions and teammates
- **Session Channels** — Append-only logs shared across parallel AI sessions
- **Workflow Automation** — Chain tools into automated workflows
- **Monitoring** — Track tool usage, response times, and errors
- **Encryption** — Sensitive credentials encrypted at rest
- **Secret Store** — Optional integration with Infisical for enterprise secrets management

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
| `DATABASE_URL` | *(not set)* | PostgreSQL connection string. When set, SQLite is not used. |
| `SQLITE_PATH` | `~/.mcp-depot/data.db` | Override SQLite file location. Ignored if `DATABASE_URL` is set. |
| `PORT` | `3000` | Port the server listens on. |
| `SERVE_CLIENT` | `true` | Set to `false` to disable frontend (API-only mode). |
| `NODE_ENV` | `development` | Set to `production` for production deployments. |
| `JWT_SECRET` | *(required)* | Secret for signing auth tokens. Set this in production. |
| `JWT_REFRESH_SECRET` | *(required)* | Secret for refresh tokens. |
| `JWT_EXPIRE` | `15m` | JWT access token expiration. |
| `JWT_REFRESH_EXPIRE` | `7d` | JWT refresh token expiration. |
| `ENCRYPTION_KEY` | *(required)* | 32-byte key for encrypting sensitive data. |
| `LOG_LEVEL` | `info` | Logging level: trace, debug, info, warn, error, fatal. |
| `ALLOWED_ORIGINS` | *(not set)* | CORS allowed origins (comma-separated). |
| `ALLOW_REGISTRATION` | `true` | Set to `false` to disable user self-registration. |
| `ALLOW_SELF_SIGNED_CERTS` | `false` | Set to `true` to allow self-signed SSL certificates. |
| `ADMIN_EMAIL` | `admin@mcp-depot.io` | Admin account email created on first run. |
| `ADMIN_PASSWORD` | *(auto-generated)* | Admin password. Leave blank to auto-generate. |
| `MCP_ENABLED` | `false` | Set to `true` to enable HTTP MCP transport at `/mcp`. |
| `MCP_TRANSPORT` | `http` | MCP transport type: `http` or `stdio`. |
| `API_BASE_URL` | *(not set)* | Public URL for MCP server (used in tool schemas). |
| `TOOLS_CACHE_ENABLED` | `false` | Set to `true` to enable tools caching. |
| `TOOLS_CACHE_TTL` | `300000` | Tools cache TTL in milliseconds. |
| `RATE_LIMIT_DEFAULT_RPM` | `60` | Default requests per minute for integrations. |
| `RATE_LIMIT_DEFAULT_RPH` | `1000` | Default requests per hour for integrations. |
| `GOOGLE_CLIENT_ID` | *(not set)* | OAuth Google client ID. |
| `GOOGLE_CLIENT_SECRET` | *(not set)* | OAuth Google client secret. |
| `GITHUB_CLIENT_ID` | *(not set)* | OAuth GitHub client ID. |
| `GITHUB_CLIENT_SECRET` | *(not set)* | OAuth GitHub client secret. |
| `OIDC_ENABLED` | `false` | Enable custom OIDC (Keycloak, Okta, Auth0). |
| `OIDC_ISSUER_URL` | *(not set)* | OIDC provider URL. |
| `OIDC_CLIENT_ID` | *(not set)* | OIDC client ID. |
| `OIDC_CLIENT_SECRET` | *(not set)* | OIDC client secret. |
| `OIDC_DISPLAY_NAME` | `Login with SSO` | OIDC button label. |
| `ENABLED_FEATURES` | `all` | Comma-separated features to enable: integrations,tools,skills,sessions,channels,users. |
| `SECRET_STORE_ENABLED` | `false` | Enable Infisical secret store integration. |
| `SECRET_STORE_SITE_URL` | *(not set)* | Infisical site URL. |
| `SECRET_STORE_CLIENT_ID` | *(not set)* | Infisical client ID. |
| `SECRET_STORE_CLIENT_SECRET` | *(not set)* | Infisical client secret. |
| `SECRET_STORE_WORKSPACE_ID` | *(not set)* | Infisical workspace ID. |
| `SECRET_STORE_ENVIRONMENT` | `dev` | Infisical environment name. |

---

## Using mcp-depot Without the UI

mcp-depot can run as a headless API server without the frontend UI.

### Enable API-Only Mode

```bash
SERVE_CLIENT=false docker compose up -d
```

Or set in `.env`:
```
SERVE_CLIENT=false
```

### API Reference

The REST API is available at `http://localhost:3000/api/v1`:

| Endpoint | Description |
|----------|-------------|
| `POST /auth/login` | Login with email/password |
| `POST /auth/refresh` | Refresh access token |
| `GET /integrations` | List all integrations |
| `POST /integrations` | Create new integration |
| `GET /integrations/:id` | Get integration details |
| `PUT /integrations/:id` | Update integration |
| `DELETE /integrations/:id` | Delete integration |
| `POST /integrations/:id/test` | Test integration connection |
| `GET /tools` | List all MCP tools |
| `GET /skills` | List all skills |
| `GET /skills/:id` | Get skill details |

### Authentication

1. Login to get access + refresh tokens:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mcpdepot.io","password":"your-password"}'
```

2. Use access token in subsequent requests:
```bash
curl http://localhost:3000/api/v1/integrations \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

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
