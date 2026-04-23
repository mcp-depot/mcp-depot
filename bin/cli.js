#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const args = process.argv.slice(2);

if (args.includes('--login')) {
  runLogin();
} else if (args.includes('--mcp')) {
  startMcpProxy();
} else {
  const serveClient = !args.includes('--server');
  process.env.SERVE_CLIENT = serveClient ? 'true' : 'false';

  if (!process.env.DATABASE_URL) {
    const os = require('os');
    const dataDir = path.join(os.homedir(), '.mcpconnect');
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.SQLITE_PATH = path.join(dataDir, 'data.db');
  }

  require('../server/src/index.js');

  const port = process.env.PORT || 3000;
  console.log(`MCP Depot running at http://localhost:${port}`);
  if (!process.env.DATABASE_URL) {
    console.log(`Database: SQLite (~/.mcpconnect/data.db)`);
  }
}

function startMcpProxy() {
  const banner = `
┌───────────────────────────────┐
│         MCP Depot           │
│   connect • sync • control  │
└───────────────────────────────┘
`;

  console.error(banner);

  const config = loadConfig();
  const MCP_DEPOT_URL = config.url || 'http://localhost:3000/api/mcp';
  const AUTH_TOKEN = config.apiKey || '';

  let tools = [];

  async function main() {
    const needsAuth = true;
    const hasCredentials = !!AUTH_TOKEN;

    if (needsAuth && !hasCredentials) {
      console.error('');
      console.error('[MCP Depot] ERROR: API key required but not configured!');
      console.error('');
      console.error('Run: mcp-depot --login');
      process.exit(1);
    }

    const headers = { 'Content-Type': 'application/json' };
    if (AUTH_TOKEN) {
      headers['x-api-key'] = AUTH_TOKEN;
    }

    try {
      const response = await fetch(`${MCP_DEPOT_URL}/tools`, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch tools: ${response.status}`);
      }
      const data = await response.json();
      tools = data.tools || [];
      console.error(`[MCP Depot] Loaded ${tools.length} tools from ${MCP_DEPOT_URL}`);
    } catch (error) {
      console.error('[MCP Depot] Error loading tools:', error.message);
      process.exit(1);
    }

    const { Server } = require('@modelcontextprotocol/sdk/server');
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    const types = require('@modelcontextprotocol/sdk/types');

    const server = new Server(
      { name: 'mcp-depot', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(types.ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(tool => {
          const endpoint = tool.endpoint || {};
          const pathParams = extractParams(endpoint.path || '');
          const bodyParams = endpoint.params || {};
          const allParams = { ...pathParams, ...bodyParams };

          const sanitizedName = String(tool.name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');

          return {
            name: sanitizedName,
            description: tool.description || `Execute ${tool.name}`,
            inputSchema: buildJsonSchema(allParams)
          };
        })
      };
    });

    server.setRequestHandler(types.CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await executeTool(name, args);
        return {
          content: [{
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[MCP Depot] Server connected and ready');
  }

  function extractParams(path) {
    const params = {};
    const matches = path.match(/\{([^}]+)\}/g);
    if (matches) {
      matches.forEach(match => {
        const paramName = match.replace(/[{}]/g, '');
        params[paramName] = { type: 'string', description: `Parameter: ${paramName}` };
      });
    }
    return params;
  }

  function buildJsonSchema(params) {
    const properties = {};
    const required = [];
    Object.entries(params).forEach(([key, val]) => {
      properties[key] = {
        type: 'string',
        description: (val && typeof val === 'object' ? val.description : undefined) || key
      };
      if (val && typeof val === 'object' && val.required) {
        required.push(key);
      }
    });
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    };
  }

  async function executeTool(sanitizedName, args) {
    const originalTool = tools.find(t => {
      const toolName = String(t.name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
      return toolName === sanitizedName;
    });

    const toolName = originalTool ? originalTool.name : sanitizedName;

    const headers = { 'Content-Type': 'application/json' };
    if (AUTH_TOKEN) {
      headers['x-api-key'] = AUTH_TOKEN;
    }

    const response = await fetch(`${MCP_DEPOT_URL}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ toolName, params: args || {} })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.result || result;
  }

  main().catch(err => {
    console.error('[MCP Depot] Failed to start:', err.message);
    process.exit(1);
  });
}

function runLogin() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });

  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  (async () => {
    console.error('\n=== MCP Depot Login ===\n');
    const url = await ask('Server URL [http://localhost:3000/api/mcp]: ');
    const apiKey = await ask('API key: ');
    rl.close();

    const configDir = path.join(os.homedir(), '.mcpconnect');
    const configFile = path.join(configDir, 'config.json');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify({
      url: url.trim() || 'http://localhost:3000/api/mcp',
      apiKey: apiKey.trim()
    }, null, 2));

    console.error(`\nConfig saved to ${configFile}`);
    console.error('Run: claude mcp add mcp-depot -- mcp-depot --mcp');
  })();
}

function loadConfig() {
  const configFile = path.join(os.homedir(), '.mcpconnect', 'config.json');
  if (fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}