require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/database');
const config = require('./config/env');
const logger = require('./services/logger');
const promClient = require('prom-client');
const { middleware: metricsMiddleware } = require('./services/metrics');

const authRoutes = require('./routes/auth');
const integrationRoutes = require('./routes/integrations');
const consumeRoutes = require('./routes/consume');
const platformRoutes = require('./routes/platform');
const workflowRoutes = require('./routes/workflows');
const { router: mcpRoutes, clearToolsCache } = require('./routes/mcp');
const monitoringRoutes = require('./routes/monitoring');
const userCredentialsRoutes = require('./routes/user-credentials');
const { router: externalMcpRoutes, setClearToolsCache: setExternalMcpClearCache } = require('./routes/external-mcp');
const promptLibraryRoutes = require('./routes/prompt-library');
const skillsRoutes = require('./routes/skills');
const sessionContextRoutes = require('./routes/session-context');
const sessionChannelRoutes = require('./routes/session-channel');
const systemRoutes = require('./routes/system');
const oauthRoutes = require('./routes/oauth');

const app = express();

promClient.register.setDefaultLabels({ app: 'mcpconnect' });

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || [] }));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', limiter);
app.use(metricsMiddleware);

app.get('/health', (req, res) => {
  let mcpClients = 0;
  try {
    const { getMcpClients } = require('./mcp/server');
    mcpClients = getMcpClients ? getMcpClients() : 0;
  } catch {}
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), mcpClients });
});

app.get('/ready', async (req, res) => {
  try {
    const { sequelize } = require('./config/database');
    await sequelize.authenticate();
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'disconnected', error: err.message });
  }
});

const v1Router = express.Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/integrations', integrationRoutes);
v1Router.use('/consume', consumeRoutes);
v1Router.use('/jira', platformRoutes('jira'));
v1Router.use('/jenkins', platformRoutes('jenkins'));
v1Router.use('/bitbucket', platformRoutes('bitbucket'));
v1Router.use('/github', platformRoutes('github'));
v1Router.use('/gitlab', platformRoutes('gitlab'));
v1Router.use('/workflows', workflowRoutes);
v1Router.use('/mcp', mcpRoutes);
v1Router.use('/monitoring', monitoringRoutes);
v1Router.use('/user-credentials', userCredentialsRoutes);
v1Router.use('/external-mcp', externalMcpRoutes);
v1Router.use('/prompt-library', promptLibraryRoutes);
v1Router.use('/skills-library', promptLibraryRoutes);
v1Router.use('/skills', skillsRoutes);
v1Router.use('/session-contexts', sessionContextRoutes);
v1Router.use('/session-channels', sessionChannelRoutes);
v1Router.use('/system', systemRoutes);
v1Router.use('/oauth', oauthRoutes);

app.use('/api/v1', v1Router);
app.use('/api', v1Router); // Backward compatibility

setExternalMcpClearCache(clearToolsCache);

if (process.env.MCP_ENABLED === 'true') {
  const mcpServer = require('./mcp/server');
  mcpServer.initialize().then(async () => {
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
  }).catch(err => {
    logger.error({ err: err.message }, 'Failed to initialize MCP server');
  });
}

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

logger.info('Routes loaded: auth, integrations, consume, jira, jenkins, bitbucket, github, gitlab, workflows, mcp, external-mcp');

if (process.env.SERVE_CLIENT === 'true') {
  const path = require('path');
  const distPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack, path: req.path }, 'Request error');
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const startServer = async () => {
  try {
    await connectDB();
    
    // Start background context cleanup job
    const { startContextCleanup } = require('./services/context-cleanup');
    const { loadModels } = require('./config/database');
    startContextCleanup(loadModels);
    
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
    
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'MCPConnect Server started');
    });
    
    const gracefulShutdown = async (signal) => {
      logger.info({ signal }, 'Shutting down gracefully');
      
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
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
