const express = require('express');
const { spawn } = require('child_process');
const axios = require('axios');
const { sequelize, connectDB, loadModels } = require('../config/database');
const { optionalApiKey, authWithApiKey, optionalAuth } = require('../middleware/auth');
const { checkMcpAuth } = require('../middleware/mcpAuth');
const Tool = require('../models/Tool');
const Integration = require('../models/Integration');
const User = require('../models/User');
const AdapterFactory = require('../adapters');
const { logToolCall } = require('../services/tool-logger');
const encryption = require('../services/encryption');
const config = require('../config/env');
const { getTools: stdioGetTools, callTool: stdioCallTool, validateJsonRpcResponse } = require('../services/stdio-mcp');
const { checkRateLimit } = require('../services/rate-limiter');

const router = express.Router();

function safeJsonParse(value, defaultValue) {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return defaultValue;
  }
}

const TOOLS_CACHE_ENABLED = process.env.TOOLS_CACHE_ENABLED === 'true';
const TOOLS_CACHE_TTL = parseInt(process.env.TOOLS_CACHE_TTL) || 300000;

const toolsCache = {
  data: null,
  timestamp: 0,
  ttl: TOOLS_CACHE_TTL
};

function getCachedTools() {
  if (!TOOLS_CACHE_ENABLED) return null;
  const now = Date.now();
  if (toolsCache.data && (now - toolsCache.timestamp) < toolsCache.ttl) {
    return toolsCache.data;
  }
  return null;
}

function setCachedTools(tools) {
  if (!TOOLS_CACHE_ENABLED) return;
  toolsCache.data = tools;
  toolsCache.timestamp = Date.now();
}

function clearToolsCache() {
  toolsCache.data = null;
  toolsCache.timestamp = 0;
}

async function setupAssociations() {
  try {
    Integration.belongsTo(User, { foreignKey: 'userId' });
    Tool.belongsTo(Integration, { foreignKey: 'integrationId', as: 'integration' });
  } catch (e) {}
}

