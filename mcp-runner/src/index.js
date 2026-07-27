require('dotenv').config();

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mirrors server/src/index.js's wiring exactly - this is the container that
// now actually spawns stdio external MCP servers (see spawn-bridge.js, which
// inherits this process's env into the child), so package installs done via
// POST /install (http-api.js) are unreachable to those spawned processes
// without this.
const MCP_PACKAGES_PATH = process.env.MCP_PACKAGES_PATH ||
  path.join(os.homedir(), '.mcphub', 'packages');

fs.mkdirSync(path.join(MCP_PACKAGES_PATH, 'node'), { recursive: true });
fs.mkdirSync(path.join(MCP_PACKAGES_PATH, 'python'), { recursive: true });

const pathSep = process.platform === 'win32' ? ';' : ':';
const nodeBin = path.join(MCP_PACKAGES_PATH, 'node', 'bin');
const pythonBin = path.join(MCP_PACKAGES_PATH, 'python', 'bin');
process.env.PATH = `${nodeBin}${pathSep}${pythonBin}${pathSep}${process.env.PATH}`;
process.env.NODE_PATH = path.join(MCP_PACKAGES_PATH, 'node', 'lib', 'node_modules');
process.env.PYTHONPATH = process.env.PYTHONPATH
  ? `${path.join(MCP_PACKAGES_PATH, 'python')}${pathSep}${process.env.PYTHONPATH}`
  : path.join(MCP_PACKAGES_PATH, 'python');
process.env.MCP_PACKAGES_PATH = MCP_PACKAGES_PATH;

const http = require('http');
const express = require('express');
const httpApi = require('./http-api');
const { attachWsBridge } = require('./ws-bridge');
const processRegistry = require('./process-registry');
const logger = require('./logger');

const PORT = process.env.PORT || 9500;

const app = express();
app.use(express.json());
app.use('/', httpApi);

const server = http.createServer(app);
attachWsBridge(server);

server.listen(PORT, () => {
  logger.info({ port: PORT, authRequired: !!process.env.MCP_RUNNER_TOKEN }, 'mcp-runner started');
  if (!process.env.MCP_RUNNER_TOKEN) {
    logger.warn('MCP_RUNNER_TOKEN is not set - /register, /install, and /spawn are unauthenticated. Fine for a single-tenant internal network; set it for anything more exposed.');
  }
});

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'mcp-runner shutting down gracefully');

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  try {
    await processRegistry.killAll();
    logger.info('Spawned processes terminated');
  } catch (e) {
    logger.error({ err: e.message }, 'Error terminating spawned processes');
  }

  clearTimeout(forceExitTimer);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };
