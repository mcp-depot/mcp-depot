const express = require('express');
const Joi = require('joi');
const { spawn, execSync } = require('child_process');
const { auth, requireAdmin } = require('../middleware/auth');
const logger = require('../services/logger');
const { loadModels } = require('../config/database');
const encryption = require('../services/encryption');
const ExternalMcpTool = require('../models/ExternalMcpTool');

const router = express.Router();
const pool = require('../services/mcp-connection-pool');

function isCommandAvailable(cmd) {
  try {
    execSync(`${process.platform === 'win32' ? 'where' : 'which'} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let clearToolsCache = null;

function setClearToolsCache(fn) {
  clearToolsCache = fn;
}

const externalMcpSchema = Joi.object({
  name: Joi.string(),
  transportType: Joi.string().valid('http', 'stdio', 'sse'),
  runtime: Joi.string().valid('node', 'python'),
  url: Joi.string().uri().allow('', null),
  command: Joi.string().allow('', null),
  args: Joi.string().allow('', null),
  env: Joi.string().allow('', null),
  authType: Joi.string().valid('none', 'bearer', 'apiKey'),
  authToken: Joi.string().allow('', null),
  authHeader: Joi.string().allow('', null),
  isActive: Joi.boolean()
});

const externalMcpCreateSchema = Joi.object({
  name: Joi.string().required(),
  transportType: Joi.string().valid('http', 'stdio', 'sse').default('http'),
  runtime: Joi.string().valid('node', 'python').default('node'),
  url: Joi.string().uri().when('transportType', { is: 'http', then: Joi.string().required(), otherwise: Joi.string().allow('', null) }),
  command: Joi.string().when('transportType', { is: 'stdio', then: Joi.string().required(), otherwise: Joi.optional() }),
  args: Joi.string().when('transportType', { is: 'stdio', then: Joi.string().required(), otherwise: Joi.optional() }),
  env: Joi.string().allow('', null),
  authType: Joi.string().valid('none', 'bearer', 'apiKey').default('none'),
  authToken: Joi.string().allow('', null),
  authHeader: Joi.string().allow('', null),
  isActive: Joi.boolean().default(true)
});

router.get('/', auth, async (req, res) => {
  try {
    const { ExternalMcpServer } = loadModels();
    
    const where = req.user.role === 'admin' 
      ? {} 
      : { userId: req.user.id };
    
    const servers = await ExternalMcpServer.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
    
    res.json(servers.map(s => ({
      ...s.toJSON(),
      _id: s.id,
      authToken: s.authToken ? '***' : null
    })));
  } catch (error) {
    logger.error({ error: error.message }, 'List external MCP servers error');
    res.status(500).json({ error: 'Failed to list external MCP servers' });
  }
});

router.get('/pool-status', auth, async (req, res) => {
  try {
    res.json(pool.getPoolStatus());
  } catch (error) {
    logger.error({ error: error.message }, 'Get pool status error');
    res.status(500).json({ error: 'Failed to get pool status' });
  }
});

const SUPPORTED_REGISTRY_TYPES = ['npm', 'pypi'];
const REGISTRY_CACHE = { data: null, fetchedAt: 0 };
const REGISTRY_CACHE_TTL = 60 * 60 * 1000;

async function fetchAllRegistryServers(query = '') {
  const supported = [];
  let cursor = null;

  do {
    const url = new URL('https://registry.modelcontextprotocol.io/v0.1/servers');
    url.searchParams.set('limit', '50');
    if (query) url.searchParams.set('search', query);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`Registry returned ${response.status}`);

    const data = await response.json();
    const page = data.servers || [];

    for (const item of page) {
      const pkg = item?.server?.packages?.[0];
      if (pkg && SUPPORTED_REGISTRY_TYPES.includes(pkg.registryType)) {
        supported.push(item);
      }
    }

    cursor = data.metadata?.nextCursor || null;
  } while (cursor);

  return supported;
}

router.get('/registry/search', auth, async (req, res) => {
  try {
    const { q = '' } = req.query;
    const now = Date.now();

    let allServers;
    if (!q && REGISTRY_CACHE.data && (now - REGISTRY_CACHE.fetchedAt) < REGISTRY_CACHE_TTL) {
      allServers = REGISTRY_CACHE.data;
    } else {
      allServers = await fetchAllRegistryServers(q);
      if (!q) {
        REGISTRY_CACHE.data = allServers;
        REGISTRY_CACHE.fetchedAt = now;
      }
    }

    res.json({ servers: allServers });
  } catch (err) {
    logger.error({ error: err.message }, 'Registry fetch error');
    res.status(502).json({ error: 'Failed to reach MCP registry' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = externalMcpCreateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { ExternalMcpServer } = loadModels();
    
    let authToken = value.authToken;
    if (authToken) {
      authToken = encryption.encrypt(authToken);
    }
    
    const server = await ExternalMcpServer.create({
      ...value,
      authToken,
      userId: req.user.id
    });

    if (clearToolsCache) clearToolsCache();

    // Fire-and-forget: pre-warm connection pool
    if (server.isActive) {
      pool.getClient(server).catch(err =>
        logger.warn({ serverId: server.id, err: err.message }, 'Background pre-connect failed')
      );
    }

    res.status(201).json({
      ...server.toJSON(),
      _id: server.id,
      authToken: '***'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Create external MCP server error');
    res.status(500).json({ error: 'Failed to create external MCP server' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const where = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const { ExternalMcpServer } = loadModels();
    
    const server = await ExternalMcpServer.findOne({ where });
    if (!server) {
      return res.status(404).json({ error: 'External MCP server not found' });
    }
    
    const { error, value } = externalMcpSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const updates = { ...value };
    if (value.authToken) {
      updates.authToken = encryption.encrypt(value.authToken);
    } else if (value.authToken === '') {
      updates.authToken = null;
    }
    
    await server.update(updates);

    pool.disconnect(server.id);

    // Fire-and-forget: re-connect with new config
    if (server.isActive) {
      pool.getClient(server).catch(err =>
        logger.warn({ serverId: server.id, err: err.message }, 'Background re-connect failed')
      );
    }

    if (clearToolsCache) clearToolsCache();
    
    res.json({
      ...server.toJSON(),
      _id: server.id,
      authToken: server.authToken ? '***' : null
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Update external MCP server error');
    res.status(500).json({ error: 'Failed to update external MCP server' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const where = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const { ExternalMcpServer } = loadModels();
    
    const server = await ExternalMcpServer.findOne({ where });
    if (!server) {
      return res.status(404).json({ error: 'External MCP server not found' });
    }
    
    await server.destroy();
    
    pool.disconnect(req.params.id);
    
    if (clearToolsCache) clearToolsCache();
    
    res.json({ message: 'External MCP server deleted' });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete external MCP server error');
    res.status(500).json({ error: 'Failed to delete external MCP server' });
  }
});

router.get('/:id/tools', auth, async (req, res) => {
  try {
    const { ExternalMcpServer } = loadModels();
    
    const where = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const server = await ExternalMcpServer.findOne({ where });
    if (!server) {
      return res.status(404).json({ error: 'External MCP server not found' });
    }
    
    const tools = await pool.listTools(server);
    res.json({ tools });
  } catch (error) {
    logger.error({ error: error.message }, 'Fetch external MCP tools error');
    res.status(500).json({ error: 'Failed to fetch tools from external MCP server: ' + error.message });
  }
});

router.post('/:id/execute', auth, async (req, res) => {
  try {
    const { ExternalMcpServer } = loadModels();
    
    const where = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };
    
    const server = await ExternalMcpServer.findOne({ where });
    if (!server) {
      return res.status(404).json({ error: 'External MCP server not found' });
    }
    
    const { toolName, toolId, params, body } = req.body;
    
    const result = await pool.callTool(server, toolName, params || body || {});
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Execute external MCP tool error');
    res.status(500).json({ error: 'Failed to execute tool on external MCP server: ' + error.message });
  }
});

router.post('/install', auth, requireAdmin, async (req, res) => {
  try {
    const { packageName, runtime = 'node' } = req.body;
    
    if (!packageName || !packageName.trim()) {
      return res.status(400).json({ error: 'Package name is required' });
    }
    
    if (runtime === 'python') {
      if (!isCommandAvailable('pip') && !isCommandAvailable('pip3')) {
        return res.status(422).json({
          error: 'pip is not installed or not on PATH. Please install Python from https://python.org and restart MCP Depot.'
        });
      }
    } else {
      if (!isCommandAvailable('npm')) {
        return res.status(422).json({
          error: 'npm is not installed or not on PATH. Please install Node.js from https://nodejs.org and restart MCP Depot.'
        });
      }
    }
    
    const pkgName = packageName.trim();
    
    return new Promise((resolve, reject) => {
      let cmd, args;
      
      if (runtime === 'python') {
        cmd = 'pip3';
        args = ['install', '--break-system-packages', pkgName];
      } else {
        cmd = 'npm';
        args = ['install', '-g', pkgName];
      }
      
      const proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          res.json({ success: true, message: `Successfully installed ${packageName}` });
        } else {
          reject(new Error(stderr || `Exit code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(err);
      });
      
      setTimeout(() => {
        try { proc.kill(); } catch (e) {}
        reject(new Error('Installation timed out'));
      }, 120000);
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Install npm package error');
    res.status(500).json({ error: 'Failed to install package: ' + error.message });
  }
});

