# Meta-Tools

Meta-tools are MCP tools that manage MCP Depot itself, rather than calling an external API. They let an AI client discover, register, and invoke catalog tools without a human touching the UI.

There are two categories:

- **Authoring meta-tools** - let an AI create and manage integrations/tools on its own behalf (`mcp_*` below). Gated behind the built-in **"MCP Depot - AI Tools"** integration - if it's disabled, every call returns an error telling the caller to enable it.
- **Catalog meta-tools** - `search_tools` and `execute_tool`, an alternative way to reach the regular tool/skill catalog without loading every tool's schema up front. Always available; not gated by the "MCP Depot - AI Tools" toggle.

Both categories are implemented in `server/src/mcp/meta-tools.js` and `server/src/mcp/catalog-tools.js`, registered once per MCP session alongside every other tool.

## Authoring meta-tools

### `mcp_list_integrations`

Lists every registered integration with its type, tool count, auth type, source, and active status. No parameters.

### `mcp_register_integration`

Registers a new integration (an external API) that tools can be added to.

| Param | Required | Description |
|---|---|---|
| `name` | yes | Unique name for the new integration |
| `baseUrl` | yes | Base URL of the API this integration will call |
| `description` | no | Human-readable description |
| `type` | no | Integration type (default `custom`) |
| `shared` | no | Request company-wide shared visibility. Only takes effect if the caller has admin sharing rights - otherwise the integration is created private and the response explains why |

Always created **private** first. Sharing is a privileged action, checked against the real caller's policy (see [Caller attribution](#caller-attribution) below) - never assumed just because `shared: true` was passed.

### `mcp_register_tool`

Adds a new tool (a single API endpoint) to an existing integration.

| Param | Required | Description |
|---|---|---|
| `name` | yes | Name for the new tool |
| `path` | yes | API endpoint path - supports `{placeholder}` template variables filled from the tool's params |
| `integration` | no* | Name of the integration to add this tool to. *Required if more than one non-built-in integration exists* |
| `method` | no | HTTP method (default `GET`) |
| `description` | no | Description of what this tool does |
| `params` | no | JSON object string describing query/path parameters, e.g. `{"id": {"type": "string", "required": true}}` |
| `body` | no | JSON string of the request body template - supports `{placeholder}` substitution |
| `responseFields` | no | JSON array string of response field names to keep |

Cannot target a **built-in** integration (e.g. "MCP Depot - AI Tools" itself) - those are system-managed and rejected explicitly. After registering, run `/mcp` (or reconnect) to pick up the new tool in the same session.

### `mcp_describe_tool`

Returns the full definition of a registered tool - endpoint, input schema, response fields, response transformer, and source.

| Param | Required | Description |
|---|---|---|
| `name` | yes | Tool name or exposed name |

### `mcp_remove_tool`

Removes a tool from an integration.

| Param | Required | Description |
|---|---|---|
| `integration` | yes | Name of the integration the tool belongs to |
| `name` | yes | Name of the tool to remove |
| `confirm` | no | Must be `true` to actually delete - calling without it returns a confirmation prompt instead of deleting |

Cannot remove tools from a built-in integration.

## Catalog meta-tools

These exist so an AI client doesn't have to load every registered tool's JSON schema into context up front - see [Compact tool mode](#compact-tool-mode) below. They cover the same catalog as the regular tool list: registered Tools (simple + composite) and Skills. They deliberately do **not** cover the authoring meta-tools above (a small, fixed set - not the source of context bloat) or External MCP server tools (not reachable by native MCP sessions at all today, a separate gap).

### `search_tools`

Searches the catalog by keyword, matched (case-insensitively, substring) against each tool's name, description, exposed name, title, and parent integration name/tags - or a skill's name and description.

| Param | Required | Description |
|---|---|---|
| `query` | yes | Keyword to search for |
| `limit` | no | Max results (default 10, max 50) |

Returns each match's exact `name` plus its `inputSchema`, so the caller has everything it needs to call `execute_tool` next:

```json
{
  "matches": [
    { "name": "dummy_json_get_users", "description": "get all users from dummyjson", "inputSchema": { "type": "object", "properties": {}, "required": [] } }
  ],
  "totalMatches": 1,
  "truncated": false
}
```

Only returns tools/skills the caller can actually see - the same ownership/sharing rules the regular tool list applies.

### `execute_tool`

Executes a tool or skill from the catalog by its exact name (as returned by `search_tools`). Runs the same policy check, rate limit, and response filtering a direct call to that tool would - the response is identical either way.

| Param | Required | Description |
|---|---|---|
| `name` | yes | Tool or skill name, exactly as returned by `search_tools` |
| `params` | no | JSON object string of parameters matching the tool's `inputSchema`, e.g. `'{"key": "value"}'`. Omit for tools with no parameters |

Rejects meta-tools and catalog meta-tools themselves (`"... is not part of the searchable catalog - call it directly"`) - those must be called directly by name, not proxied through `execute_tool`.

Unlike a direct tool call, `execute_tool` also writes a coarse `audit_logs` entry (`action: 'execute_tool'`) in addition to the fine-grained `tool_calls` row every tool call already gets - closing a gap where that entry previously only came from the REST `/consume` path.

## Compact tool mode

By default every registered tool and skill is individually exposed to connecting AI clients. For a catalog with many tools, that means loading dozens of full JSON schemas into context before the AI does anything.

**Compact tool mode** (a global admin toggle in Settings → MCP Server) collapses `tools/list` down to just the catalog meta-tools (`search_tools` / `execute_tool`) plus the fixed set of authoring meta-tools - regular tools and skills are hidden from the list but remain fully callable via `execute_tool`. Only the *list* changes; nothing becomes unreachable.

The flag is read fresh from the database on every `tools/list` call (no caching), so toggling it in Settings takes effect immediately without reconnecting.

## Caller attribution

Meta-tool actions that need to know "who is actually calling this" (e.g. `shared: true` on `mcp_register_integration`, or ownership on any created resource) resolve the real caller from two places:

- A live MCP session (stdio/SSE/HTTP) - the API key or JWT presented at connect time already resolved a `userId` onto the session.
- The REST convenience wrapper (`/api/v1/mcp/*`) - resolves `req.user` via its own auth middleware and passes it straight through.

If neither identifies a real user (e.g. an unauthenticated stdio session), actions fall back to an admin owner rather than guessing, and privileged actions like sharing are declined with an explanation rather than silently granted.
