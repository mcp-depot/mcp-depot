#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const args = process.argv.slice(2);

const isGlobal = process.env.npm_config_global === 'true' || !__dirname.includes('node_modules');
if (!isGlobal && !args.includes('--login') && !args.includes('--mcp')) {
  console.warn('\x1b[33mWarning: mcp-depot is designed to be installed globally.\x1b[0m');
  console.warn('\x1b[33mRun: npm install -g mcp-depot\x1b[0m\n');
}

const portFlagIndex = args.findIndex(a => a === '--port');
const portFlagValue = args.find(a => a.startsWith('--port='));
const portArg = portFlagValue
  ? portFlagValue.split('=')[1]
  : portFlagIndex !== -1 ? args[portFlagIndex + 1] : null;

if (portArg) process.env.PORT = portArg;

const DATA_DIR = path.join(os.homedir(), '.mcp-depot');
const PID_FILE = path.join(DATA_DIR, 'mcp-depot.pid');
const LOG_FILE = path.join(DATA_DIR, 'mcp-depot.log');

function daemonStart() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    try { process.kill(pid, 0); console.log(`Already running (PID ${pid})`); return } catch {}
    fs.unlinkSync(PID_FILE);
  }
  if (!process.env.DATABASE_URL) {
    process.env.SQLITE_PATH = path.join(DATA_DIR, 'data.db');
  }
  const logHandle = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [__filename], {
    detached: true,
    stdio: ['ignore', logHandle, logHandle],
    env: { ...process.env }
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log(`MCP Depot started (PID ${child.pid}) — logs: ${LOG_FILE}`);
}

function daemonStop() {
  if (!fs.existsSync(PID_FILE)) { console.log('Not running'); return; }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
  try {
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    console.log(`Stopped (PID ${pid})`);
  } catch { console.log('Process not found — removing stale PID file'); fs.unlinkSync(PID_FILE); }
}

function daemonStatus() {
  if (!fs.existsSync(PID_FILE)) { console.log('Status: stopped'); return; }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
  try { process.kill(pid, 0); console.log(`Status: running (PID ${pid})`) }
  catch { console.log(`Status: stopped (stale PID ${pid})`); fs.unlinkSync(PID_FILE); }
}

if (args.includes('--daemon')) { daemonStart(); process.exit(0); }
if (args.includes('--stop')) { daemonStop(); process.exit(0); }
if (args.includes('--status')) { daemonStatus(); process.exit(0); }

if (args.includes('--login')) {
  runLogin();
} else if (args.includes('--mcp')) {
  startMcpProxy();
} else if (['integrations', 'tools', 'health', 'import'].includes(args[0])) {
  const subcmd = args[0];
  runSubcommand(subcmd, args.slice(1)).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (args.includes('--help') || args.includes('-h')) {
  printHelp();
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
  let registeredSessionId = null;

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

    let actualClientName = 'mcp-depot-cli';
    let actualClientVersion = '1.0.0';

    server.setRequestHandler(types.InitializeRequestSchema, async (request) => {
      if (request.params?.clientInfo?.name) {
        actualClientName = request.params.clientInfo.name;
        actualClientVersion = request.params.clientInfo.version || '1.0.0';
      }
      return {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'mcp-depot', version: '1.0.0' },
        capabilities: { tools: {} }
      };
    });

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

    const regHeader = { 'Content-Type': 'application/json' };
    if (AUTH_TOKEN) regHeader['x-api-key'] = AUTH_TOKEN;

    try {
      const res = await fetch(`${MCP_DEPOT_URL}/sessions/register`, {
        method: 'POST',
        headers: regHeader,
        body: JSON.stringify({ clientName: actualClientName, clientVersion: actualClientVersion })
      });
      if (res.ok) {
        const data = await res.json();
        registeredSessionId = data.sessionId;
        console.error(`[MCP Depot] Session registered: ${registeredSessionId} (${actualClientName} ${actualClientVersion})`);
      }
    } catch (e) {
      console.error('[MCP Depot] Session registration failed (non-fatal):', e.message);
    }

    setInterval(async () => {
      try {
        const res = await fetch(`${MCP_DEPOT_URL}/sessions/register`, {
          method: 'POST',
          headers: regHeader,
          body: JSON.stringify({ sessionId: registeredSessionId, clientName: actualClientName, clientVersion: actualClientVersion })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sessionId !== registeredSessionId) {
            registeredSessionId = data.sessionId;
            startNotificationStream(registeredSessionId);
          }
        }
      } catch { /* server may be restarting, retry next interval */ }
    }, 60_000);

    function startNotificationStream(sessionId) {
      if (!sessionId) return;
      const ctrl = new AbortController();
      const url = `${MCP_DEPOT_URL}/sessions/${sessionId}/notifications`;

      fetch(url, { headers: regHeader, signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const notification = JSON.parse(line.slice(6));
                server.notification(notification);
              } catch { /* malformed SSE line */ }
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            if (registeredSessionId) startNotificationStream(registeredSessionId);
          }, 5_000);
        });

      return ctrl;
    }

    startNotificationStream(registeredSessionId);

    process.on('exit', () => {
      if (registeredSessionId) {
        const deregHeaders = { 'Content-Type': 'application/json' };
        if (AUTH_TOKEN) deregHeaders['x-api-key'] = AUTH_TOKEN;
        fetch(`${MCP_DEPOT_URL}/sessions/deregister`, {
          method: 'POST',
          headers: deregHeaders,
          body: JSON.stringify({ sessionId: registeredSessionId })
        }).catch(() => {});
      }
    });
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

