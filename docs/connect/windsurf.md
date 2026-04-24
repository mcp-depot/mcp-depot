# Connect MCP Depot to Windsurf

Windsurf supports MCP via configuration file. Both transports work.

---

## HTTP Transport (Recommended)

### Step 1: Get Your API Key

1. Log in to MCP Depot at `http://localhost:3000`
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy the key

### Step 2: Configure Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "mcp-depot": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

If the file doesn't exist, create it.

### Step 3: Restart Windsurf

Close and reopen Windsurf to load the MCP server.

---

## stdio Transport

```json
{
  "mcpServers": {
    "mcp-depot": {
      "command": "npx",
      "args": ["mcp-depot", "--mcp"]
    }
  }
}
```

> Run `mcp-depot --login` once first to save your server URL and API key.

---

## Troubleshooting

### Config Not Loading
- Ensure valid JSON in `mcp_config.json`
- Check file permissions
- Restart Windsurf after changes
