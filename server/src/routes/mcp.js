const express = require('express');
const Joi = require('joi');
const { spawn } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const { sequelize, connectDB, loadModels } = require('../config/database');
const { auth, optionalApiKey, authWithApiKey, optionalAuth } = require('../middleware/auth');
const { checkMcpAuth } = require('../middleware/mcpAuth');
const Tool = require('../models/Tool');
const Integration = require('../models/Integration');
const User = require('../models/User');
const AdapterFactory = require('../adapters');
const { logToolCall } = require('../services/tool-logger');
const { pruneNulls } = require('../services/body-utils');
const encryption = require('../services/encryption');
const config = require('../config/env');
const INTERNAL_SECRET = config.internalSecret;
const { getTools: stdioGetTools, callTool: stdioCallTool, validateJsonRpcResponse } = require('../services/stdio-mcp');
const { checkRateLimit } = require('../services/rate-limiter');
const logger = require('../services/logger');
const pool = require('../services/mcp-connection-pool');

function getCallerId(req) {
  if (
    req.headers['x-internal-secret'] === config.internalSecret &&
    req.headers['x-internal-user-id']
  ) {
    return req.headers['x-internal-user-id'];
  }
  return req.user?.id ?? null;
}

const router = express.Router();

const executeToolSchema = Joi.object({
  toolId: Joi.string(),
  toolName: Joi.string(),
  params: Joi.object().default({}),
  headers: Joi.object().default({}),
  body: Joi.any(),
  sessionId: Joi.string().optional()
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

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 32);
}

