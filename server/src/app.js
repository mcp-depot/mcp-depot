const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const redisClient = require('./services/state/redis-client');
const logger = require('./services/logger');
const promClient = require('prom-client');
const { middleware: metricsMiddleware } = require('./services/metrics');
const { auth, requireAdmin } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const integrationRoutes = require('./routes/integrations');
const consumeRoutes = require('./routes/consume');
const platformRoutes = require('./routes/platform');
const { router: mcpRoutes, clearToolsCache } = require('./routes/mcp');
const monitoringRoutes = require('./routes/monitoring');
const userCredentialsRoutes = require('./routes/user-credentials');
const { router: externalMcpRoutes, setClearToolsCache: setExternalMcpClearCache } = require('./routes/external-mcp');
const skillsRoutes = require('./routes/skills');
const sessionContextRoutes = require('./routes/session-context');
const sessionChannelRoutes = require('./routes/session-channel');
const systemRoutes = require('./routes/system');
const oauthRoutes = require('./routes/oauth');
const agentsRoutes = require('./routes/agents');
const healthRoutes = require('./routes/health');
const usersRoutes = require('./routes/users');
const policyRoutes = require('./routes/policy');
const groupsRoutes = require('./routes/groups');

const app = express();

promClient.register.setDefaultLabels({ app: 'mcp-depot' });

app.set('trust proxy', 1);
const allowedFrameOrigins = process.env.ALLOWED_FRAME_ORIGINS
  ? process.env.ALLOWED_FRAME_ORIGINS.split(',').map(s => s.trim())
  : [];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'frame-ancestors': ["'self'", ...allowedFrameOrigins],
    },
  },
}));
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
if (!process.env.ALLOWED_ORIGINS) {
  logger.warn('ALLOWED_ORIGINS not set, defaulting to http://localhost:5173. Set ALLOWED_ORIGINS env var for production.');
}
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  store: redisClient.buildExpressRateLimitStore('global')
});
app.use('/api', limiter);
app.use(metricsMiddleware);

app.get('/health', (req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', process.env.HEALTH_CORS_ORIGINS || '*');
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
v1Router.use('/mcp', mcpRoutes);
v1Router.use('/monitoring', monitoringRoutes);
v1Router.use('/user-credentials', userCredentialsRoutes);
v1Router.use('/external-mcp', externalMcpRoutes);
v1Router.use('/skills', skillsRoutes);
v1Router.use('/session-contexts', sessionContextRoutes);
v1Router.use('/session-channels', sessionChannelRoutes);
v1Router.use('/system', systemRoutes);
v1Router.use('/oauth', oauthRoutes);
v1Router.use('/agents', agentsRoutes);
v1Router.use('/personas', agentsRoutes);
v1Router.use('/health', healthRoutes);
v1Router.use('/users', usersRoutes);
v1Router.use('/policy', policyRoutes);
v1Router.use('/groups', groupsRoutes);

app.use('/api/v1', v1Router);
app.use('/api', v1Router); // Backward compatibility

setExternalMcpClearCache(clearToolsCache);

app.get('/metrics', auth, requireAdmin, async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

logger.info('Routes loaded: auth, integrations, consume, jira, jenkins, bitbucket, github, gitlab, mcp, external-mcp');

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

module.exports = app;