// ─── CLI Management Subcommands ──────────────────────────────────────

function getBaseUrl() {
  const config = loadConfig();
  let url = config.url || 'http://localhost:3000/api';
  if (url.endsWith('/mcp')) url = url.slice(0, -4);
  return url;
}

function getAuthHeaders() {
  const config = loadConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['x-api-key'] = config.apiKey;
  return headers;
}

async function apiGet(endpoint) {
  const url = `${getBaseUrl()}${endpoint}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${body.error || res.statusText}`);
  }
  return res.json();
}

async function apiPost(endpoint, body) {
  const url = `${getBaseUrl()}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${errBody.error || res.statusText}`);
  }
  return res.json();
}

async function apiDelete(endpoint) {
  const url = `${getBaseUrl()}${endpoint}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${errBody.error || res.statusText}`);
  }
  return res.ok ? { ok: true } : null;
}

function flag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? (args[idx + 1] !== undefined && !args[idx + 1].startsWith('--') ? args[idx + 1] : true) : undefined;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function parseEnvVars(args) {
  const envPairIdx = args.indexOf('--env');
  if (envPairIdx === -1) return {};
  const env = {};
  for (let i = envPairIdx + 1; i < args.length && !args[i].startsWith('--'); i++) {
    const [key, ...rest] = args[i].split('=');
    if (key && rest.length) env[key] = rest.join('=');
  }
  return env;
}

async function cmdIntegrationsList(opts) {
  const data = await apiGet('/v1/integrations');
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.length === 0) { console.log('No integrations found.'); return; }
  console.log(`\n${'Name'.padEnd(25)} ${'Type'.padEnd(15)} ${'URL'.padEnd(45)} ${'Status'}  ${'Tools'}`);
  console.log('─'.repeat(110));
  data.forEach(i => {
    const status = i.isActive ? '\x1b[32mactive\x1b[0m' : '\x1b[31minactive\x1b[0m';
    const tools = (i.metadata?.toolCount ?? 0).toString();
    console.log(`${(i.name || '').padEnd(25)} ${(i.type || '').padEnd(15)} ${(i.baseUrl || '').padEnd(45)} ${status.padEnd(8)} ${tools}`);
  });
  console.log(`\nTotal: ${data.length}`);
}

async function cmdIntegrationsAdd(opts) {
  if (!opts.name || !opts.baseUrl) {
    console.error('Usage: mcp-depot integrations add --name <name> --base-url <url> [--type <type>] [--auth <type>] [--key <env-name>]');
    process.exit(1);
  }
  const authConfig = opts.auth ? { type: opts.auth, credentials: opts.key ? { key: opts.key, value: '' } : {} } : { type: 'none' };
  const payload = {
    type: opts.type || 'custom',
    name: opts.name,
    description: opts.description || '',
    config: { baseUrl: opts.baseUrl, auth: authConfig, headers: {}, timeout: 30000 },
    metadata: {}
  };
  const result = await apiPost('/v1/integrations', payload);
  console.log(`\nIntegration "${opts.name}" created.`);
  console.log(`ID: ${result._id || result.id}`);
  console.log('Next: add tools with: mcp-depot tools add --integration <name> --name <tool> --method GET --path /endpoint');
}

async function cmdIntegrationsRemove(name) {
  if (!name) { console.error('Usage: mcp-depot integrations remove <name>'); process.exit(1); }
  const integrations = await apiGet('/v1/integrations');
  const target = integrations.find(i => i.name === name);
  if (!target) { console.error(`Integration "${name}" not found.`); process.exit(1); }
  await apiDelete(`/v1/integrations/${target._id || target.id}`);
  console.log(`Integration "${name}" deleted.`);
}

