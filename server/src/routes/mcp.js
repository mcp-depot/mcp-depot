const express = require('express');
const Joi = require('joi');
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
const { pruneNulls } = require('../services/body-utils');
const encryption = require('../services/encryption');
const config = require('../config/env');
const { getTools: stdioGetTools, callTool: stdioCallTool, validateJsonRpcResponse } = require('../services/stdio-mcp');
const { checkRateLimit } = require('../services/rate-limiter');
const logger = require('../services/logger');

const router = express.Router();

const executeToolSchema = Joi.object({
  toolId: Joi.string(),
  toolName: Joi.string(),
  params: Joi.object().default({}),
  headers: Joi.object().default({}),
  body: Joi.any()
}).or('toolId', 'toolName');

function safeJsonParse(value, defaultValue) {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (e) {
    logger.error({ error: e.message }, 'JSON parse error');
    return defaultValue;
  }
}

function coerceParam(value, paramDefs, key) {
  const type = paramDefs?.[key]?.type;
  if (type === 'number' || type === 'integer') return Number(value);
  if (type === 'boolean') return value === 'true' || value === true;
  return value;
}

function substituteBodyTemplate(obj, params, paramDefs = {}) {
  if (typeof obj === 'string') {
    const sole = obj.match(/^\{(\w+)\}$/);
    if (sole && params[sole[1]] !== undefined) {
      return coerceParam(params[sole[1]], paramDefs, sole[1]);
    }
    return obj.replace(/\{(\w+)\}/g, (match, key) =>
      params[key] !== undefined ? coerceParam(params[key], paramDefs, key) : match
    );
  }
  if (Array.isArray(obj)) {
    return obj.map(item => substituteBodyTemplate(item, params, paramDefs));
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteBodyTemplate(value, params, paramDefs);
    }
    return result;
  }
  return obj;
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
    message: 'Hello from MCP Depot!',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Session Context internal routes - exposed via DB seed tools
const DEFAULT_TTL_HOURS = 168; // 7 days