function substituteBodyTemplate(obj, params, paramDefs = {}) {
  if (typeof obj === 'string') {
    const sole = obj.match(/^\{(\w+)\}$/);
    if (sole) {
      if (params[sole[1]] !== undefined) {
        return coerceParam(params[sole[1]], paramDefs, sole[1]);
      }
      return null;
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

const toolsCache = new Map();

function getCachedTools(userId) {
  if (!TOOLS_CACHE_ENABLED) return null;
  const entry = toolsCache.get(userId || 'anon');
  if (entry && (Date.now() - entry.timestamp) < TOOLS_CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCachedTools(userId, tools) {
  if (!TOOLS_CACHE_ENABLED) return;
  toolsCache.set(userId || 'anon', { data: tools, timestamp: Date.now() });
}

function clearToolsCache() {
  toolsCache.clear();
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

router.post('/session-contexts/store', optionalAuth, async (req, res) => {
  try {
    const { name, content, shared = false } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');
    const callerId = getCallerId(req);
    const MAX_TTL_HOURS = 8760;
    const ttlProvided = Object.prototype.hasOwnProperty.call(req.body, 'ttlHours');
    const rawTtl = ttlProvided ? req.body.ttlHours : undefined;
    const rawNum = (rawTtl !== undefined && rawTtl !== null) ? Number(rawTtl) : DEFAULT_TTL_HOURS;
    const ttlHours = rawNum === 0 ? null : Math.min(rawNum, MAX_TTL_HOURS);

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name },
      defaults: { id: randomUUID(), name, content, isShared: shared, ttlHours, createdBy: callerId }
    });
    if (!created) {
      if (ctx.createdBy !== null && ctx.createdBy !== callerId) {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      const updateFields = { content, isShared: shared };
      if (ttlProvided) updateFields.ttlHours = ttlHours;
      await ctx.update(updateFields);
    }
    const expiresAt = ttlHours != null
      ? new Date(Date.now() + ttlHours * 3600000).toISOString()
      : 'never';
    res.json({ success: true, name, chars: content.length, shared, ttlHours, expiresAt, created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session-contexts/get', optionalAuth, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { SessionContext } = loadModels();
    const callerId = getCallerId(req);
    const callerRole = req.user?.role ?? 'user';
    const ctx = await SessionContext.findOne({
      where: callerId
        ? callerRole === 'admin'
          ? { name, [require('sequelize').Op.or]: [{ createdBy: callerId }, { isShared: true }, { createdBy: null }] }
          : { name, [require('sequelize').Op.or]: [{ createdBy: callerId }, { isShared: true }] }
        : { name, isShared: true }
    });
    if (!ctx) return res.status(404).json({ error: `No context found with name '${name}'` });
    res.json({ name: ctx.name, content: ctx.content, updatedAt: ctx.updatedAt, isShared: ctx.isShared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session-contexts/list', optionalAuth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const { Op } = require('sequelize');
    const callerId = getCallerId(req);
    const callerRole = req.user?.role ?? 'user';

    const where = callerId
      ? callerRole === 'admin'
        ? { [Op.or]: [{ createdBy: callerId }, { isShared: true }, { createdBy: null }] }
        : { [Op.or]: [{ createdBy: callerId }, { isShared: true }] }
      : { isShared: true };

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

router.delete('/session-contexts/delete', optionalAuth, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { SessionContext } = loadModels();
    const callerId = getCallerId(req);
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
router.post('/session-channels', optionalAuth, async (req, res) => {
  try {
    const { channel, message } = req.body;
    if (!channel || !message) return res.status(400).json({ error: 'channel and message are required' });
    const { SessionChannel } = loadModels();
    const callerId = getCallerId(req);
    const entry = await SessionChannel.create({
      id: require('crypto').randomUUID(),
      channel,
      message,
      createdBy: callerId
    });
    const channelEmitter = require('../services/channel-events');
    channelEmitter.emit(channel, entry.toJSON());
    const mcpServer = require('../mcp/server');
    if (mcpServer._pushChannelNotification) {
      mcpServer._pushChannelNotification(channel, entry);
    }
    if (mcpServer._pushResourceUpdate) {
      mcpServer._pushResourceUpdate(channel);
    }
    res.json({ success: true, channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session-channels/read', optionalAuth, async (req, res) => {
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
router.get('/session-channels/:channel', optionalAuth, async (req, res) => {
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

router.get('/session-channels', optionalAuth, async (req, res) => {
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

router.delete('/session-channels/clear', optionalAuth, async (req, res) => {
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
router.delete('/session-channels/:channel', optionalAuth, async (req, res) => {
  try {
    const { channel } = req.params;
    const { SessionChannel } = loadModels();
    const deleted = await SessionChannel.destroy({ where: { channel } });
    res.json({ success: true, channel, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /session-channels/:channel/watch — long-poll for CLI proxy watch_channel tool
router.get('/session-channels/:channel/watch', optionalAuth, async (req, res) => {
  try {
    const channel = req.params.channel;
    const channelEmitter = require('../services/channel-events');
    const timeoutMs = Math.min(parseInt(req.query.timeout) || 25, 25) * 1000;

    const msg = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        channelEmitter.off(channel, handler);
        resolve(null);
      }, timeoutMs);

      const handler = (data) => {
        clearTimeout(timer);
        resolve(data);
      };

      channelEmitter.once(channel, handler);
    });

    if (msg) {
      res.json({ message: msg.message, postedAt: msg.createdAt, channel: msg.channel, timedOut: false });
    } else {
      res.json({ timedOut: true, channel });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /session-channels/:channel/subscribe — subscribe to push notifications
router.post('/session-channels/:channel/subscribe', checkMcpAuth, async (req, res) => {
  try {
    const channel = req.params.channel;
    const mcpServer = require('../mcp/server');

    let sessionId = req.headers['x-session-id'];

    if (!sessionId && mcpServer._sessionClientMap) {
      for (const [id, entry] of mcpServer._sessionClientMap) {
        if (entry.userId && (entry.userId === req.user?.id || entry.apiKey === req.user?.apiKey)) {
          sessionId = id;
          break;
        }
      }
    }

    if (!sessionId) return res.status(400).json({ error: 'No active session found for this user' });

    if (!mcpServer._channelSubscriptions.has(channel)) {
      mcpServer._channelSubscriptions.set(channel, new Set());
    }
    mcpServer._channelSubscriptions.get(channel).add(sessionId);
    res.json({ subscribed: true, channel, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /session-channels/:channel/subscribe — unsubscribe from push notifications
router.delete('/session-channels/:channel/subscribe', checkMcpAuth, async (req, res) => {
  try {
    const channel = req.params.channel;
    const mcpServer = require('../mcp/server');

    let sessionId = req.headers['x-session-id'];

    if (!sessionId && mcpServer._sessionClientMap) {
      for (const [id, entry] of mcpServer._sessionClientMap) {
        if (entry.userId && (entry.userId === req.user?.id || entry.apiKey === req.user?.apiKey)) {
          sessionId = id;
          break;
        }
      }
    }

    if (sessionId && mcpServer._channelSubscriptions.has(channel)) {
      mcpServer._channelSubscriptions.get(channel).delete(sessionId);
      if (mcpServer._channelSubscriptions.get(channel).size === 0) {
        mcpServer._channelSubscriptions.delete(channel);
      }
    }
    res.json({ unsubscribed: true, channel });
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
    const { ExternalMcpServer, ExternalMcpTool } = loadModels();

    const servers = await ExternalMcpServer.findAll({ where: { isActive: true } });

    if (servers.length === 0) return [];

    // Fetch all servers in parallel using the connection pool
    const results = await Promise.allSettled(servers.map(async (server) => {
      try {
        const tools = await pool.listTools(server);

        // Hash-based change detection
        const toolsHash = crypto.createHash('sha256')
          .update(JSON.stringify(tools.map(t => ({ name: t.name, description: t.description })).sort((a, b) => a.name.localeCompare(b.name))))
          .digest('hex');

        // Compare with stored hash - if unchanged, skip DB update
        const hashChanged = server.toolsHash !== toolsHash;

        // Upsert discovered tools into ExternalMcpTool only when hash changed
        if (hashChanged) {
          const serverName = sanitizeName(server.name);
          for (const tool of tools) {
            await ExternalMcpTool.upsert({
              externalMcpServerId: server.id,
              toolName: tool.name,
              namespacedName: `${serverName}__${tool.name}`,
              description: tool.description || null,
              inputSchema: tool.inputSchema || tool.input_schema || {},
              lastSeenAt: new Date()
            }, {
              conflictFields: ['externalMcpServerId', 'toolName']
            });
          }
        }

        // Store update for server
        await server.update({
          lastFetchedAt: new Date(),
          lastFetchError: null,
          ...(hashChanged ? { toolsHash } : {})
        });

        // Fetch only active tools from ExternalMcpTool for this server
        const activeTools = await ExternalMcpTool.findAll({
          where: { externalMcpServerId: server.id, isActive: true }
        });

        // Map to the format expected by the tools endpoint
        const externalTools = activeTools.map(t => ({
          ...t.inputSchema,
          input_schema: t.inputSchema,
          name: t.namespacedName,
          _originalName: t.toolName,
          _id: `external-${server.id}-${t.toolName}`,
          source: 'external',
          externalServerId: server.id,
          externalServerName: server.name,
          externalServerUrl: server.transportType === 'stdio' ? 'stdio' : server.url
        }));

        return { server, tools: externalTools, error: null };
      } catch (err) {
        await server.update({
          lastFetchedAt: new Date(),
          lastFetchError: err.message
        }).catch(() => {});
        return { server, tools: [], error: err.message };
      }
    }));

    // Collect all external tools
    const allExternalTools = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.tools) {
        allExternalTools.push(...result.value.tools);
      }
    }

    return allExternalTools;
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to fetch external MCP tools');
    return [];
  }
};

router.get('/tools', checkMcpAuth, async (req, res) => {
  const userId = req.user?.id || null;
  const role = req.user?.role || 'user';

  const cached = getCachedTools(userId);
  if (cached) {
    return res.json(cached);
  }
  
  try {
    const tools = await Tool.findAll({
      where: { isActive: true },
      include: [{
        model: Integration,
        as: 'integration',
        where: { isActive: true },
        attributes: ['userId', 'visibility']
      }],
      attributes: ['id', 'name', 'description', 'endpoint', 'inputSchema', 'type']
    });

    const visibleTools = tools.filter(t => {
      if (!t.integration) return false;
      if (role === 'admin') return true;
      return t.integration.visibility === 'shared' || t.integration.userId === userId;
    });

    const localTools = visibleTools.map(t => {
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
        source: 'local',
        toolType: 'simple'
      };
    });
    
    const externalTools = await fetchExternalMcpTools(userId, role);
    
    const result = { tools: [...localTools, ...externalTools] };
    setCachedTools(userId, result);
    
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

// Meta-tool HTTP routes — mirrors MCP Depot - AI Tools
router.get('/list-integrations', checkMcpAuth, async (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const entry = mcpServer.toolsMap?.get('mcp_list_integrations');
    if (!entry) return res.status(503).json({ error: 'AI Tools not initialized' });
    const result = await entry.handler({});
    res.json({ result: result.content?.[0]?.text || JSON.stringify(result) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/describe-tool', checkMcpAuth, async (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const entry = mcpServer.toolsMap?.get('mcp_describe_tool');
    if (!entry) return res.status(503).json({ error: 'AI Tools not initialized' });
    const result = await entry.handler({ name: req.query.name });
    res.json({ result: result.content?.[0]?.text || JSON.stringify(result) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/register-integration', checkMcpAuth, async (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const entry = mcpServer.toolsMap?.get('mcp_register_integration');
    if (!entry) return res.status(503).json({ error: 'AI Tools not initialized' });
    const result = await entry.handler(req.body);
    const text = result.content?.[0]?.text || JSON.stringify(result);
    res.status(result.isError ? 400 : 201).json({ result: text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/register-tool', checkMcpAuth, async (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const entry = mcpServer.toolsMap?.get('mcp_register_tool');
    if (!entry) return res.status(503).json({ error: 'AI Tools not initialized' });
    const result = await entry.handler(req.body);
    const text = result.content?.[0]?.text || JSON.stringify(result);
    res.status(result.isError ? 400 : 201).json({ result: text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/remove-tool', checkMcpAuth, async (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const entry = mcpServer.toolsMap?.get('mcp_remove_tool');
    if (!entry) return res.status(503).json({ error: 'AI Tools not initialized' });
    const result = await entry.handler(req.body);
    const text = result.content?.[0]?.text || JSON.stringify(result);
    res.status(result.isError ? 400 : 200).json({ result: text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create/Update skill via MCP
router.post('/skills', authWithApiKey, async (req, res) => {
  try {
    const { PromptLibrary, User } = loadModels();
    const { name, description, prompt, inputs, outputFormat, isShared, tags } = req.body;
    if (!name || !prompt) {
      return res.status(400).json({ error: 'name and prompt are required' });
    }
    const existing = await PromptLibrary.findOne({ where: { name } });
    if (existing) {
      await existing.update({
        description, prompt,
        ...(inputs !== undefined ? { inputs } : {}),
        outputFormat: outputFormat || 'text',
        isShared: isShared || false,
        ...(tags !== undefined ? { tags } : {})
      });
      return res.json({ created: false, skill: { id: existing.id, name: existing.name, description: existing.description } });
    }
    const admin = await User.findOne({ where: { role: 'admin' } });
    const skill = await PromptLibrary.create({
      userId: admin?.id,
      name, description, prompt,
      ...(inputs !== undefined ? { inputs } : {}),
      outputFormat: outputFormat || 'text',
      isShared: isShared || false,
      isDefault: false,
      ...(tags !== undefined ? { tags } : {})
    });
    const mcpServer = require('../mcp/server');
    if (mcpServer.refreshTools) await mcpServer.refreshTools();
    res.status(201).json({ created: true, skill: { id: skill.id, name: skill.name, description: skill.description } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/skills/:name', authWithApiKey, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const skill = await PromptLibrary.findOne({ where: { name: req.params.name } });
    if (!skill) return res.status(404).json({ error: `Skill "${req.params.name}" not found` });
    const { description, prompt, inputs, outputFormat, isShared, tags } = req.body;
    await skill.update({
      description:  description  !== undefined ? description  : skill.description,
      prompt:       prompt       !== undefined ? prompt       : skill.prompt,
      inputs:       inputs       !== undefined ? inputs       : skill.inputs,
      outputFormat: outputFormat !== undefined ? outputFormat : skill.outputFormat,
      isShared:     isShared     !== undefined ? isShared     : skill.isShared,
      tags:         tags         !== undefined ? tags         : skill.tags
    });
    const mcpServer = require('../mcp/server');
    if (mcpServer.refreshTools) await mcpServer.refreshTools();
    res.json({ updated: true, skill: { id: skill.id, name: skill.name, description: skill.description } });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const mcpServer = require('../mcp/server');

    const { error, value } = executeToolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { toolId, toolName, params, headers, body, sessionId: cliSessionId } = value;

    if (cliSessionId && mcpServer._sessionClientMap?.has(cliSessionId)) {
      const cliSession = mcpServer._sessionClientMap.get(cliSessionId);
      if (!cliSession.userName && req.user) {
        cliSession.userName = req.user.name || req.user.email || null;
        cliSession.userId = req.user.id;
        mcpServer._broadcastSessions?.();
      }
    }

    let callerType = req.apiKey ? 'api' : 'rest';
    if (cliSessionId && mcpServer._sessionClientMap?.has(cliSessionId)) {
      const cliSession = mcpServer._sessionClientMap.get(cliSessionId);
      if (cliSession.clientName) {
        callerType = cliSession.clientName;
      }
    }

    for (const [key, sess] of mcpServer._sessionClientMap?.entries() || []) {
      if (key !== 'stdio' && !key.startsWith('user-')) {
        sess.lastCallAt = new Date().toISOString();
      }
    }

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

      // Strip namespace prefix to get original tool name for the server
      const originalToolName = externalToolName;

      try {
        const result = await pool.callTool(server, originalToolName, params || body || {});
        return res.json({
          success: true,
          tool: originalToolName,
          source: 'external',
          result
        });
      } catch (err) {
        return res.status(500).json({ error: `External MCP error: ${err.message}` });
      }
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

    if (tool.type === 'meta') {
      const mcpServer = require('../mcp/server');
      try {
        const entry = mcpServer.toolsMap.get(tool.name);
        if (!entry) {
          return res.status(404).json({ error: `Meta-tool "${tool.name}" handler not found. Enable the "MCP Depot - AI Tools" integration.` });
        }
        const result = await entry.handler(params || body || {});
        const text = result.content?.[0]?.text || JSON.stringify(result);
        return res.json({
          success: true,
          tool: tool.name,
          toolId: tool.id,
          source: 'local',
          result: text
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
    
    const userId = req.user?.id || req.apiKey?.userId;
    const integration = await Integration.findByPk(tool.integrationId);
    if (!integration || !integration.isActive) {
      return res.status(400).json({ error: 'Integration is not active' });
    }

    if (userId) {
      const toolLimit = tool.rateLimit || 0;
      const intLimit = integration.rateLimit || {};
      const integrationLimitRpm = intLimit.requestsPerMinute || 0;
      const integrationLimitRph = intLimit.requestsPerHour || 0;
      const rateCheck = checkRateLimit(tool.id, userId, toolLimit, integrationLimitRpm, integrationLimitRph);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          level: rateCheck.level,
          limit: rateCheck.limit,
          remaining: 0,
          retryAfter: rateCheck.resetInSeconds
        });
      }

      res.set('X-RateLimit-Tool-Remaining', String(rateCheck.toolRemaining !== Infinity ? rateCheck.toolRemaining : ''));
      res.set('X-RateLimit-Integration-Remaining', String(rateCheck.integrationRemaining !== Infinity ? rateCheck.integrationRemaining : ''));
      res.set('X-RateLimit-Reset', String(rateCheck.resetInSeconds));
    }
    
    const authType = integration.config?.auth?.type || 'none';
    const requiresCredentials = authType !== 'none';
    const hasIntegrationCredentials = !!(integration.config?.auth?.credentials || integration.config?.auth?.key);
    
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
    
    if (integration.name === 'MCP Depot' || integration.name === 'MCP Depot Sessions' || integration.name === 'MCP Depot - AI Tools') {
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
          bodyParams[key] = coerceParam(value, paramDefs, key);
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

    if (req.body?.sessionId && req.body.sessionId !== 'undefined') {
      mergedHeaders['X-Session-Id'] = req.body.sessionId;
    }

    const internalUserId = req.user?.id || req.apiKey?.userId;
    if (internalUserId) {
      mergedHeaders['X-Internal-Secret'] = INTERNAL_SECRET;
      mergedHeaders['X-Internal-User-Id'] = String(internalUserId);
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

      if (cliSessionId) {
        mcpServer._updateSession?.(cliSessionId, tool.name, true);
      }

      const userId = req.user?.id || req.apiKey?.userId;
      const fullUrl = `${integration.config.baseUrl}${path}${Object.keys(queryParams).length > 0 ? '?' + new URLSearchParams(queryParams).toString() : ''}`;
      await logToolCall({
        toolId: tool.id,
        userId,
        integrationId: integration.id,
        callerId: req.apiKey?.id || null,
        callerType,
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

      if (cliSessionId) {
        mcpServer._updateSession?.(cliSessionId, tool?.name, false);
      }

      await logToolCall({
        toolId: tool.id,
        userId,
        integrationId: integration.id,
        callerId: req.apiKey?.id || null,
        callerType,
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

function fmtDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

router.post('/sessions/register', checkMcpAuth, (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const { sessionId, clientName, clientVersion } = req.body;
    const existing = sessionId && mcpServer._sessionClientMap?.get(sessionId);
    let id;
    if (existing) {
      existing.lastCallAt = new Date().toISOString();
      if (clientName) existing.clientName = clientName;
      if (clientVersion) existing.clientVersion = clientVersion;
      if (!existing.userId && req.user?.id) existing.userId = req.user.id;
      id = existing.sessionId;
    } else {
      id = sessionId || `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      mcpServer._sessionClientMap = mcpServer._sessionClientMap || new Map();
      mcpServer._sessionClientMap.set(id, {
        sessionId: id,
        clientName: clientName || 'mcp-depot-cli',
        clientVersion: clientVersion || '0.0.0',
        userId: req.user?.id || null,
        userName: req.user?.username || null,
        connectedAt: new Date().toISOString(),
        lastCallAt: new Date().toISOString(),
        lastTool: null,
        callCount: 0
      });
    }
    if (mcpServer._broadcastSessions) mcpServer._broadcastSessions();
    res.json({ sessionId: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sessions/deregister', (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const { sessionId } = req.body;
    if (sessionId && mcpServer._sessionClientMap) {
      mcpServer._removeSessionSubscriptions(sessionId);
      mcpServer._sessionClientMap.delete(sessionId);
    }
    if (mcpServer._broadcastSessions) mcpServer._broadcastSessions();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /sessions/:sessionId/notifications — SSE stream for CLI proxy push notifications
router.get('/sessions/:sessionId/notifications', async (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    const { sessionId } = req.params;
    const entry = mcpServer._sessionClientMap.get(sessionId);
    if (!entry) return res.status(404).json({ error: 'Session not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    entry.notificationRes = res;

    const keepalive = setInterval(() => { try { res.write(': keepalive\n\n'); } catch {} }, 30_000);

    req.on('close', () => {
      clearInterval(keepalive);
      if (entry.notificationRes === res) entry.notificationRes = null;
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions', auth, (req, res) => {
  try {
    const mcpServer = require('../mcp/server');
    let sessions = mcpServer.getActiveSessions ? mcpServer.getActiveSessions() : [];
    if (req.user.role !== 'admin') {
      sessions = sessions.filter(s => s.userId === req.user.id);
    }
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sessions/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const mcpServer = require('../mcp/server');
  if (mcpServer.addSseClient) {
    mcpServer.addSseClient(res);
  } else {
    res.write(`event: sessions\ndata: ${JSON.stringify([])}\n\n`);
  }
});

// Resource listing
router.get('/resources', checkMcpAuth, async (req, res) => {
  try {
    const { SessionChannel } = require('../config/database').loadModels();
    const rows = await SessionChannel.findAll({ attributes: ['channel'], group: ['channel'], raw: true });
    res.json({
      resources: rows.map(r => ({
        uri: `channel://${r.channel}`,
        name: r.channel,
        description: `Session channel: ${r.channel}`,
        mimeType: 'text/plain'
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resource read
router.get('/resources/read', checkMcpAuth, async (req, res) => {
  try {
    const uri = req.query.uri;
    if (!uri) return res.status(400).json({ error: 'uri required' });
    const channelName = uri.replace('channel://', '');
    const { SessionChannel } = require('../config/database').loadModels();
    const messages = await SessionChannel.findAll({
      where: { channel: channelName },
      order: [['createdAt', 'ASC']],
      limit: 100
    });
    const text = messages.length
      ? messages.map(m => `[${new Date(m.createdAt).toISOString()}] ${m.message}`).join('\n')
      : '(empty channel)';
    res.json({ contents: [{ uri, mimeType: 'text/plain', text }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resource subscribe (for CLI proxy sessions)
router.post('/resources/subscribe', checkMcpAuth, async (req, res) => {
  try {
    const { uri, sessionId } = req.body;
    if (!uri || !sessionId) return res.status(400).json({ error: 'uri and sessionId required' });
    const mcpServer = require('../mcp/server');
    if (!mcpServer._resourceSubscriptions.has(uri)) {
      mcpServer._resourceSubscriptions.set(uri, new Set());
    }
    mcpServer._resourceSubscriptions.get(uri).add(sessionId);
    res.json({ subscribed: true, uri, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resource unsubscribe (for CLI proxy sessions)
router.post('/resources/unsubscribe', checkMcpAuth, async (req, res) => {
  try {
    const { uri, sessionId } = req.body;
    const mcpServer = require('../mcp/server');
    if (mcpServer._resourceSubscriptions.has(uri)) {
      mcpServer._resourceSubscriptions.get(uri).delete(sessionId);
      if (mcpServer._resourceSubscriptions.get(uri).size === 0) {
        mcpServer._resourceSubscriptions.delete(uri);
      }
    }
    res.json({ unsubscribed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent internal routes
const { Op } = require('sequelize');

function normalizeTools(tools) {
  if (!tools || tools === '[]') return [];
  if (Array.isArray(tools)) return tools;
  if (typeof tools === 'string') {
    try {
      const parsed = JSON.parse(tools);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return tools.split(',').map(t => t.trim()).filter(Boolean);
  }
  return [];
}

function serializeTools(tools) {
  if (!tools || tools === '[]') return '';
  if (Array.isArray(tools)) return tools.join(', ');
  return tools;
}

function generateInstallConfig(agent, clientType, tools) {
  const toolsList = normalizeTools(tools);
  const toolsStr = toolsList.length ? toolsList.join(', ') : 'read, grep, bash';

  if (clientType === 'claude-code') {
    return {
      clientType: 'claude-code',
      installPath: `.claude/agents/${agent.name}/AGENT.md`,
      content: `---
description: ${agent.description || `${agent.role} agent`}
tools: [${toolsStr}]
model: ${agent.model || ''}
---
${agent.systemPrompt}`
    };
  }

  if (clientType === 'opencode') {
    return {
      clientType: 'opencode',
      installPath: `.opencode/agents/${agent.name}.md`,
      content: `# ${agent.name}\n\n${agent.systemPrompt}`
    };
  }

  return { clientType: 'generic', agent: { ...agent.toJSON(), tools: toolsList } };
}

router.get('/agents', optionalAuth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const callerId = getCallerId(req);
    const callerRole = req.user?.role ?? 'user';
    const where = callerId
      ? callerRole === 'admin'
        ? {}
        : { [Op.or]: [{ createdBy: callerId }, { isShared: true }] }
      : { isShared: true };
    const agents = await Agent.findAll({ where, order: [['name', 'ASC']] });
    res.json(agents);
  } catch (error) {
    logger.error({ error: error.message }, 'List agents error');
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

router.get('/agents/:name', optionalAuth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const callerId = getCallerId(req);
    const callerRole = req.user?.role ?? 'user';
    const where = { name: req.params.name };
    if (callerId && callerRole !== 'admin') {
      where[Op.or] = [{ createdBy: callerId }, { isShared: true }];
    } else if (!callerId) {
      where.isShared = true;
    }
    const agent = await Agent.findOne({ where });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    const response = agent.toJSON();
    response.tools = normalizeTools(agent.tools);
    const clientType = req.query.clientType;
    if (clientType) {
      response.installConfig = generateInstallConfig(agent, clientType.toLowerCase(), response.tools);
    }
    res.json(response);
  } catch (error) {
    logger.error({ error: error.message }, 'Get agent error');
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

router.post('/agents', optionalAuth, async (req, res) => {
  try {
    const { name, role, systemPrompt, description, isShared, tools, model } = req.body;
    if (!name || !role || !systemPrompt) {
      return res.status(400).json({ error: 'name, role, and systemPrompt are required' });
    }
    const { Agent } = loadModels();
    const callerId = getCallerId(req);
    const [agent, created] = await Agent.findOrCreate({
      where: { name },
      defaults: {
        name, role, systemPrompt,
        description: description || '',
        isShared: isShared || false,
        tools: serializeTools(tools),
        model: model || null,
        createdBy: callerId
      }
    });
    if (!created) {
      return res.status(409).json({ error: `Agent "${name}" already exists. Use PUT to update.` });
    }
    res.status(201).json(agent);
  } catch (error) {
    logger.error({ error: error.message }, 'Create agent error');
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.put('/agents/:name', optionalAuth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const callerId = getCallerId(req);
    const callerRole = req.user?.role ?? 'user';
    const where = { name: req.params.name };
    if (callerRole !== 'admin') {
      where.createdBy = callerId;
    }
    const agent = await Agent.findOne({ where });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or you do not own it' });
    }
    const { role, systemPrompt, description, isShared, tools, model } = req.body;
    const updates = {};
    if (role !== undefined) updates.role = role;
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (description !== undefined) updates.description = description;
    if (isShared !== undefined) updates.isShared = isShared;
    if (tools !== undefined) updates.tools = serializeTools(tools);
    if (model !== undefined) updates.model = model;
    await agent.update(updates);
    res.json(agent);
  } catch (error) {
    logger.error({ error: error.message }, 'Update agent error');
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

router.delete('/agents/:name', optionalAuth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const callerId = getCallerId(req);
    const callerRole = req.user?.role ?? 'user';
    const where = { name: req.params.name };
    if (callerRole !== 'admin') {
      where.createdBy = callerId;
    }
    const agent = await Agent.findOne({ where });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or you do not own it' });
    }
    await agent.destroy();
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete agent error');
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

module.exports = { router, clearToolsCache };
