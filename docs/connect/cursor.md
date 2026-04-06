# Connect MCPConnect to Cursor

Cursor supports MCP servers via settings. Both HTTP and stdio transports work.

---

## HTTP Transport (Recommended)

### Step 1: Get Your API Key

1. Log in to MCPConnect at `http://localhost:3000`
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy the key

### Step 2: Configure Cursor

1. Open Cursor → **Settings** (or `Cmd+,`)
2. Go to **MCP Servers**
3. Click **Add MCP Server**
4. Enter:
   - **Name**: `mcpconnect`
   - **URL**: `http://localhost:3000/mcp`
   - **Headers**: `Authorization: Bearer YOUR_API_KEY`

Or edit `~/.cursor/mcp.json`:

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

### Step 3: Verify

Restart Cursor. You should see MCPConnect tools available in the AI chat.

---

## stdio Transport

For older Cursor versions:

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

## Troubleshooting

### Server Not Showing
- Restart Cursor after adding the server
- Check the URL is accessible
- Verify your API key is valid
