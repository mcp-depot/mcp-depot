const express = require('express');
const Joi = require('joi');
const { spawn } = require('child_process');
const { auth, requireAdmin } = require('../middleware/auth');
const { loadModels } = require('../config/database');
const encryption = require('../services/encryption');

const router = express.Router();

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

const stdioMcpCache = new Map();

function safeJsonParse(value, defaultValue) {
  if (!value) return defaultValue;
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return defaultValue;
  }
}

async function callStdioMcp(command, args, envVars, method, params = {}, runtime = 'node') {
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
      method,
      params
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

async function getStdioMcpTools(command, args, envVars, runtime = 'node') {
  try {
    const result = await callStdioMcp(command, args, envVars, 'tools/list', {}, runtime);
    return result;
  } catch (error) {
    console.error('Stdio MCP tools error:', error.message);
    throw error;
  }
}

async function executeStdioMcpTool(command, args, envVars, toolName, arguments_, runtime = 'node') {
  try {
    const result = await callStdioMcp(command, args, envVars, 'tools/call', {
      name: toolName,
      arguments: arguments_ || {}
    }, runtime);
    return result;
  } catch (error) {
    console.error('Stdio MCP execute error:', error.message);
    throw error;
  }
}

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
    console.error('List external MCP servers error:', error);
    res.status(500).json({ error: 'Failed to list external MCP servers' });
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
    
    res.status(201).json({
      ...server.toJSON(),
      _id: server.id,
      authToken: '***'
    });
  } catch (error) {
    console.error('Create external MCP server error:', error);
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
    
    if (clearToolsCache) clearToolsCache();
    
    res.json({
      ...server.toJSON(),
      _id: server.id,
      authToken: server.authToken ? '***' : null
    });
  } catch (error) {
    console.error('Update external MCP server error:', error);
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
    
    if (clearToolsCache) clearToolsCache();
    
    res.json({ message: 'External MCP server deleted' });
  } catch (error) {
    console.error('Delete external MCP server error:', error);
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
    
    if (server.transportType === 'stdio') {
      const tools = await getStdioMcpTools(server.command, server.args, server.env, server.runtime);
      res.json(tools);
      return;
    }
    
    const headers = {};
    if (server.authType === 'bearer' && server.authToken) {
      const token = encryption.decrypt(server.authToken);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (server.authType === 'apiKey' && server.authToken) {
      const token = encryption.decrypt(server.authToken);
      if (token) {
        const headerName = server.authHeader || 'X-API-Key';
        headers[headerName] = token;
      }
    }
    
    const response = await fetch(`${server.url}/tools`, { headers });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `External MCP error: ${response.statusText}` });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Fetch external MCP tools error:', error);
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
    
    if (server.transportType === 'stdio') {
      const result = await executeStdioMcpTool(server.command, server.args, server.env, toolName, params || body || {}, server.runtime);
      res.json(result);
      return;
    }
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (server.authType === 'bearer' && server.authToken) {
      const token = encryption.decrypt(server.authToken);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (server.authType === 'apiKey' && server.authToken) {
      const token = encryption.decrypt(server.authToken);
      if (token) {
        const headerName = server.authHeader || 'X-API-Key';
        headers[headerName] = token;
      }
    }
    
    const response = await fetch(`${server.url}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ toolName, toolId, params, body })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `External MCP error: ${errorText}` });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Execute external MCP tool error:', error);
    res.status(500).json({ error: 'Failed to execute tool on external MCP server: ' + error.message });
  }
});

router.post('/install', auth, requireAdmin, async (req, res) => {
  try {
    const { packageName, runtime = 'node' } = req.body;
    
    if (!packageName || !packageName.trim()) {
      return res.status(400).json({ error: 'Package name is required' });
    }
    
    const { spawn } = require('child_process');
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
    console.error('Install npm package error:', error);
    res.status(500).json({ error: 'Failed to install package: ' + error.message });
  }
});

module.exports = { router, setClearToolsCache };
