require('dotenv').config();

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
