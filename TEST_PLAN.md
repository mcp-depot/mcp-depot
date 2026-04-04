# MCPConnect Test Plan

This document provides test prompts that can be used with AI coding assistants (like Claude Code, Cursor, OpenCode, etc.) to test the MCPConnect system.

---

## Prerequisite: Run MCPConnect

```bash
cd /path/to/MCPHUB
docker compose up -d
```

Access the UI at: http://localhost:5173

**Login credentials:**
- Email: `admin@mcpconnect.io`
- Password: `Demo@123`

---

## 1. External MCP Server Test

### Goal: Verify external MCP tools can be fetched and executed

**Steps:**
1. Go to **Settings → External MCP**
2. Click **+ Add Server**
3. Configure:
   - Name: `Demo MCP`
   - URL: `http://demo-mcp:3001`
   - Auth Type: `None`
4. Click **Save**
5. Click **Tools** button on the new server
6. Select `echo` tool
7. Enter text parameter: "Hello World"
8. Click **Run**

**Expected Result:**
```json
{"success":true,"tool":"echo","source":"external","result":{"success":true,"result":{"echo":"Hello World"}}}
```

---

## 2. Integration Test

### Goal: Create a JIRA integration and fetch an issue

**Steps:**
1. Go to **Integrations**
2. Click **Add Integration**
3. Select Type: **JIRA**
4. Configure:
   - Name: `JIRA Test`
   - Base URL: `https://your-domain.atlassian.net`
   - Auth Type: `Basic`
   - Username: Your email
   - Token: Your API token
5. Click **Save**
6. Click **Test** to verify connection

---

## 3. Workflow Template Test

### Goal: Create a Development Cycle workflow from template

**Steps:**
1. Go to **Workflows**
2. Click **From Template** button
3. Select **Development Cycle** template
4. The workflow is created with pre-configured actions
5. Click **Run** to execute

---

## 4. Tools Listing Test

### Goal: Verify all tools (local + external) are accessible

**Steps:**
1. Go to **Tools**
2. Verify local integration tools are listed
3. Verify external MCP tools are listed with `external-` prefix

---

## 5. API Execution Test

### Goal: Test tool execution via API

**List tools:**
```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3000/api/mcp/tools
```

**Execute a tool:**
```bash
curl -X POST http://localhost:3000/api/mcp/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"toolName": "hello"}'
```

**Execute external tool:**
```bash
curl -X POST http://localhost:3000/api/mcp/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{"toolId": "external-SERVER_ID-TOOL_NAME", "params": {"text": "test"}}'
```

---

## 6. Jenkins Integration Test

### Goal: Trigger a Jenkins job and get build status

**Steps:**
1. Create Jenkins integration
2. Configure:
   - Base URL: `http://your-jenkins:8080`
   - Auth Type: `Basic` or `API Key`
3. Test connection
4. Use workflow to trigger job

---

## 7. Full Development Cycle Test

This tests the complete workflow:

```
JIRA Ticket → Trigger Build → Wait for Result → Update JIRA
```

**Prompt for AI assistant:**

> "Create a workflow that:
> 1. Takes a JIRA ticket ID as input
> 2. Fetches the ticket details from JIRA
> 3. Transitions it to 'In Progress'
> 4. Waits for a Jenkins build to complete (polling every 5 seconds)
> 5. On success: posts 'Build successful' comment and transitions to 'Done'
> 6. On failure: posts 'Build failed' comment with logs
> 
> Then execute the workflow with a test JIRA ticket."

---

## Debug Commands

**Check server logs:**
```bash
docker compose logs server --tail 50
```

**Check client logs:**
```bash
docker compose logs client --tail 50
```

**Restart services:**
```bash
docker compose restart
```

**Check container status:**
```bash
docker compose ps
```

---

## Expected API Responses

### GET /api/mcp/tools
```json
{
  "tools": [
    {
      "id": "uuid",
      "name": "hello",
      "description": "Hello world tool",
      "source": "local"
    },
    {
      "name": "echo",
      "description": "Echo back input",
      "_id": "external-UUID-echo",
      "source": "external",
      "externalServerId": "UUID",
      "externalServerName": "Demo MCP"
    }
  ]
}
```

### POST /api/mcp/execute (external tool)
```json
{
  "success": true,
  "tool": "echo",
  "source": "external",
  "result": {
    "success": true,
    "result": {
      "echo": "Hello World"
    }
  }
}
```

---

## Integration Notes

MCPConnect exposes tools via the MCP (Model Context Protocol) protocol. Any AI tool that supports MCP can connect to:

```
http://localhost:3000/api/mcp
```

With authentication via:
- API Key (header: `X-API-Key`)
- JWT Token (header: `Authorization: Bearer TOKEN`)
