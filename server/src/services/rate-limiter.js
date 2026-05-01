const DEFAULT_RPM = parseInt(process.env.RATE_LIMIT_DEFAULT_RPM || '300', 10);
const DEFAULT_RPH = parseInt(process.env.RATE_LIMIT_DEFAULT_RPH || '5000', 10);

const windows = new Map();

function getWindowKey(resourceId, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  return `${resourceId}:${bucket}`;
}

function incrementCounter(key) {
  const entry = windows.get(key) || { count: 0, timestamp: Date.now() };
  entry.count++;
  windows.set(key, entry);
  return entry;
}

function getCounter(key) {
  return windows.get(key) || { count: 0, timestamp: Date.now() };
}

function cleanupExpired() {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [key, entry] of windows.entries()) {
    if (now - entry.timestamp > maxAge) {
      windows.delete(key);
    }
  }
}

setInterval(cleanupExpired, 5 * 60 * 1000);

function checkSlidingWindow(resourceId, limit, windowMs) {
  if (!limit || limit <= 0) return { allowed: true, remaining: Infinity };

  const now = Date.now();
  const currentWindowStart = now - windowMs;
  const currentWindowKey = getWindowKey(resourceId, windowMs);
  const prevWindowKey = `${resourceId}:${Math.floor(currentWindowStart / windowMs)}`;

  const current = getCounter(currentWindowKey);
  const prev = getCounter(prevWindowKey);

  const elapsedInPrev = now - prevWindowKey;
  const prevWeight = Math.max(0, 1 - elapsedInPrev / windowMs);
  const weightedCount = current.count + prev.count * prevWeight;

  if (weightedCount >= limit) {
    const resetIn = Math.ceil((currentWindowKey.split(':').pop() * windowMs + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, resetInSeconds: Math.max(1, resetIn) };
  }

  incrementCounter(currentWindowKey);

  const newWeightedCount = weightedCount + 1;
  const remaining = Math.max(0, Math.floor(limit - newWeightedCount));
  const resetIn = Math.ceil((currentWindowKey.split(':').pop() * windowMs + windowMs - now) / 1000);

  return { allowed: true, remaining, resetInSeconds: Math.max(1, resetIn) };
}

function checkRateLimit(toolId, userId, toolLimit, integrationLimitRpm, integrationLimitRph) {
  const toolKey = `tool:${toolId}:${userId}`;
  const integrationKey = `integration:${toolId}:${userId}`;

  const effectiveToolLimit = toolLimit || DEFAULT_RPM;
  const effectiveIntegrationLimitRpm = integrationLimitRpm || DEFAULT_RPM;
  const effectiveIntegrationLimitRph = integrationLimitRph || DEFAULT_RPH;

  const toolCheck = checkSlidingWindow(toolKey, effectiveToolLimit, 60 * 1000);
  if (!toolCheck.allowed) {
    return {
      allowed: false,
      level: 'tool',
      limit: effectiveToolLimit,
      remaining: 0,
      resetInSeconds: toolCheck.resetInSeconds
    };
  }

  const integrationMinCheck = checkSlidingWindow(integrationKey, effectiveIntegrationLimitRpm, 60 * 1000);
  if (!integrationMinCheck.allowed) {
    return {
      allowed: false,
      level: 'integration',
      limit: effectiveIntegrationLimitRpm,
      remaining: 0,
      resetInSeconds: integrationMinCheck.resetInSeconds
    };
  }

  const integrationHourCheck = checkSlidingWindow(`${integrationKey}:hour`, effectiveIntegrationLimitRph, 60 * 60 * 1000);
  if (!integrationHourCheck.allowed) {
    return {
      allowed: false,
      level: 'integration',
      limit: effectiveIntegrationLimitRph,
      remaining: 0,
      resetInSeconds: integrationHourCheck.resetInSeconds
    };
  }

  return {
    allowed: true,
    toolRemaining: toolCheck.remaining,
    integrationRemaining: Math.min(integrationMinCheck.remaining, integrationHourCheck.remaining),
    resetInSeconds: toolCheck.resetInSeconds
  };
}

function rateLimitMiddleware(req, res, next) {
  const toolId = req.body?.toolId;
  const userId = req.user?.id || req.apiKey?.userId;

  if (!toolId || !userId) {
    return next();
  }

  req.rateLimit = { toolId, userId };
  next();
}

module.exports = {
  checkRateLimit,
  rateLimitMiddleware,
  DEFAULT_RPM,
  DEFAULT_RPH
};