async function cmdToolsList(opts) {
  const integrations = await apiGet('/v1/integrations');
  let filtered = integrations;
  if (opts.integration) {
    filtered = integrations.filter(i => i.name.toLowerCase() === opts.integration.toLowerCase());
    if (filtered.length === 0) { console.error(`Integration "${opts.integration}" not found.`); process.exit(1); }
  }
  let allTools = [];
  for (const int of filtered) {
    try {
      const tools = await apiGet(`/v1/integrations/${int._id || int.id}/tools`);
      tools.forEach(t => { allTools.push({ ...t, _integrationName: int.name }); });
    } catch (e) { /* skip unreachable integrations */ }
  }
  if (opts.json) { console.log(JSON.stringify(allTools, null, 2)); return; }
  if (allTools.length === 0) { console.log('No tools found.'); return; }
  console.log(`\n${'Tool Name'.padEnd(30)} ${'Integration'.padEnd(25)} ${'Method'.padEnd(8)} ${'Path'}`);
  console.log('─'.repeat(100));
  allTools.forEach(t => {
    const method = (t.endpoint?.method || 'GET').padEnd(8);
    const path = t.endpoint?.path || '';
    const name = (t.name || '').padEnd(30);
    const intName = (t._integrationName || '').padEnd(25);
    console.log(`${name} ${intName} ${method} ${path}`);
  });
  console.log(`\nTotal: ${allTools.length}`);
}

async function cmdToolsAdd(opts) {
  if (!opts.integration || !opts.name || !opts.method || !opts.path) {
    console.error('Usage: mcp-depot tools add --integration <name> --name <tool> --method GET --path /endpoint');
    process.exit(1);
  }
  const integrations = await apiGet('/v1/integrations');
  const target = integrations.find(i => i.name.toLowerCase() === opts.integration.toLowerCase());
  if (!target) { console.error(`Integration "${opts.integration}" not found.`); process.exit(1); }
  const payload = {
    name: opts.name,
    description: opts.description || '',
    endpoint: {
      path: opts.path,
      method: opts.method.toUpperCase(),
      params: {},
      headers: {},
      body: null
    },
    inputSchema: {},
    outputSchema: {}
  };
  const result = await apiPost(`/v1/integrations/${target._id || target.id}/tools`, payload);
  console.log(`Tool "${opts.name}" added to "${opts.integration}".`);
  console.log(`ID: ${result._id || result.id}`);
}

async function cmdToolsRemove(integrationName, toolName) {
  if (!integrationName || !toolName) {
    console.error('Usage: mcp-depot tools remove <integration> <tool>');
    process.exit(1);
  }
  const integrations = await apiGet('/v1/integrations');
  const target = integrations.find(i => i.name.toLowerCase() === integrationName.toLowerCase());
  if (!target) { console.error(`Integration "${integrationName}" not found.`); process.exit(1); }
  const tools = await apiGet(`/v1/integrations/${target._id || target.id}/tools`);
  const tool = tools.find(t => t.name.toLowerCase() === toolName.toLowerCase());
  if (!tool) { console.error(`Tool "${toolName}" not found in "${integrationName}".`); process.exit(1); }
  await apiDelete(`/v1/integrations/${target._id || target.id}/tools/${tool._id || tool.id}`);
  console.log(`Tool "${toolName}" deleted from "${integrationName}".`);
}

