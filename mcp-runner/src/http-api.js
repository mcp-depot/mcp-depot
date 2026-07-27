const express = require('express');
const path = require('path');
const os = require('os');
const { z } = require('zod');
const { spawn, execSync } = require('child_process');
const serverRegistry = require('./server-registry');
const logger = require('./logger');

const router = express.Router();

// Same default as server/src/index.js's MCP_PACKAGES_PATH - this is where
// installs must land for the spawned processes here to find them (PATH/
// NODE_PATH/PYTHONPATH are wired to this exact location on this side too;
// see index.js), and, in Docker/Kubernetes, where the mcp-packages
// volume/PVC is mounted so an install survives this container restarting.
const MCP_PACKAGES_PATH = process.env.MCP_PACKAGES_PATH || path.join(os.homedir(), '.mcphub', 'packages');

const ALLOWED_STDIO_COMMANDS = ['node', 'python', 'python3', 'uvx', 'npx'];
const PACKAGE_NAME_RE = /^(@?[\w\-.]+\/)?[\w\-.]+(@[\w.\-]+)?$/;

function isCommandAvailable(cmd) {
  try {
    execSync(`${process.platform === 'win32' ? 'where' : 'which'} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Requests only ever come from the main server, over a network reachable
// only from inside the same pod/Compose network - not from end users - but
// a shared token still means someone with generic network access to that
// internal network can't spawn arbitrary commands here without it.
function requireToken(req, res, next) {
  const requiredToken = process.env.MCP_RUNNER_TOKEN;
  if (!requiredToken) return next();
  const provided = req.header('X-Runner-Token');
  if (provided !== requiredToken) {
    return res.status(401).json({ error: 'Invalid or missing runner token' });
  }
  next();
}

const registerSchema = z.object({
  serverId: z.string().min(1),
  command: z.enum(ALLOWED_STDIO_COMMANDS),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({})
});

router.post('/register', requireToken, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
  }
  const { serverId, command, args, env } = parsed.data;
  serverRegistry.register(serverId, { command, args, env });
  logger.info({ serverId, command, args }, 'Registered external MCP server for spawning');
  res.json({ ok: true });
});

router.delete('/register/:serverId', requireToken, (req, res) => {
  serverRegistry.unregister(req.params.serverId);
  res.json({ ok: true });
});

const installSchema = z.object({
  packageName: z.string().min(1),
  runtime: z.enum(['node', 'python']).default('node')
});

router.post('/install', requireToken, (req, res) => {
  const parsed = installSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
  }
  const { packageName, runtime } = parsed.data;

  if (!PACKAGE_NAME_RE.test(packageName)) {
    return res.status(400).json({ error: 'Invalid package name format' });
  }

  if (runtime === 'python') {
    if (!isCommandAvailable('pip') && !isCommandAvailable('pip3')) {
      return res.status(422).json({ error: 'pip is not available in the mcp-runner image.' });
    }
  } else if (!isCommandAvailable('npm')) {
    return res.status(422).json({ error: 'npm is not available in the mcp-runner image.' });
  }

  let cmd, args;
  if (runtime === 'python') {
    cmd = 'pip3';
    args = ['install', '--break-system-packages', '--target', path.join(MCP_PACKAGES_PATH, 'python'), packageName];
  } else {
    cmd = 'npm';
    args = ['install', '-g', '--prefix', path.join(MCP_PACKAGES_PATH, 'node'), packageName];
  }

  const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let settled = false;

  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  const timeoutHandle = setTimeout(() => {
    if (settled) return;
    settled = true;
    try { proc.kill(); } catch (e) { /* ignore */ }
    res.status(500).json({ error: 'Installation timed out' });
  }, 120000);

  proc.on('close', (code) => {
    clearTimeout(timeoutHandle);
    if (settled) return;
    settled = true;
    if (code === 0) {
      res.json({ success: true, message: `Successfully installed ${packageName}` });
    } else {
      logger.error({ packageName, code, stderr }, 'Install package error');
      res.status(500).json({ error: 'Failed to install package: ' + (stderr || `Exit code ${code}`) });
    }
  });

  proc.on('error', (err) => {
    clearTimeout(timeoutHandle);
    if (settled) return;
    settled = true;
    logger.error({ packageName, err: err.message }, 'Install package error');
    res.status(500).json({ error: 'Failed to install package: ' + err.message });
  });
});

router.get('/health', (req, res) => {
  res.json({ ok: true, registered: serverRegistry.size() });
});

module.exports = router;
