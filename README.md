# MCP Depot

**Connect your integrations to any AI assistant via Model Context Protocol (MCP)**

MCP Depot is a self-hosted MCP server that exposes your integrations (Jira, GitHub, Confluence, Jenkins, custom APIs) as MCP tools. Connect once, use from Claude Code, Cursor, Windsurf, and more.

[![npm version](https://img.shields.io/npm/v/mcp-depot)](https://www.npmjs.com/package/mcp-depot)
[![Docker](https://img.shields.io/badge/ghcr.io-mcp--depot-blue)](https://github.com/mcp-depot/mcp-depot/pkgs/container/mcp-depot)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-green)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/mcp-depot/mcp-depot)](https://github.com/mcp-depot/mcp-depot)

**[Website](https://mcp-depot.com) · [Live Demo](https://mcp-depot.com/demo) · [Documentation](https://mcp-depot.com/docs.html)**

---

## Features

- **Unified API Gateway** — Connect Jira, GitHub, Confluence, Jenkins, REST APIs, and more
- **MCP Tool Server** — Exposes integrations as MCP tools for AI assistants
- **OpenAPI Import** — Auto-generate tools from OpenAPI specs
- **Composite Tools** — Chain multiple API calls into single AI-invokable tools
- **Response Field Selector** — Pick exactly which JSON fields to return per tool
- **Response Line Filter** — Regex-based line filtering for large text responses (logs, diffs)
- **Per-Integration SSL** — Toggle self-signed certificate support per integration
- **User Management** — Admin UI for creating and managing users
- **OAuth Login** — Secure authentication with Google, GitHub, and custom OIDC
- **Tags** — Organize and filter integrations and skills with tags
- **Session Contexts** — Share AI working context across sessions and teammates
- **Session Channels** — Append-only logs shared across parallel AI sessions
- **CLI Profiles** — Support multiple MCP Depot instances via named profiles
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
Email:    admin@mcp-depot.com
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

### Option 3 — Kubernetes (Helm)

```bash
git clone https://github.com/mcp-depot/mcp-depot
cd mcp-depot

# Install using published images
helm install mcp-depot ./helm/mcp-depot \
  --namespace mcp-depot \
  --create-namespace \
  --set server.image=ghcr.io/mcp-depot/mcp-depot-server:latest \
  --set client.image=ghcr.io/mcp-depot/mcp-depot-client:latest

# Access via port-forward
kubectl port-forward -n mcp-depot svc/mcp-depot-client 8080:80
# Open http://localhost:8080
```

See [docs/KUBERNETES.md](./docs/KUBERNETES.md) for ingress setup, production values, and full configuration reference.

---

## Connecting to Claude Code

### stdio (recommended for npm installs)

1. Install and authenticate:

```bash
npm install -g mcp-depot
mcp-depot --login
```

Follow the prompts to enter your server URL and API key.

2. Register with Claude Code:

```bash
claude mcp add mcp-depot -- mcp-depot --mcp
```

Then use `/mcp` inside Claude Code to verify the connection.

### HTTP (Docker / server with MCP_ENABLED=true)

```json
{
  "mcpServers": {
    "mcp-depot": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp"
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
| `mcp-depot --login --profile work` | Save credentials under a named profile |
| `mcp-depot --mcp` | MCP stdio wrapper (used by AI clients) |
| `mcp-depot --mcp --profile work` | MCP stdio using a specific profile |

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
| `ALLOW_SELF_SIGNED_CERTS` | `false` | Set to `true` to allow self-signed SSL certificates globally. |
| `ADMIN_EMAIL` | `admin@mcp-depot.com` | Admin account email created on first run. |
| `ADMIN_PASSWORD` | *(auto-generated)* | Admin password. Leave blank to auto-generate. |
| `MCP_ENABLED` | `false` | Set to `true` to enable HTTP MCP transport at `/api/mcp`. |
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

## Using MCP Depot Without the UI

MCP Depot can run as a headless API server without the frontend UI.

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
  -d '{"email":"admin@mcp-depot.com","password":"your-password"}'
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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and contribution guidelines.
See [GOVERNANCE.md](./GOVERNANCE.md) for project governance and maintainer process.
