# Connect MCP Depot to Your AI Client

MCP Depot exposes tools via the [Model Context Protocol (MCP)](https://spec.modelcontextprotocol.io/), allowing you to use integrations (Jira, GitHub, Jenkins, etc.) directly from your AI assistant.

---

## Which Transport Should I Use?

| Deployment | Recommended transport |
|------------|----------------------|
| npm install (`mcp-depot`) | stdio |
| Docker Compose | HTTP |
| Remote server | HTTP |

---

## stdio Transport

For clients that connect via a local process. Works with any npm install.

**Prerequisite:** Run `mcp-depot --login` once to save your server URL and API key to `~/.mcp-depot/config.json`.

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

---

## HTTP Transport

Requires the server to be running with `MCP_ENABLED=true`. Docker Compose sets this automatically. For npm installs, start with:

```bash
MCP_ENABLED=true mcp-depot
```

**Get your API key:** Log in to MCP Depot → **Settings** → **API Key Authentication** → **Generate New Key**.

```json
{
  "mcpServers": {
    "mcp-depot": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

Replace `localhost:3000` with your server's host and port if running remotely.

---

## Client Compatibility

| Client | HTTP | stdio | Setup Guide |
|--------|------|-------|------------|
| Claude Code | ✅ | ✅ | [claude-code.md](./claude-code.md) |
| Cursor | ✅ | ✅ | [cursor.md](./cursor.md) |
| Windsurf | ✅ | ✅ | [windsurf.md](./windsurf.md) |
| Zed | ❌ | ✅ | [zed.md](./zed.md) |
| Open WebUI + Ollama | ✅ | ❌ | [open-webui.md](./open-webui.md) |
| VS Code (Copilot) | ✅ | ✅ | [generic-mcp.md](./generic-mcp.md) |

---

## Troubleshooting

### Connection Refused
- Ensure MCP Depot is running: `curl http://localhost:3000/health`
- Check the URL is correct (no trailing slash)

### 401 Unauthorized
- Verify your API key is correct
- Check the `X-API-Key` header (not `Authorization: Bearer`)

### Tools Not Appearing
- Ensure at least one integration is created with active tools
- Try refreshing the MCP connection in your client

---

## Next Steps

- [Setup Claude Code](./claude-code.md)
- [Setup Cursor](./cursor.md)
- [Setup Windsurf](./windsurf.md)
- [Setup Zed](./zed.md)
- [Setup Open WebUI](./open-webui.md)
- [Generic MCP Client](./generic-mcp.md)
