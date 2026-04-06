# Connect MCPConnect to Open WebUI + Ollama

Open WebUI supports MCP servers via HTTP. This is the recommended setup for local AI with Ollama.

---

## HTTP Transport Only

Open WebUI does not support stdio transport - use HTTP only.

### Step 1: Get Your API Key

1. Log in to MCPConnect at `http://localhost:3000`
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy the key

### Step 2: Configure Open WebUI

1. Open Open WebUI (`http://localhost:8080`)
2. Go to **Admin Settings** → **Tools**
3. Add new tool with:
   - **Name**: `mcpconnect`
   - **Base URL**: `http://mcpconnect:3000/mcp`
   - **API Key**: `YOUR_API_KEY`

Or edit `open-webui/.env`:

```env
MCP_SERVERS=[{"name":"mcpconnect","url":"http://mcpconnect:3000/mcp","headers":{"Authorization":"Bearer YOUR_API_KEY"}}]
```

### Step 3: Verify

In the AI chat, you should see MCPConnect tools available.

---

## Docker Compose Setup

```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "8080:8080"
    environment:
      - OllamaBaseURL=http://ollama:11434
      - MCP_SERVERS=[{"name":"mcpconnect","url":"http://mcpconnect-server:3000/mcp","headers":{"Authorization":"Bearer ${MCP_API_KEY}"}}]
    depends_on:
      - ollama
      - mcpconnect-server
```

---

## Troubleshooting

### Tools Not Loading
- Verify MCPConnect is accessible from the Open WebUI container
- Check network configuration in Docker Compose
- Ensure API key is valid

### Connection Refused
- Check service names in Docker network
- Verify ports are correctly mapped
