#!/usr/bin/env node --experimental-vm-modules

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sdkPath = join(process.cwd(), 'node_modules', '@modelcontextprotocol', 'sdk');

const { McpServer } = require(join(sdkPath, 'dist', 'cjs', 'server', 'mcp.js'));
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

  const server = new McpServer(
    { name: 'mcp-connect', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const zod = require('zod');

  for (const tool of tools) {
    const pathParams = extractPathParams(tool.endpoint?.path || tool.path || '');
    const queryParams = extractQueryParams(tool.endpoint?.params || {});
    const allParams = { ...pathParams, ...queryParams };
    
    let toolName = String(tool.name || '').trim();
    if (!toolName) continue;
    
    // Sanitize tool name - replace spaces with underscores
    const sanitizedName = toolName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // Build a Zod schema from the parameters
    const zodShape = {};
    Object.entries(allParams).forEach(([key, val]) => {
      zodShape[key] = zod.string().describe(val.description || key);
    });
    
    const schema = Object.keys(zodShape).length > 0 ? zod.object(zodShape) : zod.any();
    
    try {
      server.registerTool(
        sanitizedName,
        {
          description: tool.description || `Execute ${toolName}`,
          inputSchema: schema
        },
        async (args) => {
          try {
            const result = await executeTool(toolName, args || {});
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
        }
      );
    } catch (e) {
      console.error(`Failed to register tool ${sanitizedName}:`, e.message);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP-Connect] Server connected and ready');
}

function extractPathParams(path) {
  const params = {};
  const matches = path.match(/\{([^}]+)\}/g);
  if (matches) {
    matches.forEach(match => {
      const paramName = match.replace(/[{}]/g, '');
      params[paramName] = { 
        type: 'string', 
        description: `Path parameter: ${paramName}` 
      };
    });
  }
  return params;
}

function extractQueryParams(params) {
  const result = {};
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, val]) => {
      if (val && typeof val === 'object' && val.required) {
        result[key] = { 
          type: 'string', 
          description: val.description || `Query parameter: ${key}` 
        };
      }
    });
  }
  return result;
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