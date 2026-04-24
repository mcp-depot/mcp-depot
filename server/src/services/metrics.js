const promClient = require('prom-client');

promClient.register.setDefaultLabels({ app: 'mcp-depot' });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const toolCallDuration = new promClient.Histogram({
  name: 'tool_call_duration_seconds',
  help: 'Duration of tool calls in seconds',
  labelNames: ['tool_name', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30]
});

const toolCallTotal = new promClient.Counter({
  name: 'tool_calls_total',
  help: 'Total number of tool calls',
  labelNames: ['tool_name', 'status']
});

const externalMcpServersUp = new promClient.Gauge({
  name: 'external_mcp_servers_up',
  help: 'Number of external MCP servers up',
  labelNames: ['server_name']
});

const activeStdioProcesses = new promClient.Gauge({
  name: 'active_stdio_processes',
  help: 'Number of active stdio processes'
});

promClient.register.registerMetric(httpRequestDuration);
promClient.register.registerMetric(httpRequestTotal);
promClient.register.registerMetric(toolCallDuration);
promClient.register.registerMetric(toolCallTotal);
promClient.register.registerMetric(externalMcpServersUp);
promClient.register.registerMetric(activeStdioProcesses);

function recordToolCall(toolName, durationMs, success) {
  const status = success ? 'success' : 'error';
  const durationSeconds = durationMs / 1000;
  
  toolCallDuration.observe({ tool_name: toolName, status }, durationSeconds);
  toolCallTotal.inc({ tool_name: toolName, status });
}

function setExternalMcpStatus(serverName, isUp) {
  externalMcpServersUp.set({ server_name: serverName }, isUp ? 1 : 0);
}

function setActiveStdioProcesses(count) {
  activeStdioProcesses.set(count);
}

function middleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration);
    httpRequestTotal.inc({ method: req.method, route, status_code: res.statusCode });
  });
  
  next();
}

module.exports = {
  register: promClient.register,
  httpRequestDuration,
  httpRequestTotal,
  toolCallDuration,
  toolCallTotal,
  externalMcpServersUp,
  activeStdioProcesses,
  recordToolCall,
  setExternalMcpStatus,
  setActiveStdioProcesses,
  middleware
};