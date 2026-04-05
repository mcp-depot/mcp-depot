const rateLimitStore = new Map();

function getRateLimitKey(toolId, userId) {
  return `${toolId}:${userId}`;
}

function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > 60000) {
      rateLimitStore.delete(key);
    }
  }
}

setInterval(cleanupOldEntries, 60000);

function checkRateLimit(toolId, userId, limit) {
  if (!limit || limit <= 0) return { allowed: true };
  
  const key = getRateLimitKey(toolId, userId);
  const now = Date.now();
  
  let record = rateLimitStore.get(key);
  
  if (!record || now - record.windowStart > 60000) {
    record = { windowStart: now, count: 0 };
    rateLimitStore.set(key, record);
  }
  
  record.count++;
  
  if (record.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.ceil((record.windowStart + 60000 - now) / 1000)
    };
  }
  
  return {
    allowed: true,
    remaining: limit - record.count,
    resetIn: Math.ceil((record.windowStart + 60000 - now) / 1000)
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
  rateLimitMiddleware
};