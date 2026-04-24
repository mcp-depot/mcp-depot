# Connect MCP Depot to Cursor

Cursor supports MCP servers via settings. Both HTTP and stdio transports work.

---

## HTTP Transport (Recommended for Docker / MCP_ENABLED=true)

The HTTP MCP transport requires the server to be running with `MCP_ENABLED=true`. Docker Compose sets this automatically.

### Step 1: Get Your API Key

Log in to MCP Depot → go to **Settings** → scroll to the **API Key Authentication** section → click **Generate New Key**.

### Step 2: Configure Cursor

Edit `~/.cursor/mcp.json` (create it if it doesn't exist):

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

### Step 3: Verify

Restart Cursor. You should see MCP Depot tools available in the AI chat.

---

## stdio Transport (Recommended for npm installs)

### Step 1: Install and Login

```bash
npm install -g mcp-depot
mcp-depot --login
```

Follow the prompts to save your server URL and API key.

### Step 2: Configure Cursor

Edit `~/.cursor/mcp.json`:

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

### Server Not Showing
- Restart Cursor after editing the config
- Verify the server is accessible: `curl http://localhost:3000/health`

### 401 Unauthorized (HTTP)
- Regenerate your API key in Settings → API Key Authentication
- Confirm the `X-API-Key` header value is correct

### stdio Not Working
- Re-run `mcp-depot --login` to refresh credentials
