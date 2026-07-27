'use strict';

// Redis-backed equivalent of rate-limiter.memory.js - same two-bucket
// weighted sliding-window algorithm, same key shapes, just backed by Redis
// so every replica shares the same counters. The read-decide-increment
// sequence has to be atomic across replicas (two replicas could otherwise
// both read "under limit" and both increment, over-admitting by one), so
// it's a single Lua script rather than separate GET/INCR round trips.
//
// Time comes from Redis's own TIME command, not Date.now() on the caller -
// using each app replica's own clock here would let clock skew between
// replicas corrupt the shared bucket math; Redis is the one shared clock
// authority all replicas already agree on.
const redisClient = require('./redis-client');

const DEFAULT_RPM = parseInt(process.env.RATE_LIMIT_DEFAULT_RPM || '300', 10);
const DEFAULT_RPH = parseInt(process.env.RATE_LIMIT_DEFAULT_RPH || '5000', 10);

const SLIDING_WINDOW_LUA = `
local resourceId = ARGV[1]
local limit = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])

local time_result = redis.call('TIME')
local now_ms = tonumber(time_result[1]) * 1000 + math.floor(tonumber(time_result[2]) / 1000)

local bucket = math.floor(now_ms / windowMs)
local currentKey = 'rl:' .. resourceId .. ':' .. bucket
local prevKey = 'rl:' .. resourceId .. ':' .. (bucket - 1)

local currentWindowStart = now_ms - (now_ms % windowMs)
local elapsedInCurrent = now_ms - currentWindowStart

local current = tonumber(redis.call('GET', currentKey)) or 0
local prev = tonumber(redis.call('GET', prevKey)) or 0

local prevWeight = math.max(0, 1 - (elapsedInCurrent / windowMs))
local weightedCount = current + prev * prevWeight

local resetInSeconds = math.max(1, math.ceil((windowMs - elapsedInCurrent) / 1000))

if weightedCount >= limit then
  return {0, 0, resetInSeconds}
end

redis.call('INCR', currentKey)
redis.call('PEXPIRE', currentKey, windowMs * 2)

local newWeightedCount = weightedCount + 1
local remaining = math.max(0, math.floor(limit - newWeightedCount))

return {1, remaining, resetInSeconds}
`;

let scriptRegistered = false;
function ensureScript(client) {
  if (scriptRegistered) return;
  client.defineCommand('mcpDepotSlidingWindow', { numberOfKeys: 0, lua: SLIDING_WINDOW_LUA });
  scriptRegistered = true;
}

async function checkSlidingWindow(resourceId, limit, windowMs) {
  if (!limit || limit <= 0) return { allowed: true, remaining: Infinity };

  const client = redisClient.getClient();
  ensureScript(client);

  const [allowed, remaining, resetInSeconds] = await client.mcpDepotSlidingWindow(resourceId, limit, windowMs);

  if (allowed !== 1) {
    return { allowed: false, remaining: 0, resetInSeconds };
  }
  return { allowed: true, remaining, resetInSeconds };
}

async function checkRateLimit(toolId, userId, toolLimit, integrationLimitRpm, integrationLimitRph, integrationId) {
  const toolKey = `tool:${toolId}:${userId}`;
  const poolId = integrationId || toolId;
  const integrationKey = `integration:${poolId}`;

  const effectiveToolLimit = toolLimit || DEFAULT_RPM;
  const effectiveIntegrationLimitRpm = integrationLimitRpm || DEFAULT_RPM;
  const effectiveIntegrationLimitRph = integrationLimitRph || DEFAULT_RPH;

  const toolCheck = await checkSlidingWindow(toolKey, effectiveToolLimit, 60 * 1000);
  if (!toolCheck.allowed) {
    return {
      allowed: false,
      level: 'tool',
      limit: effectiveToolLimit,
      remaining: 0,
      resetInSeconds: toolCheck.resetInSeconds
    };
  }

  const integrationMinCheck = await checkSlidingWindow(integrationKey, effectiveIntegrationLimitRpm, 60 * 1000);
  if (!integrationMinCheck.allowed) {
    return {
      allowed: false,
      level: 'integration',
      limit: effectiveIntegrationLimitRpm,
      remaining: 0,
      resetInSeconds: integrationMinCheck.resetInSeconds
    };
  }

  const integrationHourCheck = await checkSlidingWindow(`${integrationKey}:hour`, effectiveIntegrationLimitRph, 60 * 60 * 1000);
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
    remaining: toolCheck.remaining,
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
  checkSlidingWindow,
  DEFAULT_RPM,
  DEFAULT_RPH
};
