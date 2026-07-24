require('dotenv').config();

const path = require('path');
const fs = require('fs');
const os = require('os');

const MCP_PACKAGES_PATH = process.env.MCP_PACKAGES_PATH ||
  path.join(os.homedir(), '.mcphub', 'packages');

fs.mkdirSync(path.join(MCP_PACKAGES_PATH, 'node'), { recursive: true });
fs.mkdirSync(path.join(MCP_PACKAGES_PATH, 'python'), { recursive: true });

const pathSep = process.platform === 'win32' ? ';' : ':';
const nodeBin = path.join(MCP_PACKAGES_PATH, 'node', 'bin');
const pythonBin = path.join(MCP_PACKAGES_PATH, 'python', 'bin');
process.env.PATH = `${nodeBin}${pathSep}${pythonBin}${pathSep}${process.env.PATH}`;
process.env.NODE_PATH = path.join(MCP_PACKAGES_PATH, 'node', 'lib', 'node_modules');
process.env.MCP_PACKAGES_PATH = MCP_PACKAGES_PATH;

const { connectDB } = require('./config/database');
const config = require('./config/env');
const logger = require('./services/logger');
const pool = require('./services/mcp-connection-pool');
const app = require('./app');

const startServer = async () => {
  try {
    await connectDB();

    if (process.env.MCP_ENABLED === 'true') {
      const mcpServer = require('./mcp/server');
      await mcpServer.initialize();
      mcpServer.setMcpEnabled(true);
      if (process.env.MCP_TRANSPORT === 'http' || !process.env.MCP_TRANSPORT) {
        await mcpServer.startHttp(app).catch(err => {
          logger.error({ err: err.message }, 'Failed to start MCP HTTP server');
        });
      } else if (process.env.MCP_TRANSPORT === 'stdio') {
        mcpServer.startStdio().catch(err => {
          logger.error({ err: err.message }, 'Failed to start MCP stdio server');
        });
      }

      // Pre-warm external MCP connections on startup
      const pool = require('./services/mcp-connection-pool');
      const db = require('./config/database');
      const { ExternalMcpServer } = db.loadModels();
      ExternalMcpServer.findAll({ where: { isActive: true } }).then(servers => {
        servers.forEach(server => {
          pool.getClient(server).catch(err =>
            logger.warn({ serverId: server.id, err: err.message }, 'Startup pre-connect failed')
          );
        });
        logger.info({ count: servers.length }, 'Pre-warmed external MCP connections');
      }).catch(() => {});
    }
    
    // Start background context cleanup job
    const { startContextCleanup } = require('./services/context-cleanup');
    const { loadModels } = require('./config/database');
    startContextCleanup(loadModels);

    // Purge old tool_calls / SessionChannel rows so both tables don't grow unbounded
    const { startDataRetention } = require('./services/data-retention');
    startDataRetention(loadModels);
    
    // Initialize Secret Store if configured via env vars
    const secretStore = require('./services/secret-store');
    const secretStoreEnabled = process.env.SECRET_STORE_ENABLED === 'true';
    if (secretStoreEnabled) {
      await secretStore.init({
        enabled: true,
        siteUrl: process.env.SECRET_STORE_SITE_URL,
        clientId: process.env.SECRET_STORE_CLIENT_ID,
        clientSecret: process.env.SECRET_STORE_CLIENT_SECRET,
        workspaceId: process.env.SECRET_STORE_WORKSPACE_ID,
        environment: process.env.SECRET_STORE_ENVIRONMENT || 'dev'
      });
    }
    
    app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });

    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'MCP Depot Server started');
    });

    const Integration = require('./models/Integration');
    const { startAutoRefresh } = require('./health/checker');
    const getActiveIntegrations = () => Integration.findAll({ where: { isActive: true } });
    startAutoRefresh(getActiveIntegrations);
    
    const gracefulShutdown = async (signal) => {
      logger.info({ signal }, 'Shutting down gracefully');

      const forceExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 10000);

      await new Promise((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });

      try {
        await pool.closeAll();
        logger.info('MCP connection pool closed');
      } catch (e) {
        logger.error({ err: e.message }, 'Error closing MCP connections');
      }
      
      try {
        const { killAll } = require('./services/process-registry');
        await killAll();
        logger.info('Child processes terminated');
      } catch (e) {
        logger.error({ err: e.message }, 'Error terminating processes');
      }
      
      try {
        const { sequelize } = require('./config/database');
        await sequelize.close();
        logger.info('Database connections closed');
      } catch (e) {
        logger.error({ err: e.message }, 'Error closing database');
      }
      
      clearTimeout(forceExitTimer);
      logger.info('Shutdown complete');
      process.exit(0);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.fatal({ err: error.message }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();

module.exports = app;
