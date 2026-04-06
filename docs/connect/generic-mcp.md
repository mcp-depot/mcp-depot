# Connect MCPConnect to Any MCP Client

This guide covers the generic MCP configuration that works with most clients.

---

## HTTP Transport (Recommended)

Most modern MCP clients support HTTP transport. This is the simplest setup.

### Configuration

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

### Alternative Header Formats

Some clients use different header formats:

```json
{
  "url": "http://localhost:3000/mcp",
  "headers": {
    "x-api-key": "YOUR_API_KEY"
  }
}
```

```json
{
  "url": "http://localhost:3000/mcp?api_key=YOUR_API_KEY"
}
```

---

## stdio Transport

For clients that only support stdio (legacy or limited clients).

### Configuration

```json
{
  "mcpServers": {
    "mcpconnect": {
      "command": "npx",
      "args": [
        "mcpconnect-mcp",
        "--url", "http://localhost:3000",
        "--api-key", "YOUR_API_KEY"
      ]
    }
  }
}
```

### With Custom Script

```json
{
  "mcpServers": {
    "mcpconnect": {
      "command": "node",
      "args": ["/path/to/mcpconnect-mcp.cjs", "--url", "http://localhost:3000"]
    }
  }
}
```

---

## Client-Specific Notes

### VS Code (Copilot)

Create `.vscode/mcp.json`:

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

### JetBrains (IDEA, WebStorm, etc.)

Add to `idea.properties` or use the MCP plugin settings:

```properties
mcp.servers.mcpconnect.type=http
mcp.servers.mcpconnect.url=http://localhost:3000/mcp
mcp.servers.mcpconnect.headers.Authorization=Bearer YOUR_API_KEY
```

### Ollama (with llama.cpp)

Ollama doesn't natively support MCP, but you can use the [mcp-ollama](https://github.com/jlumbroso/mcp-ollama) bridge:

```bash
npx mcp-ollama --mcp-server http://localhost:3000/mcp
```

---

## Common Issues

### URL Not Reachable
- Check firewall settings
- Verify the server is running
- For Docker, ensure proper network configuration

### Authentication Failed
- Regenerate your API key
- Check header format matches your client's requirements
- Ensure the key has proper permissions

### Tools Not Appearing
- Verify integrations exist in MCPConnect
- Check client MCP logs for errors
- Try restarting the client
