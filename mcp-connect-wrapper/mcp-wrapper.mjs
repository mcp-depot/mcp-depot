#!/usr/bin/env node --experimental-vm-modules

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sdkPath = join(process.cwd(), 'node_modules', '@modelcontextprotocol', 'sdk');

const Server = require(join(sdkPath, 'dist', 'cjs', 'server', 'index.js')).Server;
const StdioServerTransport = require(join(sdkPath, 'dist', 'cjs', 'server', 'stdio.js')).StdioServerTransport;

const MCP_CONNECT_URL = process.env.MCP_CONNECT_URL || 'http://localhost:3000/api/mcp';
const AUTH_TOKEN = process.env.MCP_CONNECT_TOKEN || '';

async function main() {
  let tools = [];
  
  try {
    const headers = AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {};
    const response = await fetch(`${MCP_CONNECT_URL}/tools`, { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tools: ${response.status}`);
    }
    
    const data = await response.json();
    tools = data.tools || [];
    console.error(`[MCP-Connect] Loaded ${tools.length} tools from ${MCP_CONNECT_URL}`);
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

  server.setRequestHandler('tools/list', async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description || `Execute ${tool.name}`,
        inputSchema: {
          type: 'object',
          properties: extractParams(tool.path || tool.endpoint?.path || ''),
          required: extractRequiredParams(tool.path || tool.endpoint?.path || '')
        }
      }))
    };
  });

  server.setRequestHandler('tools/call', async (request) => {
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
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const response = await fetch(`${MCP_CONNECT_URL}/execute`, {
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

main().catch(err => {
  console.error('[MCP-Connect] Failed to start:', err.message);
  process.exit(1);
});