async function cmdHealth() {
  const data = await apiGet('/v1/health');
  const results = data.cached || [];
  if (results.length === 0) {
    console.log('No health data yet. Run: mcp-depot health --refresh');
    return;
  }
  console.log(`\n${'Integration'.padEnd(30)} ${'Status'.padEnd(10)} ${'Latency'.padEnd(12)} ${'Error'}`);
  console.log('─'.repeat(80));
  results.forEach(r => {
    const status = r.status === 'ok' ? '\x1b[32mOK\x1b[0m' : '\x1b[31mERROR\x1b[0m';
    const latency = `${r.latencyMs || 0}ms`.padEnd(12);
    const error = r.error || '';
    console.log(`${(r.name || '').padEnd(30)} ${status.padEnd(10)} ${latency} ${error}`);
  });
  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\n${ok}/${results.length} healthy · last check: ${results[0]?.checkedAt || 'never'}`);
}

async function cmdImportOpenapi(opts) {
  const specSource = opts._[1];
  if (!specSource || !opts.integration) {
    console.error('Usage: mcp-depot import openapi <url-or-file> --integration <name>');
    process.exit(1);
  }
  let specUrl, baseUrl, specContent;
  if (specSource.startsWith('http://') || specSource.startsWith('https://')) {
    specUrl = specSource;
    const res = await fetch(specUrl);
    if (!res.ok) { console.error(`Failed to fetch spec: HTTP ${res.status}`); process.exit(1); }
    specContent = await res.text();
  } else {
    const filePath = path.resolve(specSource);
    if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }
    specContent = fs.readFileSync(filePath, 'utf-8');
  }
  const spec = JSON.parse(specContent);
  baseUrl = spec.servers?.[0]?.url || spec.host ? `${spec.schemes?.[0] || 'https'}://${spec.host}${spec.basePath || ''}` : '';
  if (!baseUrl) { console.error('Could not determine base URL from spec. Please ensure the spec has a servers array.'); process.exit(1); }
  const integrations = await apiGet('/v1/integrations');
  let target = integrations.find(i => i.name.toLowerCase() === opts.integration.toLowerCase());
  if (!target) {
    console.log(`Integration "${opts.integration}" not found. Creating...`);
    target = await apiPost('/v1/integrations', {
      type: 'custom', name: opts.integration, config: { baseUrl, auth: { type: 'none' }, headers: {}, timeout: 30000 }, metadata: {}
    });
    console.log(`Created integration "${opts.integration}" (ID: ${target._id || target.id})`);
  }
  const intId = target._id || target.id;
  const existingTools = await apiGet(`/v1/integrations/${intId}/tools`);
  const existingNames = new Set(existingTools.map(t => t.name));
  const endpoints = [];
  if (spec.paths) {
    Object.entries(spec.paths).forEach(([pathPath, methods]) => {
      Object.entries(methods).forEach(([method, op]) => {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method) && !existingNames.has(op.operationId || `${method}_${pathPath.replace(/\//g, '_')}`)) {
          endpoints.push({
            path: pathPath,
            method: method.toUpperCase(),
            operationId: op.operationId || `${method}_${pathPath.replace(/[{}\/]/g, '_')}`,
            summary: op.summary || op.description || '',
            params: op.parameters ? op.parameters.map(p => ({ name: p.name, required: p.required || false, type: 'string', description: p.description || p.name })) : [],
          });
        }
      });
    });
  }
  if (endpoints.length === 0) { console.log('No new endpoints to import.'); return; }
  const result = await apiPost(`/v1/integrations/${intId}/import-tools`, { endpoints });
  const created = result.created || 0;
  console.log(`\nImported ${created} tools into "${opts.integration}".`);
  if (result.errors?.length) {
    console.log(`\n${result.errors.length} errors:`);
    result.errors.forEach(e => console.log(`  - ${e.endpoint || e}: ${typeof e.error === 'string' ? e.error : JSON.stringify(e.error)}`));
  }
}

async function runSubcommand(subcmd, subArgs) {
  const opts = { _: subArgs };
  subArgs.forEach((a, i) => {
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const val = subArgs[i + 1] && !subArgs[i + 1].startsWith('--') ? subArgs[i + 1] : true;
      opts[key] = val;
    }
  });
  try {
    if (subcmd === 'integrations') {
      const action = subArgs[0];
      if (action === 'list' || !action) return cmdIntegrationsList({ json: opts.json });
      if (action === 'add') return cmdIntegrationsAdd(opts);
      if (action === 'remove') return cmdIntegrationsRemove(subArgs[1]);
    }
    if (subcmd === 'tools') {
      const action = subArgs[0];
      if (action === 'list' || !action) return cmdToolsList({ json: opts.json, integration: opts.integration });
      if (action === 'add') return cmdToolsAdd(opts);
      if (action === 'remove') return cmdToolsRemove(subArgs[1], subArgs[2]);
    }
    if (subcmd === 'health') return cmdHealth();
    if (subcmd === 'import') {
      const type = subArgs[0];
      if (type === 'openapi') return cmdImportOpenapi(opts);
    }
    printHelp();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
MCP Depot CLI - Management Commands

Usage: mcp-depot <command> [subcommand] [options]

Commands:
  integrations list [--json]                    List all integrations
  integrations add --name N --base-url U        Create a new integration
    [--type T] [--auth A] [--key K]
  integrations remove <name>                    Delete an integration
  tools list [--integration N] [--json]         List tools (optionally filtered)
  tools add --integration N --name T            Add a tool to an integration
    --method M --path P [--description D]
  tools remove <integration> <tool>             Delete a tool
  health                                        Show integration health status
  import openapi <url|file> --integration N     Import tools from OpenAPI spec

Global options:
  --json                    Output as JSON (for list commands)
  --login                   Interactive login to configure API key
  --mcp                     Start MCP stdio proxy
  --port <n>                Run server on custom port
  --daemon                  Run server as background daemon
  --stop                    Stop background daemon
  --status                  Show daemon status

Configuration: ~/.mcp-depot/config.json
`);
}