router.get('/hello', async (req, res) => {
  res.json({
    message: 'Hello from MCPConnect!',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

router.get('/fetch-url', optionalAuth, async (req, res) => {
  try {
    const { url, timeout, maxSize, headers } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL query parameter is required' });
    }
    
    if (!url.match(/^https?:\/\/.+/)) {
      return res.status(400).json({ error: 'URL must start with http:// or https://' });
    }

    const timeoutMs = parseInt(timeout) || 30000;
    const maxSizeBytes = parseInt(maxSize) || 5 * 1024 * 1024;
    
    const isHttps = url.startsWith('https://');
    const parsedHeaders = safeJsonParse(headers, {});
    const response = await axios.get(url, {
      timeout: timeoutMs,
      maxContentLength: maxSizeBytes,
      maxBodyLength: maxSizeBytes,
      headers: {
        'User-Agent': 'MCPConnect/1.0',
        'Accept': 'text/html,application/json,application/xml,text/plain,*/*',
        ...parsedHeaders
      },
      validateStatus: () => true,
      ...(isHttps ? {
        httpsAgent: new (require('https').Agent)({ 
          rejectUnauthorized: !config.allowSelfSignedCerts
        })
      } : {})
    });
    
    const contentType = response.headers['content-type'] || '';
    let content = '';
    
    if (contentType.includes('application/json')) {
      content = JSON.stringify(response.data, null, 2);
    } else {
      content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    }
    
    if (content.length > maxSizeBytes) {
      content = content.substring(0, maxSizeBytes) + '\n\n[Content truncated...]';
    }
    
    res.json({
      url,
      statusCode: response.status,
      contentType,
      contentLength: content.length,
      content: content.substring(0, 50000),
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Fetch URL error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch URL',
      message: error.message 
    });
  }
});

const fetchExternalMcpTools = async (userId, role) => {
  try {
    const { ExternalMcpServer } = loadModels();
    
    const servers = await ExternalMcpServer.findAll({ where: { isActive: true } });
    
    const allExternalTools = [];
    const fetchTimeout = 10000;
    
    for (const server of servers) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
        
        if (server.transportType === 'stdio') {
          const tools = await getStdioMcpTools(server.command, server.args, server.env, server.runtime);
          clearTimeout(timeoutId);
          
          await server.update({ lastFetchedAt: new Date(), lastFetchError: null });
          
          (tools.tools || []).forEach(tool => {
            allExternalTools.push({
              ...tool,
              input_schema: tool.input_schema || tool.inputSchema || null,
              inputSchema: tool.inputSchema || tool.input_schema || null,
              _id: `external-${server.id}-${tool.id || tool.name}`,
              source: 'external',
              externalServerId: server.id,
              externalServerName: server.name,
              externalServerUrl: 'stdio'
            });
          });
          continue;
        }
        
        const headers = {};
        if (server.authType === 'bearer' && server.authToken) {
          const encryption = require('../services/encryption');
          const token = encryption.decrypt(server.authToken);
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        } else if (server.authType === 'apiKey' && server.authToken) {
          const encryption = require('../services/encryption');
          const token = encryption.decrypt(server.authToken);
          if (token) {
            const headerName = server.authHeader || 'X-API-Key';
            headers[headerName] = token;
          }
        }
        
        let toolsUrl = server.url;
        if (!toolsUrl.includes('/tools')) {
          toolsUrl = toolsUrl.replace(/\/mcp$/, '') + '/tools';
        }
        
        const response = await fetch(toolsUrl, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          const tools = data.tools || [];
          
          await server.update({ lastFetchedAt: new Date(), lastFetchError: null });
          
          tools.forEach(tool => {
            allExternalTools.push({
              ...tool,
              input_schema: tool.input_schema || tool.inputSchema || null,
              inputSchema: tool.inputSchema || tool.input_schema || null,
              _id: `external-${server.id}-${tool.id || tool.name}`,
              source: 'external',
              externalServerId: server.id,
              externalServerName: server.name,
              externalServerUrl: server.url
            });
          });
        } else {
          await server.update({ lastFetchError: `HTTP ${response.status}` });
        }
      } catch (e) {
        const errorMsg = e.name === 'AbortError' ? 'Request timeout' : e.message;
        console.error(`Failed to fetch tools from external MCP server ${server.name}:`, errorMsg);
        try {
          await server.update({ lastFetchError: errorMsg });
        } catch (err) {}
      }
    }
    
    return allExternalTools;
  } catch (e) {
    console.error('Error fetching external MCP tools:', e);
    return [];
  }
};

async function getStdioMcpTools(command, args, envVars, runtime = 'node') {
  return new Promise((resolve, reject) => {
    const argsArray = safeJsonParse(args, []);
    const envVarsObj = safeJsonParse(envVars, {});
    
    const fullEnv = { ...process.env, ...envVarsObj };
    
    let cmd = command;
    let cmdArgs = argsArray;
    
    if (runtime === 'python') {
      cmd = 'python3';
      cmdArgs = ['-m', 'mcp', ...argsArray];
    }
    
    const proc = spawn(cmd, cmdArgs, {
      env: fullEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn process: ${err.message}`));
    });
    
    proc.on('close', (code) => {
      if (code !== 0 && stderr) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });
    
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    };
    
    proc.stdin.write(JSON.stringify(request) + '\n');
    
    setTimeout(() => {
      try {
        proc.kill();
      } catch (e) {}
      
      try {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const response = JSON.parse(lastLine);
        
        if (response.error) {
          reject(new Error(response.error.message || response.error));
        } else {
          resolve(response.result);
        }
      } catch (e) {
        reject(new Error(`Failed to parse response: ${e.message}. Output: ${stdout}`));
      }
    }, 30000);
  });
}

async function executeStdioMcpTool(command, args, envVars, toolName, arguments_, runtime = 'node') {
  return new Promise((resolve, reject) => {
    const argsArray = safeJsonParse(args, []);
    const envVarsObj = safeJsonParse(envVars, {});
    
    const fullEnv = { ...process.env, ...envVarsObj };
    
    let cmd = command;
    let cmdArgs = argsArray;
    
    if (runtime === 'python') {
      cmd = 'python3';
      cmdArgs = ['-m', 'mcp', ...argsArray];
    }
    
    const proc = spawn(cmd, cmdArgs, {
      env: fullEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn process: ${err.message}`));
    });
    
    proc.on('close', (code) => {
      if (code !== 0 && stderr) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });
    
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments_ || {}
      }
    };
    
    proc.stdin.write(JSON.stringify(request) + '\n');
    
    setTimeout(() => {
      try {
        proc.kill();
      } catch (e) {}
      
      try {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const response = JSON.parse(lastLine);
        
        if (response.error) {
          reject(new Error(response.error.message || response.error));
        } else {
          resolve(response.result);
        }
      } catch (e) {
        reject(new Error(`Failed to parse response: ${e.message}. Output: ${stdout}`));
      }
    }, 30000);
  });
}

