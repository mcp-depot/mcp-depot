# Connect MCP Depot to Windsurf

Windsurf supports MCP via configuration file. Both transports work.

---

## HTTP Transport (Recommended for Docker / MCP_ENABLED=true)

The HTTP MCP transport requires the server to be running with `MCP_ENABLED=true`. Docker Compose sets this automatically.

### Step 1: Get Your API Key

Log in to MCP Depot → go to **Settings** → scroll to the **API Key Authentication** section → click **Generate New Key**.

### Step 2: Configure Windsurf

Edit `~/.codeium/windsurf/mcp_config.json` (create it if it doesn't exist):

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

### Step 3: Restart Windsurf

Close and reopen Windsurf to load the MCP server.

---

## stdio Transport (Recommended for npm installs)

### Step 1: Install and Login

```bash
npm install -g mcp-depot
mcp-depot --login
```

Follow the prompts to save your server URL and API key.

### Step 2: Configure Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

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

### Step 3: Restart Windsurf

Close and reopen Windsurf to load the MCP server.

---

## Troubleshooting

### Config Not Loading
- Ensure valid JSON in `mcp_config.json`
- Check file permissions
- Restart Windsurf after changes

### 401 Unauthorized (HTTP)
- Regenerate your API key in Settings → API Key Authentication
- Confirm the `X-API-Key` header value is correct
