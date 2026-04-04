@echo off
set MCP_CONNECT_URL=http://localhost:3000/api/mcp
if defined MCP_CONNECT_API_KEY set MCP_CONNECT_API_KEY=%MCP_CONNECT_API_KEY%
node "%~dp0mcp-wrapper.cjs" %*
