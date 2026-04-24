# Connect MCP Depot to Claude Code

Claude Code supports both HTTP and stdio transports. HTTP is recommended.

---

## Option 1: HTTP Transport (Recommended)

### Step 1: Get Your API Key

1. Log in to MCP Depot at `http://localhost:3000`
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy the key

### Step 2: Configure Claude Code

Edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcp-depot": {
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

You should see your MCP Depot tools listed.

---

## Option 2: stdio Transport

### Step 1: Install and Login

```bash
npm install -g mcp-depot
mcp-depot --login
```

Follow the prompts to enter your server URL and API key. These are saved to `~/.mcp-depot/config.json`.

### Step 2: Configure

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

## Troubleshooting

### "No MCP servers configured"
- Make sure `~/.claude.json` is valid JSON
- Restart Claude Code after editing

### "Connection refused"
- Check MCP Depot is running: `curl http://localhost:3000/health`
- Verify the URL in your config

### "401 Unauthorized"
- Regenerate your API key in MCP Depot
- Check the Authorization header format

### Tools Not Showing
- Verify you have integrations with tools in MCP Depot
- Type `/mcp list` to see all available tools