router.get('/tools', checkMcpAuth, async (req, res) => {
  const cached = getCachedTools();
  if (cached) {
    return res.json(cached);
  }
  
  try {
    const userId = req.user?.id || null;
    const role = req.user?.role || 'user';
    
    const tools = await Tool.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'description', 'endpoint', 'inputSchema']
    });

    const localTools = tools.map(t => {
      const params = [];
      const pathMatch = t.endpoint.path.match(/\{([^}]+)\}/g);
      if (pathMatch) {
        pathMatch.forEach(p => {
          const paramName = p.replace(/[{}]/g, '');
          params.push({
            name: paramName,
            in: 'path',
            required: true,
            type: 'string',
            description: `Path parameter: ${paramName}`
          });
        });
      }

      const queryParams = t.endpoint.params || {};
      Object.entries(queryParams).forEach(([key, val]) => {
        if (val.required) {
          params.push({
            name: key,
            in: 'query',
            required: true,
            type: 'string',
            description: val.description || `Query parameter: ${key}`
          });
        }
      });

      let inputSchema = t.inputSchema || {};
      if (t.endpoint.body && t.endpoint.body.properties) {
        inputSchema = {
          type: 'object',
          properties: {
            ...(inputSchema.properties || {}),
            ...t.endpoint.body.properties
          },
          required: [
            ...(inputSchema.required || []),
            ...(t.endpoint.body.required || [])
          ]
        };
      }

      if (inputSchema.properties && ['POST', 'PUT', 'PATCH'].includes(t.endpoint.method)) {
        Object.entries(inputSchema.properties).forEach(([key, val]) => {
          params.push({
            name: key,
            in: 'body',
            required: (inputSchema.required || []).includes(key),
            type: val.type || 'string',
            description: val.description || `Body parameter: ${key}`
          });
        });
      }

      let mcpInputSchema = { type: 'object', properties: {} };
      if (inputSchema.properties) {
        mcpInputSchema.properties = {};
        Object.entries(inputSchema.properties).forEach(([key, val]) => {
          if (key === 'allOf' || key === 'anyOf' || key === 'oneOf' || key.startsWith('$')) return;
          if (val && typeof val === 'object' && val.type) {
            mcpInputSchema.properties[key] = val;
          } else {
            mcpInputSchema.properties[key] = { type: 'string', description: val?.description || key };
          }
        });
        mcpInputSchema.required = [...(inputSchema.required || [])].filter(k => mcpInputSchema.properties[k]);
      }

      const pathParams = t.endpoint.path.match(/\{([^}]+)\}/g) || [];
      pathParams.forEach(p => {
        const paramName = p.replace(/[{}]/g, '');
        mcpInputSchema.properties = mcpInputSchema.properties || {};
        if (!mcpInputSchema.properties[paramName]) {
          mcpInputSchema.properties[paramName] = { type: 'string', description: `Path parameter: ${paramName}` };
          mcpInputSchema.required = mcpInputSchema.required || [];
          if (!mcpInputSchema.required.includes(paramName)) {
            mcpInputSchema.required.push(paramName);
          }
        }
      });

      Object.entries(queryParams).forEach(([key, val]) => {
        mcpInputSchema.properties = mcpInputSchema.properties || {};
        if (!mcpInputSchema.properties[key]) {
          mcpInputSchema.properties[key] = { type: val.type || 'string', description: val.description || `Query parameter: ${key}` };
          if (val.required) {
            mcpInputSchema.required = mcpInputSchema.required || [];
            if (!mcpInputSchema.required.includes(key)) {
              mcpInputSchema.required.push(key);
            }
          }
        }
      });

      return {
        id: t.id,
        name: t.name,
        title: t.name,
        description: t.description,
        endpoint: t.endpoint,
        params,
        input_schema: mcpInputSchema,
        inputSchema: mcpInputSchema,
        schema: mcpInputSchema,
        schema_: mcpInputSchema,
        parameters: mcpInputSchema,
        source: 'local'
      };
    });
    
    const externalTools = await fetchExternalMcpTools(userId, role);
    
    const result = { tools: [...localTools, ...externalTools] };
    setCachedTools(result);
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching tools:', error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

