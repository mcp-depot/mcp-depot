# Connect MCPConnect to Your AI Client

MCPConnect exposes tools via the [Model Context Protocol (MCP)](https://spec.modelcontextprotocol.io/), allowing you to use integrations (JIRA, GitHub, Jenkins, etc.) directly from your AI assistant.

---

## Quick Start

### HTTP Transport (Recommended)

Most clients support HTTP transport - no local process needed.

```json
{
  "mcpServers": {
    "mcpconnect": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### stdio Transport

For clients that only support stdio (Zed, some VS Code extensions):

```json
{
  "mcpServers": {
    "mcpconnect": {
      "command": "npx",
      "args": ["mcpconnect-mcp", "--url", "http://localhost:3000"]
    }
  }
}
```

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

## Getting Your API Key

1. Log in to MCPConnect at `http://localhost:3000`
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy the key (it won't be shown again)

---

## Server Requirements

- MCPConnect server running (Docker Compose or standalone)
- At least one integration configured with tools
- API key generated for authentication

### Docker Compose Setup

```yaml
# In docker-compose.yml
environment:
  - MCP_ENABLED=true
  - MCP_TRANSPORT=http
```

---

## Troubleshooting

### Connection Refused
- Ensure MCPConnect server is running: `curl http://localhost:3000/health`
- Check the URL is correct (no trailing slash)

### 401 Unauthorized
- Verify your API key is correct
- Check the `Authorization` header format: `Bearer YOUR_KEY`

### Tools Not Appearing
- Ensure at least one integration is created with tools
- Try refreshing the MCP connection in your client

---

## Next Steps

- [Setup Claude Code](./claude-code.md)
- [Setup Cursor](./cursor.md)
- [Setup Windsurf](./windsurf.md)
- [Setup Zed](./zed.md)
- [Setup Open WebUI](./open-webui.md)
- [Generic MCP Client](./generic-mcp.md)
