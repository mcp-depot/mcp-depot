# Connect MCP Depot to Claude Code

Claude Code supports both HTTP and stdio transports.

---

## Option 1: stdio Transport (Recommended for npm installs)

### Step 1: Install and Login

```bash
npm install -g mcp-depot
mcp-depot --login
```

Follow the prompts to enter your server URL and API key. These are saved to `~/.mcp-depot/config.json`.

**Where to get your API key:** Log in to MCP Depot → go to **Settings** → scroll to the **API Key Authentication** section → click **Generate New Key**.

### Step 2: Configure Claude Code

Add to `~/.claude.json`:

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

### Step 3: Restart Claude Code

Restart Claude Code or reconnect to load the new MCP server.

### Step 4: Verify

In a Claude Code conversation, type:

```
/mcp
```

You should see mcp-depot listed with your tools available.

---

## Option 2: HTTP Transport (Docker or MCP_ENABLED=true)

The HTTP MCP transport is active when the server is started with `MCP_ENABLED=true`. Docker Compose sets this automatically. For npm installs, start the server with:

```bash
MCP_ENABLED=true mcp-depot
```

### Configure Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcp-depot": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

**Where to get your API key:** Log in to MCP Depot → go to **Settings** → scroll to the **API Key Authentication** section → click **Generate New Key**.

---

## Troubleshooting

### "No MCP servers configured"
- Make sure `~/.claude.json` is valid JSON
- Restart Claude Code after editing

### "Connection refused"
- Check MCP Depot is running: `curl http://localhost:3000/health`
- Verify the URL in your config

### "401 Unauthorized" (stdio)
- Re-run `mcp-depot --login` to refresh credentials in `~/.mcp-depot/config.json`
- Check the API key is still active in Settings

### Tools Not Showing
- Verify you have integrations with active tools in MCP Depot
- Use `/mcp` in Claude Code to see the current server status
