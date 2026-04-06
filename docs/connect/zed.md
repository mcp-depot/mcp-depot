# Connect MCPConnect to Zed

Zed currently supports only stdio transport.

---

## stdio Transport

### Step 1: Get Your API Key

1. Log in to MCPConnect at `http://localhost:3000`
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy the key

### Step 2: Configure Zed

1. Open Zed → **Settings** → **Extensions**
2. Enable **MCP** extension
3. Edit `~/.zed/mcp.json`:

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

### Step 3: Restart Zed

Reload the window (`Cmd+Shift+P` → "Reload Window")

---

## Notes

- Zed MCP support is experimental
- HTTP transport not yet supported in Zed
- If you need HTTP support, [open an issue](https://github.com/zed-industries/zed/issues) requesting it
