#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const banner = `
┌───────────────────────────────┐
│         MCPConnect            │
│   connect • sync • control    │
└───────────────────────────────┘
`;

console.error(banner);

function getSdkPath() {
  const possiblePaths = [
    path.join(__dirname, 'node_modules', '@modelcontextprotocol', 'sdk'),
    path.join(process.cwd(), 'node_modules', '@modelcontextprotocol', 'sdk'),
    path.join(process.cwd(), '..', 'server', 'node_modules', '@modelcontextprotocol', 'sdk'),
    path.join(process.cwd(), '..', '..', 'server', 'node_modules', '@modelcontextprotocol', 'sdk'),
  ];
  
  for (const p of possiblePaths) {
    try {
      require.resolve(path.join(p, 'dist', 'cjs', 'server', 'index.js'));
      return p;
    } catch (e) {
      continue;
    }
  }
  
  return possiblePaths[1];
}

const sdkPath = getSdkPath();
console.error('[MCP-Connect] Using SDK from:', sdkPath);

const { Server } = require(path.join(sdkPath, 'dist', 'cjs', 'server'));
const { StdioServerTransport } = require(path.join(sdkPath, 'dist', 'cjs', 'server', 'stdio.js'));
const types = require(path.join(sdkPath, 'dist', 'cjs', 'types.js'));

const MCP_CONNECT_URL = process.env.MCP_CONNECT_URL || 'http://localhost:3000/api/mcp';
const AUTH_TOKEN = process.env.MCP_CONNECT_TOKEN || '';
const API_KEY = process.env.MCP_CONNECT_API_KEY || '';

function loadConfigFromFile() {
  const configPaths = [
    path.join(__dirname, 'config.json'),
    path.join(process.cwd(), 'config.json'),
    path.join(process.env.HOME || process.env.USERPROFILE, '.mcp', 'config.json'),
    path.join(process.env.HOME || process.env.USERPROFILE, '.mcp', 'mcpconnect.json')
  ];
  
  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configData);
        console.error('[MCP-Connect] Loaded config from:', configPath);
        return config;
      }
    } catch (e) {}
  }
  
  const defaultConfigPath = path.join(__dirname, 'config.json');
  const defaultConfig = {
    url: process.env.MCP_CONNECT_URL || 'http://localhost:3000/api/mcp',
    apiKey: process.env.MCP_CONNECT_API_KEY || ''
  };
  
  fs.writeFileSync(defaultConfigPath, JSON.stringify(defaultConfig, null, 2));
  console.error('[MCP-Connect] Created config.json at:', defaultConfigPath);
  console.error('[MCP-Connect] Please add your API key to the config file and restart.');
  
  return defaultConfig;
}

const fileConfig = loadConfigFromFile();
const FINAL_URL = fileConfig.url || MCP_CONNECT_URL;
const FINAL_TOKEN = fileConfig.token || fileConfig.apiKey || AUTH_TOKEN;
const FINAL_API_KEY = fileConfig.apiKey || API_KEY;
const TIMEOUT_MS = parseInt(process.env.MCP_CONNECT_TIMEOUT) || 30000;

function getAuthModeUrl() {
  let baseUrl = FINAL_URL.replace(/\/mcp\/?$/, '');
  baseUrl = baseUrl.replace(/\/api$/, '');
  return `${baseUrl}/api/system/mcp`;
}

async function getAuthMode() {
  try {
    const response = await fetch(getAuthModeUrl());
    if (response.ok) {
      const data = await response.json();
      return data.authMode || 'none';
    }
  } catch (e) {
    console.error('[MCP-Connect] Could not fetch auth mode:', e.message);
  }
  return 'none';
}

async function main() {
  const authMode = await getAuthMode();
  console.error(`[MCP-Connect] Auth mode: ${authMode}`);
  
  const needsAuth = authMode === 'required';
  const hasCredentials = !!FINAL_TOKEN || !!FINAL_API_KEY;
  
  if (needsAuth && !hasCredentials) {
    console.error('');
    console.error('[MCP-Connect] ERROR: API key required but not configured!');
    console.error('');
    console.error('Run: mcp-connect --login');
    console.error('');
    console.error('This will prompt for your MCP server URL and API key.');
    process.exit(1);
  }
  
  let tools = [];
  
  const headers = {};
  if (FINAL_TOKEN) {
    headers['Authorization'] = `Bearer ${FINAL_TOKEN}`;
  }
  if (FINAL_API_KEY) {
    headers['X-API-Key'] = FINAL_API_KEY;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const response = await fetch(`${FINAL_URL}/tools`, { 
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tools: ${response.status}`);
    }
    
    const data = await response.json();
    tools = data.tools || [];
    console.error(`[MCP-Connect] Loaded ${tools.length} tools from ${FINAL_URL}`);
  } catch (error) {
    console.error('[MCP-Connect] Error loading tools:', error.message);
    process.exit(1);
  }

  const server = new Server(
    {
      name: 'mcp-connect',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(types.ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => {
        const endpoint = tool.endpoint || {};
        const pathParams = extractParams(endpoint.path || '');
        const bodyParams = endpoint.params || {};
        const allParams = { ...pathParams, ...bodyParams };
        
        return {
          name: tool.name,
          description: tool.description || `Execute ${tool.name}`,
          inputSchema: {
            type: 'object',
            properties: allParams,
            required: Object.entries(allParams).filter(([_, v]) => v.required).map(([k]) => k)
          }
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
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP-Connect] Server connected and ready');
}

function extractParams(path) {
  const params = {};
  const matches = path.match(/\{([^}]+)\}/g);
  if (matches) {
    matches.forEach(match => {
      const paramName = match.replace(/[{}]/g, '');
      params[paramName] = { 
        type: 'string', 
        description: `Parameter: ${paramName}` 
      };
    });
  }
  return params;
}

function extractRequiredParams(path) {
  const matches = path.match(/\{([^}]+)\}/g);
  if (matches) {
    return matches.map(m => m.replace(/[{}]/g, ''));
  }
  return [];
}

async function executeTool(toolName, args) {
  const headers = { 'Content-Type': 'application/json' };
  if (FINAL_TOKEN) {
    headers['Authorization'] = `Bearer ${FINAL_TOKEN}`;
  }
  if (FINAL_API_KEY) {
    headers['X-API-Key'] = FINAL_API_KEY;
  }

  const response = await fetch(`${FINAL_URL}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      toolName,
      params: args || {}
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.result || result;
}

if (process.argv.includes('--login') || process.argv.includes('-l')) {
  login().catch(err => {
    console.error('[MCP-Connect] Login error:', err.message);
    process.exit(1);
  });
  return;
}

main().catch(err => {
  console.error('[MCP-Connect] Failed to start:', err.message);
  process.exit(1);
});

async function login() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  
  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));
  
  const configPath = path.join(__dirname, 'config.json');
  let existingConfig = {};
  
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      if (existingConfig.url && existingConfig.apiKey) {
        console.error('');
        console.error('=== MCPConnect Login ===');
        console.error('');
        console.error('Credentials are already configured.');
        const answer = await question('Do you want to reconfigure? (y/N): ');
        
        if (answer.trim().toLowerCase() !== 'y') {
          rl.close();
          console.error('[MCP-Connect] Keeping current configuration.');
          process.exit(0);
        }
      }
    } catch (e) {}
  }
  
  console.error('');
  console.error('=== MCPConnect Login ===');
  console.error('');
  
  const url = await question('MCP Server URL (e.g., http://localhost:3000/api/mcp): ');
  const apiKey = await question('API Key (from Settings > My API Access): ');
  
  rl.close();
  
  const config = {
    url: url.trim() || existingConfig.url || 'http://localhost:3000/api/mcp',
    apiKey: apiKey.trim() || existingConfig.apiKey || ''
  };
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.error('');
  console.error('[MCP-Connect] Config saved to:', configPath);
  console.error('[MCP-Connect] Run "mcp-connect" to start the server.');
  process.exit(0);
}