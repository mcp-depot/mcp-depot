# Connect MCPConnect to Claude Code

Claude Code supports both HTTP and stdio transports. HTTP is recommended.

---

## Option 1: HTTP Transport (Recommended)

### Step 1: Get Your API Key

1. Log in to MCPConnect at `http://localhost:3000`
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy the key

### Step 2: Configure Claude Code

Edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcpconnect": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Step 3: Restart Claude Code

Restart Claude Code or reconnect to load the new MCP server.

### Step 4: Verify

In a Claude Code conversation, type:

```
/mcp list
```

You should see your MCPConnect tools listed.

---

## Option 2: stdio Transport

If you need stdio (less common for Claude Code):

### Step 1: Install the CLI Wrapper

```bash
npm install -g mcpconnect-mcp
```

### Step 2: Configure

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

---

## Troubleshooting

### "No MCP servers configured"
- Make sure `~/.claude.json` is valid JSON
- Restart Claude Code after editing

### "Connection refused"
- Check MCPConnect is running: `curl http://localhost:3000/health`
- Verify the URL in your config

### "401 Unauthorized"
- Regenerate your API key in MCPConnect
- Check the Authorization header format

### Tools Not Showing
- Verify you have integrations with tools in MCPConnect
- Type `/mcp list` to see all available tools
