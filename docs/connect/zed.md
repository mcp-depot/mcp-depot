# Connect MCP Depot to Zed

Zed currently supports only stdio transport.

---

## stdio Transport

### Step 1: Install and Login

```bash
npm install -g mcp-depot
mcp-depot --login
```

Follow the prompts to enter your server URL and API key. These are saved to `~/.mcp-depot/config.json`.

### Step 2: Configure Zed

1. Open Zed → **Settings** → **Extensions**
2. Enable **MCP** extension
3. Edit `~/.zed/mcp.json`:

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

### Step 3: Restart Zed

Reload the window (`Cmd+Shift+P` → "Reload Window")

---

## Notes

- Zed MCP support is experimental
- HTTP transport not yet supported in Zed
- If you need HTTP support, [open an issue](https://github.com/zed-industries/zed/issues) requesting it