router.get('/endpoints', async (req, res) => {
  const baseUrl = req.protocol + '://' + req.get('host') + '/api/mcp';
  
  res.json({
    name: 'MCPConnect API',
    version: '1.0.0',
    description: 'MCPConnect - Connect your integrations to Claude Code',
    endpoints: [
      {
        path: '/api/mcp/hello',
        method: 'GET',
        description: 'Health check endpoint',
        auth: 'None'
      },
      {
        path: '/api/mcp/tools',
        method: 'GET',
        description: 'List all available tools',
        auth: 'Optional (API Key or JWT)'
      },
      {
        path: '/api/mcp/execute',
        method: 'POST',
        description: 'Execute a tool by ID or name',
        auth: 'Optional (API Key or JWT)',
        body: {
          toolId: 'UUID of the tool (optional)',
          toolName: 'Name of the tool (optional)',
          params: 'Object of parameters (optional)',
          headers: 'Object of custom headers (optional)',
          body: 'Request body for POST/PUT/PATCH (optional)'
        }
      },
      {
        path: '/api/mcp/tool/:name/execute',
        method: 'GET',
        description: 'Execute a tool by name',
        auth: 'Optional (API Key or JWT)'
      }
    ],
    baseUrl,
    usage: {
      mcpWrapper: 'Use mcp-connect wrapper: mcp-connect -e MCP_CONNECT_URL=' + baseUrl,
      direct: 'Direct HTTP calls with X-API-Key header',
      example: {
        listTools: 'curl -H "X-API-Key: mcp_xxx" ' + baseUrl + '/tools',
        execute: 'curl -X POST -H "X-API-Key: mcp_xxx" -H "Content-Type: application/json" -d \'{"toolName":"hello"}\' ' + baseUrl + '/execute'
      }
    }
  });
});