router.post('/session-contexts/store', async (req, res) => {
  try {
    const { name, content, shared = false, ttlHours: rawTtl = DEFAULT_TTL_HOURS } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');
    const callerId = req.user?.id ?? null;
    const ttlHours = rawTtl === 0 ? null : rawTtl; // 0 = pin forever

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name },
      defaults: { id: randomUUID(), name, content, isShared: shared, ttlHours, createdBy: callerId }
    });
    if (!created) {
      if (ctx.createdBy !== null && ctx.createdBy !== callerId) {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      await ctx.update({ content, isShared: shared, ttlHours });
    }
    const expiresAt = ttlHours != null
      ? new Date(Date.now() + ttlHours * 3600000).toISOString()
      : 'never';
    res.json({ success: true, name, chars: content.length, shared, ttlHours, expiresAt, created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session-contexts/get', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { SessionContext } = loadModels();
    const callerId = req.user?.id ?? null;
    const ctx = await SessionContext.findOne({
      where: callerId
        ? { name, [require('sequelize').Op.or]: [{ createdBy: callerId }, { isShared: true }, { createdBy: null }] }
        : { name, [require('sequelize').Op.or]: [{ isShared: true }, { createdBy: null }] }
    });
    if (!ctx) return res.status(404).json({ error: `No context found with name '${name}'` });
    res.json({ name: ctx.name, content: ctx.content, updatedAt: ctx.updatedAt, isShared: ctx.isShared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session-contexts/list', async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const { Op } = require('sequelize');
    const callerId = req.user?.id ?? null;

    const where = callerId
      ? { [Op.or]: [{ createdBy: callerId }, { isShared: true }, { createdBy: null }] }
      : { [Op.or]: [{ isShared: true }, { createdBy: null }] };

    const all = await SessionContext.findAll({ where, order: [['updatedAt', 'DESC']] });
    res.json(all.map(c => {
      const expiresAt = c.ttlHours != null
        ? new Date(new Date(c.updatedAt).getTime() + c.ttlHours * 3600000).toISOString()
        : null;
      return {
        name: c.name,
        isShared: c.isShared,
        ttlHours: c.ttlHours,
        expiresAt,
        updatedAt: c.updatedAt,
        chars: c.content.length
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/session-contexts/delete', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { SessionContext } = loadModels();
    const callerId = req.user?.id ?? null;
    const ctx = await SessionContext.findOne({ where: { name } });
    if (!ctx) return res.status(404).json({ error: `No context found with name '${name}'` });
    if (callerId !== null && ctx.createdBy !== callerId) {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    await ctx.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Session Channel internal routes
router.post('/session-channels', async (req, res) => {
  try {
    const { channel, message } = req.body;
    if (!channel || !message) return res.status(400).json({ error: 'channel and message are required' });
    const { SessionChannel } = loadModels();
    const callerId = req.user?.id ?? null;
    await SessionChannel.create({
      id: require('crypto').randomUUID(),
      channel,
      message,
      createdBy: callerId
    });
    res.json({ success: true, channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session-channels/read', async (req, res) => {
  try {
    const { channel } = req.query;
    if (!channel) return res.status(400).json({ error: 'channel is required' });
    const { since } = req.query;
    const { SessionChannel } = loadModels();
    const { Op } = require('sequelize');
    const where = { channel };
    if (since) where.createdAt = { [Op.gt]: new Date(since) };
    const messages = await SessionChannel.findAll({ where, order: [['createdAt', 'ASC']] });
    if (messages.length === 0) return res.json({ channel, messages: [], count: 0 });
    res.json({
      channel,
      messages: messages.map(m => ({ id: m.id, message: m.message, createdAt: m.createdAt, createdBy: m.createdBy })),
      count: messages.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy path-param route for direct access
router.get('/session-channels/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    const { since } = req.query;
    const { SessionChannel } = loadModels();
    const { Op } = require('sequelize');
    const where = { channel };
    if (since) where.createdAt = { [Op.gt]: new Date(since) };
    const messages = await SessionChannel.findAll({
      where,
      order: [['createdAt', 'ASC']]
    });
    if (messages.length === 0) {
      return res.json({ channel, messages: [], count: 0 });
    }
    res.json({
      channel,
      messages: messages.map(m => ({
        id: m.id,
        message: m.message,
        createdAt: m.createdAt,
        createdBy: m.createdBy
      })),
      count: messages.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session-channels', async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const all = await SessionChannel.findAll({ order: [['createdAt', 'DESC']] });
    const channelMap = new Map();
    for (const m of all) {
      if (!channelMap.has(m.channel)) {
        channelMap.set(m.channel, { channel: m.channel, messageCount: 0, lastActivity: m.createdAt });
      }
      const entry = channelMap.get(m.channel);
      entry.messageCount++;
    }
    const channels = Array.from(channelMap.values()).sort((a, b) => 
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/session-channels/clear', async (req, res) => {
  try {
    const { channel } = req.query;
    if (!channel) return res.status(400).json({ error: 'channel is required' });
    const { SessionChannel } = loadModels();
    const deleted = await SessionChannel.destroy({ where: { channel } });
    res.json({ success: true, channel, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy path-param route for direct access
router.delete('/session-channels/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    const { SessionChannel } = loadModels();
    const deleted = await SessionChannel.destroy({ where: { channel } });
    res.json({ success: true, channel, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
        'User-Agent': 'MCP-Depot/1.0',
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
    logger.error({ error: error.message, url: url }, 'Fetch URL error');
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
    
    if (servers.length === 0) return [];
    
    const fetchTimeout = 10000;
    
    // Fetch all servers in parallel
    async function fetchOneServer(server) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
      
      try {
        let tools = [];
        
        if (server.transportType === 'stdio') {
          tools = await getStdioMcpTools(server.command, server.args, server.env, server.runtime, controller.signal);
          clearTimeout(timeoutId);
          const toolsList = tools?.tools || [];
          return { server, tools: toolsList, error: null };
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
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        tools = data.tools || [];
        
        return { server, tools, error: null };
      } catch (err) {
        const msg = err.name === 'AbortError' ? 'Timeout' : err.message;
        return { server, tools: [], error: msg };
      } finally {
        clearTimeout(timeoutId);
      }
    }
    
    // Fetch all servers in parallel - total time = slowest single server
    const results = await Promise.allSettled(servers.map(fetchOneServer));
    
    // Process results and collect tools
    const allExternalTools = [];
    const serverStatusUpdates = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { server, tools, error } = result.value;
        
        // Store update for later (outside the fetch loop)
        serverStatusUpdates.push({ server, error });
        
        // Add tools to result
        for (const tool of tools) {
          allExternalTools.push({
            ...tool,
            input_schema: tool.input_schema || tool.inputSchema || null,
            inputSchema: tool.inputSchema || tool.input_schema || null,
            _id: `external-${server.id}-${tool.id || tool.name}`,
            source: 'external',
            externalServerId: server.id,
            externalServerName: server.name,
            externalServerUrl: server.transportType === 'stdio' ? 'stdio' : server.url
          });
        }
      }
    }
    
    // Update all servers after fetching (parallel to each other, not blocking fetches)
    await Promise.allSettled(serverStatusUpdates.map(async ({ server, error }) => {
      try {
        await server.update({
          lastFetchedAt: new Date(),
          lastFetchError: error
        });
      } catch (updateErr) {
        logger.error({ err: updateErr.message }, 'Failed to update external MCP server status');
      }
    }));
    
    return allExternalTools;
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to fetch external MCP tools');
    return [];
  }
};

async function getStdioMcpTools(command, args, envVars, runtime = 'node', signal = null) {
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
    
    // Internal timeout as backstop - reduced from 30s to 10s
    const internalTimeout = setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      reject(new Error('Stdio timeout'));
    }, 10000);
    
    // Listen for external abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(internalTimeout);
        try { proc.kill(); } catch (e) {}
        reject(new Error('Timeout'));
      }, { once: true });
    }
    
    // Check for response once stdout has data
    const checkInterval = setInterval(() => {
      const lines = stdout.trim().split('\n');
      if (lines.length > 0) {
        clearInterval(checkInterval);
        clearTimeout(internalTimeout);
        try {
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
      }
    }, 100);
    
    // Clean up on resolve/reject
    const cleanup = () => clearInterval(checkInterval);
    resolve.then(cleanup).catch(cleanup);
    reject.then(cleanup).catch(cleanup);
  });
}

async function executeStdioMcpTool(command, args, envVars, toolName, params, runtime = 'node') {
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
      include: [{
        model: Integration,
        as: 'integration',
        where: { isActive: true },
        attributes: []
      }],
      attributes: ['id', 'name', 'description', 'endpoint', 'inputSchema', 'type']
    });

    const localTools = tools.map(t => {
      if (t.type === 'composite') {
        const inputSchema = t.inputSchema || {};
        const mcpInputSchema = {
          type: 'object',
          properties: inputSchema.properties || {},
          required: inputSchema.required || []
        };
        return {
          id: t.id,
          name: t.name,
          title: t.name,
          description: t.description,
          endpoint: t.endpoint,
          params: [],
          input_schema: mcpInputSchema,
          inputSchema: mcpInputSchema,
          schema: mcpInputSchema,
          schema_: mcpInputSchema,
          parameters: mcpInputSchema,
          source: 'local',
          toolType: 'composite'
        };
      }

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
        params.push({
          name: key,
          in: 'query',
          required: val.required === true,
          type: 'string',
          description: val.description || `Query parameter: ${key}`
        });
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

      const OPENAPI_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'not', '$ref']);

      if (inputSchema.properties && ['POST', 'PUT', 'PATCH'].includes(t.endpoint.method)) {
        Object.entries(inputSchema.properties)
          .filter(([key]) => !OPENAPI_KEYWORDS.has(key))
          .forEach(([key, val]) => {
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
        Object.entries(inputSchema.properties)
          .filter(([key]) => !OPENAPI_KEYWORDS.has(key))
          .forEach(([key, val]) => {
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
        source: 'local',
        toolType: 'simple'
      };
    });
    
    const externalTools = await fetchExternalMcpTools(userId, role);
    
    const result = { tools: [...localTools, ...externalTools] };
    setCachedTools(result);
    
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching tools');
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

router.get('/skills', async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const skills = await PromptLibrary.findAll({
      attributes: ['id', 'name', 'description', 'inputs', 'prompt', 'outputFormat', 'isShared', 'isDefault', 'userId']
    });
    
    const formattedSkills = skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      inputs: skill.inputs || [],
      outputFormat: skill.outputFormat || 'text',
      isShared: skill.isShared || false,
      isDefault: skill.isDefault || false,
      promptPreview: skill.prompt ? skill.prompt.substring(0, 100) + (skill.prompt.length > 100 ? '...' : '') : ''
    }));

    res.json({ skills: formattedSkills });
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching skills');
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

router.get('/skills/:name', async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const skill = await PromptLibrary.findOne({
      where: { name: req.params.name }
    });

    if (!skill) {
      return res.status(404).json({ error: `Skill "${req.params.name}" not found` });
    }

    res.json({
      name:        skill.name,
      description: skill.description,
      content:     skill.prompt,
      install: {
        fileName:    'SKILL.md',
        directory:   skill.name,
        location:    'your global user-specific skills directory',
        instructions: `Save the content field as a file named SKILL.md inside a sub-directory called "${skill.name}" in your global user-specific skills directory. Once saved the skill will be available as /${skill.name}.`
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching skill');
    res.status(500).json({ error: 'Failed to fetch skill' });
  }
});

router.post('/skills/invoke/:id', async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const skill = await PromptLibrary.findByPk(req.params.id);
    
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    const { inputs = {} } = req.body;
    const renderedPrompt = renderSkillPrompt(skill.prompt, inputs);
    
    let result;
    if (skill.outputFormat === 'json') {
      try {
        result = JSON.parse(renderedPrompt);
      } catch {
        result = { output: renderedPrompt };
      }
    } else if (skill.outputFormat === 'markdown') {
      result = { format: 'markdown', content: renderedPrompt };
    } else {
      result = { format: 'text', content: renderedPrompt };
    }
    
    res.json({
      skillId: skill.id,
      skillName: skill.name,
      rendered: renderedPrompt,
      result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error invoking skill');
    res.status(500).json({ error: 'Failed to invoke skill' });
  }
});

function renderSkillPrompt(prompt, inputValues) {
  let rendered = prompt || '';
  
  Object.entries(inputValues || {}).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, value !== undefined && value !== null ? String(value) : '');
    
    const conditionalStart = new RegExp(`\\{\\{#${key}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
    rendered = rendered.replace(conditionalStart, (match, content) => {
      return (value && String(value).trim()) ? content : '';
    });
    
    const conditionalInverse = new RegExp(`\\{\\{\\^{${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
    rendered = rendered.replace(conditionalInverse, (match, content) => {
      return (!value || !String(value).trim()) ? content : '';
    });
  });
  
  return rendered;
}

router.get('/endpoints', checkMcpAuth, async (req, res) => {
  const baseUrl = req.protocol + '://' + req.get('host') + '/api/mcp';
  
  res.json({
    name: 'MCP Depot API',
    version: '1.0.0',
    description: 'MCP Depot - Connect your integrations to Claude Code',
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
    const { error, value } = executeToolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { toolId, toolName, params, headers, body } = value;
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

    if (tool.type === 'composite') {
      const { executeCompositeTool } = require('../services/compositeExecutor');
      const userId = req.user?.id || req.apiKey?.userId;
      try {
        const result = await executeCompositeTool(tool, params || body || {}, userId);
        return res.json({
          success: true,
          tool: tool.name,
          toolId: tool.id,
          source: 'local',
          result
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
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
    
    const isSharedForUser = integration.visibility === 'shared' && 
                           integration.userId !== userId && 
                           req.user?.role !== 'admin';
    
    let userCreds = null;
    if (userId) {
      const userCredsRecord = await UserIntegrationCredentials.findOne({
        where: { userId, integrationId: integration.id, isActive: true }
      });
      if (userCredsRecord && userCredsRecord.credentials) {
        const decrypted = encryption.decrypt(userCredsRecord.credentials);
        userCreds = JSON.parse(decrypted);
      }
    }
    
    if (requiresCredentials && isSharedForUser && !userCreds) {
      return res.status(403).json({ 
        error: 'Credentials required',
        message: 'Please connect to this shared integration and add your credentials first.',
        integrationId: integration.id,
        integrationName: integration.name,
        authType
      });
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
    if (isSharedForUser) {
      if (userCreds) {
        config.auth = { ...integration.config.auth, credentials: userCreds };
      } else {
        config.auth = { type: 'none' };
      }
    } else if (userCreds) {
      config.auth = { ...integration.config.auth, credentials: userCreds };
    }
    
    if (integration.name === 'MCP Depot' || integration.name === 'MCP Depot Sessions') {
      const apiKey = req.headers['x-api-key'];
      const jwt = req.headers['authorization'];
      if (apiKey) {
        config = { ...config, headers: { ...config.headers, 'x-api-key': apiKey } };
      } else if (jwt) {
        config = { ...config, headers: { ...config.headers, 'Authorization': jwt } };
      }
    }
    
    const adapter = AdapterFactory.create(integration.type, {
      ...config,
      integrationId: integration.id
    }, { userId });
    
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
            'User-Agent': 'MCP-Depot/1.0',
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
    const hasBodyTemplate = !!(tool.endpoint.body && Object.keys(tool.endpoint.body).length > 0);
    
    for (const [key, value] of Object.entries(mergedParams)) {
      if (value === null || value === undefined) continue;  // Skip null/undefined values
      
      if (path.includes(`{${key}}`)) {
        pathParams[key] = value;
      } else if (['POST', 'PUT', 'PATCH'].includes(tool.endpoint.method)) {
        const bodyTemplateVars = new Set(
          (JSON.stringify(tool.endpoint.body || {}).match(/\{(\w+)\}/g) || [])
            .map(m => m.slice(1, -1))
        );
        
        if (bodyTemplateVars.has(key)) {
          if (transformConfig[key]) {
            const target = transformConfig[key].split('.');
            let current = bodyParams;
            for (let i = 0; i < target.length - 1; i++) {
              if (!current[target[i]]) current[target[i]] = {};
              current = current[target[i]];
            }
            current[target[target.length - 1]] = value;
          }
        } else if (transformConfig[key]) {
          const target = transformConfig[key].split('.');
          let current = bodyParams;
          for (let i = 0; i < target.length - 1; i++) {
            if (!current[target[i]]) current[target[i]] = {};
            current = current[target[i]];
          }
          current[target[target.length - 1]] = value;
        } else if (!hasBodyTemplate && key !== 'workspace' && key !== 'repo_slug') {
          bodyParams[key] = value;
        }
      } else {
        queryParams[key] = value;
      }
    }
    
    for (const [key, value] of Object.entries(pathParams)) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }

    if (typeof bodyParams === 'object' && bodyParams !== null) {
      bodyParams = substituteBodyTemplate(bodyParams, mergedParams, tool.endpoint.params || {});
      bodyParams = pruneNulls(bodyParams);
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

      const userId = req.user?.id || req.apiKey?.userId;
      const fullUrl = `${integration.config.baseUrl}${path}${Object.keys(queryParams).length > 0 ? '?' + new URLSearchParams(queryParams).toString() : ''}`;
      await logToolCall({
        toolId: tool.id,
        userId,
        integrationId: integration.id,
        callerId: req.apiKey?.id || null,
        callerType: req.apiKey ? 'api' : 'rest',
        method: tool.endpoint.method,
        path: tool.endpoint.path,
        fullUrl,
        requestHeaders: mergedHeaders,
        requestBody: bodyParams,
        queryParams,
        responseStatus: 200,
        responseBody: result,
        responseTime: 0,
        success: true,
      });
    } catch (error) {
      const errorDetail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : (error?.message || String(error));
      const fullUrl = `${integration.config.baseUrl}${path}${Object.keys(queryParams).length > 0 ? '?' + new URLSearchParams(queryParams).toString() : ''}`;
      res.status(500).json({ error: errorDetail });

      await logToolCall({
        toolId: tool.id,
        userId,
        integrationId: integration.id,
        callerId: req.apiKey?.id || null,
        callerType: req.apiKey ? 'api' : 'rest',
        method: tool.endpoint.method,
        path: tool.endpoint.path,
        fullUrl,
        requestHeaders: mergedHeaders,
        requestBody: bodyParams,
        queryParams,
        responseStatus: error.response?.status || 500,
        responseBody: { error: errorDetail },
        responseTime: 0,
        success: false,
        errorMessage: errorDetail,
      });
    }
  } catch (error) {
    const errorDetail = error?.response?.data
      ? JSON.stringify(error.response.data)
      : (error?.message || String(error));
    res.status(500).json({ error: errorDetail });
  }
});

module.exports = { router, clearToolsCache };