// GET /:id/tools/managed - list tools with enable/disable status
router.get('/:id/tools/managed', auth, async (req, res) => {
  try {
    const { ExternalMcpServer } = loadModels();

    const where = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };

    const server = await ExternalMcpServer.findOne({ where });
    if (!server) {
      return res.status(404).json({ error: 'External MCP server not found' });
    }

    const tools = await ExternalMcpTool.findAll({
      where: { externalMcpServerId: req.params.id },
      order: [['namespacedName', 'ASC']]
    });

    res.json(tools);
  } catch (error) {
    logger.error({ error: error.message }, 'List managed external MCP tools error');
    res.status(500).json({ error: 'Failed to list managed tools' });
  }
});

// PATCH /:id/tools/:toolName - enable or disable a single tool
router.patch('/:id/tools/:toolName', auth, async (req, res) => {
  try {
    const { ExternalMcpServer } = loadModels();

    const where = req.user.role === 'admin'
      ? { id: req.params.id }
      : { id: req.params.id, userId: req.user.id };

    const server = await ExternalMcpServer.findOne({ where });
    if (!server) {
      return res.status(404).json({ error: 'External MCP server not found' });
    }

    const tool = await ExternalMcpTool.findOne({
      where: { externalMcpServerId: req.params.id, toolName: req.params.toolName }
    });
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    await tool.update({ isActive: req.body.isActive });
    if (clearToolsCache) clearToolsCache();
    res.json(tool);
  } catch (error) {
    logger.error({ error: error.message }, 'Update managed external MCP tool error');
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

module.exports = { router, setClearToolsCache };