router.post('/execute', checkMcpAuth, async (req, res) => {
  try {
    const { toolId, toolName, params, headers, body } = req.body;
    const { Tool, Integration, UserIntegrationCredentials, ExternalMcpServer } = loadModels();
    
    let tool;
    let isExternal = false;
    let externalServerId = null;
    let externalToolName = null;
    
    if (toolId && toolId.toString().startsWith('external-')) {
      const match = toolId.match(/external-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)/);
      if (match) {
        externalServerId = match[1];
        externalToolName = match[2];
        isExternal = true;
      }
    }
    
    if (isExternal && externalServerId) {
      const server = await ExternalMcpServer.findByPk(externalServerId);
      if (!server || !server.isActive) {
        return res.status(404).json({ error: 'External MCP server not found or inactive' });
      }
      
      if (server.transportType === 'stdio') {
        const result = await executeStdioMcpTool(server.command, server.args, server.env, externalToolName, params || body || {}, server.runtime);
        return res.json({
          success: true,
          tool: externalToolName,
          source: 'external',
          result
        });
      }
      
      const extHeaders = {
        'Content-Type': 'application/json'
      };
      
      if (server.authType === 'bearer' && server.authToken) {
        const token = encryption.decrypt(server.authToken);
        if (token) {
          extHeaders['Authorization'] = `Bearer ${token}`;
        }
      } else if (server.authType === 'apiKey' && server.authToken) {
        const token = encryption.decrypt(server.authToken);
        if (token) {
          const headerName = server.authHeader || 'X-API-Key';
          extHeaders[headerName] = token;
        }
      }
      
      const extResponse = await fetch(`${server.url}/execute`, {
        method: 'POST',
        headers: extHeaders,
        body: JSON.stringify({ toolName: externalToolName, params, body })
      });
      
      if (!extResponse.ok) {
        const errorText = await extResponse.text();
        return res.status(extResponse.status).json({ error: `External MCP error: ${errorText}` });
      }
      
      const extResult = await extResponse.json();
      return res.json({
        success: true,
        tool: externalToolName,
        source: 'external',
        result: extResult
      });
    }
    
    if (toolId) {
      tool = await Tool.findByPk(toolId);
    } else if (toolName) {
      tool = await Tool.findOne({ where: { name: toolName, isActive: true } });
    }
    
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    
    const userId = req.user?.id || req.apiKey?.userId;
    if (tool.rateLimit && tool.rateLimit > 0 && userId) {
      const rateCheck = checkRateLimit(tool.id, userId, tool.rateLimit);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          limit: tool.rateLimit,
          remaining: 0,
          retryAfter: rateCheck.resetIn
        });
      }
    }
    
    const integration = await Integration.findByPk(tool.integrationId);
    if (!integration || !integration.isActive) {
      return res.status(400).json({ error: 'Integration is not active' });
    }
    
    const authType = integration.config?.auth?.type || 'none';
    const requiresCredentials = authType !== 'none';
    const hasIntegrationCredentials = !!integration.config?.auth?.credentials;
    
    let userCreds = null;
    if (userId) {
      const userCredsRecord = await UserIntegrationCredentials.findOne({
        where: { userId, integrationId: integration.id, isActive: true }
      });
      if (userCredsRecord && userCredsRecord.credentials) {
        userCreds = encryption.decrypt(userCredsRecord.credentials);
      }
    }
    
    if (requiresCredentials && !hasIntegrationCredentials && !userCreds) {
      return res.status(403).json({ 
        error: 'Credentials required',
        message: `This integration requires authentication. Please configure your credentials first.`,
        integrationId: integration.id,
        integrationName: integration.name,
        authType
      });
    }
    
    let config = { ...integration.config };
    if (userCreds) {
      config.auth = userCreds;
    }
    
    const adapter = AdapterFactory.create(integration.type, config);
    
    if (tool.name === 'fetch-url' && tool.endpoint.method === 'GET') {
    const paramDefs = tool.endpoint.params || {};
    const paramValues = Object.entries(paramDefs).reduce((acc, [key, val]) => {
      if (val && typeof val === 'object' && 'required' in val) {
        return acc;
      }
      acc[key] = val;
      return acc;
    }, {});
    const mergedParams = { ...paramValues, ...params };
      const url = mergedParams.url;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
      if (typeof url !== 'string' || !url.match(/^https?:\/\/.+/)) {
        return res.status(400).json({ error: 'URL must be a valid http/https URL' });
      }
      
      try {
        const isHttps = url.startsWith('https://');
        const response = await axios.get(url, {
          timeout: parseInt(mergedParams.timeout) || 30000,
          maxContentLength: parseInt(mergedParams.maxSize) || 5 * 1024 * 1024,
          maxBodyLength: parseInt(mergedParams.maxSize) || 5 * 1024 * 1024,
          headers: {
            'User-Agent': 'MCPConnect/1.0',
            'Accept': 'text/html,application/json,application/xml,text/plain,*/*'
          },
          validateStatus: () => true,
          ...(isHttps ? { httpsAgent: new (require('https').Agent)({ rejectUnauthorized: !config.allowSelfSignedCerts }) } : {})
        });
        
        const contentType = response.headers['content-type'] || '';
        let content = contentType.includes('application/json') 
          ? JSON.stringify(response.data, null, 2) 
          : (typeof response.data === 'string' ? response.data : JSON.stringify(response.data));
        
        const maxSize = parseInt(mergedParams.maxSize) || 5 * 1024 * 1024;
        if (content.length > maxSize) {
          content = content.substring(0, maxSize) + '\n\n[Content truncated...]';
        }
        
        return res.json({
          success: true,
          tool: tool.name,
          toolId: tool.id,
          source: 'local',
          result: {
            url,
            statusCode: response.status,
            contentType,
            contentLength: content.length,
            content: content.substring(0, 50000),
            fetchedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch URL: ' + error.message });
      }
    }
    
    const paramDefs = tool.endpoint.params || {};
    const paramValues = Object.entries(paramDefs).reduce((acc, [key, val]) => {
      if (val && typeof val === 'object' && 'required' in val) {
        return acc;
      }
      acc[key] = val;
      return acc;
    }, {});
    const mergedParams = { ...paramValues, ...params };
    const mergedHeaders = { ...tool.endpoint.headers, ...headers };
    let path = tool.endpoint.path;
    const pathParams = {};
    const queryParams = {};
    let bodyParams = body || tool.endpoint.body || {};
    
    const transformConfig = tool.endpoint.transform || {};
    
    for (const [key, value] of Object.entries(mergedParams)) {
      if (path.includes(`{${key}}`)) {
        pathParams[key] = value;
      } else if (['POST', 'PUT', 'PATCH'].includes(tool.endpoint.method)) {
        if (transformConfig[key]) {
          const target = transformConfig[key].split('.');
          let current = bodyParams;
          for (let i = 0; i < target.length - 1; i++) {
            if (!current[target[i]]) current[target[i]] = {};
            current = current[target[i]];
          }
          current[target[target.length - 1]] = value;
        } else if (key !== 'workspace' && key !== 'repo_slug') {
          bodyParams[key] = value;
        }
      } else {
        queryParams[key] = value;
      }
    }
    
    for (const [key, value] of Object.entries(pathParams)) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }

    let result;
    
    try {
      switch (tool.endpoint.method) {
        case 'GET':
          result = await adapter.get(path, { params: queryParams, headers: mergedHeaders });
          break;
        case 'POST':
          result = await adapter.post(path, bodyParams, { params: queryParams, headers: mergedHeaders });
          break;
        case 'PUT':
          result = await adapter.put(path, bodyParams, { params: queryParams, headers: mergedHeaders });
          break;
        case 'PATCH':
          result = await adapter.patch(path, bodyParams, { params: queryParams, headers: mergedHeaders });
          break;
        case 'DELETE':
          result = await adapter.delete(path, { params: queryParams, headers: mergedHeaders });
          break;
        default:
          return res.status(400).json({ error: 'Unsupported method' });
      }
      
      res.json({
        success: true,
        tool: tool.name,
        toolId: tool.id,
        source: 'local',
        result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tools', optionalAuth, async (req, res) => {
  const cached = getCachedTools();
  if (cached) {
    return res.json(cached);
  }
  
  try {
    const userId = req.user?.id || null;
    const role = req.user?.role || 'user';
    
    const tools = await Tool.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'description', 'endpoint', 'inputSchema']
    });

    const localTools = tools.map(t => {
      const params = [];
      const pathMatch = t.endpoint.path.match(/\{([^}]+)\}/g);
      if (pathMatch) {
        pathMatch.forEach(p => {
          const paramName = p.replace(/[{}]/g, '');
          params.push({
            name: paramName,
            in: 'path',
            required: true,
            type: 'string',
            description: `Path parameter: ${paramName}`
          });
        });
      }

      const queryParams = t.endpoint.params || {};
      Object.entries(queryParams).forEach(([key, val]) => {
        if (val.required) {
          params.push({
            name: key,
            in: 'query',
            required: true,
            type: 'string',
            description: val.description || `Query parameter: ${key}`
          });
        }
      });

      const inputSchema = t.inputSchema || {};
      if (inputSchema.properties) {
        Object.entries(inputSchema.properties).forEach(([key, val]) => {
          const required = (inputSchema.required || []).includes(key);
          if (required) {
            params.push({
              name: key,
              in: 'body',
              required: true,
              type: val.type || 'string',
              description: val.description || `Body parameter: ${key}`
            });
          }
        });
      }

      let mcpInputSchema = { type: 'object', properties: {} };
      if (inputSchema.properties) {
        mcpInputSchema.properties = inputSchema.properties;
        mcpInputSchema.required = inputSchema.required || [];
      }

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        endpoint: t.endpoint,
        params,
        input_schema: mcpInputSchema,
        inputSchema: t.inputSchema || {},
        schema: mcpInputSchema,
        schema_: mcpInputSchema,
        parameters: mcpInputSchema
      };
    });

    const externalTools = await fetchExternalMcpTools(userId, role);

    const result = { tools: [...localTools, ...externalTools] };
    setCachedTools(result);
    
    res.json(result);
  } catch (error) {
    console.error('Tools error:', error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

module.exports = { router, clearToolsCache };
