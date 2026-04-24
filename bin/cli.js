#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const args = process.argv.slice(2);

const portFlagIndex = args.findIndex(a => a === '--port');
const portFlagValue = args.find(a => a.startsWith('--port='));
const portArg = portFlagValue
  ? portFlagValue.split('=')[1]
  : portFlagIndex !== -1 ? args[portFlagIndex + 1] : null;

if (portArg) process.env.PORT = portArg;

if (args.includes('--login')) {
  runLogin();
} else if (args.includes('--mcp')) {
  startMcpProxy();
} else {
  const serveClient = !args.includes('--server');
  process.env.SERVE_CLIENT = serveClient ? 'true' : 'false';

  if (!process.env.DATABASE_URL) {
    const os = require('os');
    const dataDir = path.join(os.homedir(), '.mcp-depot');
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.SQLITE_PATH = path.join(dataDir, 'data.db');
  }

  require('../server/src/index.js');

  const port = process.env.PORT || 3000;
  console.log(`MCP Depot running at http://localhost:${port}`);
  if (!process.env.DATABASE_URL) {
    const dbPath = process.env.SQLITE_PATH || path.join(os.homedir(), '.mcp-depot', 'data.db');
    console.log(`Database: SQLite (${dbPath})`);
  }
}

function startMcpProxy() {
  const banner = `
┌────────────────────────────────┐
│           mcp-depot            │
│    connect · sync · control   │
└────────────────────────────────┘
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
    const types = require(path.join(
      path.dirname(require.resolve('@modelcontextprotocol/sdk/server')),
      '..', 'types.js'
    ));

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
    const existingConfig = loadConfig();
    const defaultPort = process.env.PORT || 3000;
    const defaultUrl = existingConfig.url || `http://localhost:${defaultPort}/api/mcp`;
    const url = await ask(`Server URL [${defaultUrl}]: `);
    const apiKey = await ask('API key: ');
    rl.close();

    console.error('\nTesting connection...');
    const finalUrl = url.trim() || defaultUrl;
    try {
      const testUrl = finalUrl + '/tools';
      const res = await fetch(testUrl, {
        headers: { 'x-api-key': apiKey.trim() }
      });
      if (res.status === 401) {
        console.error('Login failed: invalid API key.');
        process.exit(1);
      }
      if (res.status === 404) {
        console.error('Login failed: server not found at that URL. Check the URL and try again.');
        process.exit(1);
      }
      if (!res.ok) {
        console.error(`Login failed: server returned ${res.status}.`);
        process.exit(1);
      }
      console.error('Connection successful.');
    } catch (e) {
      console.error('Login failed: could not reach server.', e.message);
      process.exit(1);
    }

    const configDir = path.join(os.homedir(), '.mcp-depot');
    const configFile = path.join(configDir, 'config.json');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify({
      url: finalUrl,
      apiKey: apiKey.trim()
    }, null, 2));

    console.error(`\nConfig saved to ${configFile}`);
    console.error('Run: claude mcp add mcp-depot -- mcp-depot --mcp');
  })();
}

function loadConfig() {
  const configFile = path.join(os.homedir(), '.mcp-depot', 'config.json');
  if (fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}