#!/bin/bash
export MCP_CONNECT_URL="${MCP_CONNECT_URL:-http://localhost:3000/api/mcp}"
export MCP_CONNECT_API_KEY="${MCP_CONNECT_API_KEY:-}"
export MCP_CONNECT_TOKEN="${MCP_CONNECT_TOKEN:-}"

cd "$(dirname "$0")"
node mcp-wrapper.cjs "$@"
