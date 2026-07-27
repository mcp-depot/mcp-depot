'use strict';

// Redis-backed equivalent of circuit-breaker.memory.js - one hash per
// integration (`cb:{integrationId}` -> {failures, openUntil}) instead of a
// module-level Map, so every replica sees the same breaker state.
//
// The half-open transition (cooldown elapsed -> let one trial through) has
// a wider race window here than the single-process version: two replicas
// can both observe "cooldown elapsed" in the same instant and both admit a
// trial request. That's accepted, standard looseness for a distributed
// circuit breaker - this module doesn't try to make that transition
// perfectly atomic across replicas, only atomic per-operation.
const logger = require('../logger');
const redisClient = require('./redis-client');

const FAILURE_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10) || 5;
const COOLDOWN_MS = parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS, 10) || 30000;

const KEY_TTL_SECONDS = 3600; // leak guard in case an integration is deleted while its breaker is open

const RECORD_FAILURE_LUA = `
local key = ARGV[1]
local threshold = tonumber(ARGV[2])
local cooldownMs = tonumber(ARGV[3])
local ttlSeconds = tonumber(ARGV[4])

local failures = redis.call('HINCRBY', key, 'failures', 1)
local openUntilRaw = redis.call('HGET', key, 'openUntil')
local justOpened = 0

if failures >= threshold and (not openUntilRaw or openUntilRaw == false or openUntilRaw == '') then
  local time_result = redis.call('TIME')
  local now_ms = tonumber(time_result[1]) * 1000 + math.floor(tonumber(time_result[2]) / 1000)
  redis.call('HSET', key, 'openUntil', tostring(now_ms + cooldownMs))
  justOpened = 1
end

redis.call('EXPIRE', key, ttlSeconds)
return {failures, justOpened}
`;

const IS_OPEN_LUA = `
local key = ARGV[1]
local ttlSeconds = tonumber(ARGV[2])
local openUntilRaw = redis.call('HGET', key, 'openUntil')

if not openUntilRaw or openUntilRaw == false or openUntilRaw == '' then
  return 0
end

local time_result = redis.call('TIME')
local now_ms = tonumber(time_result[1]) * 1000 + math.floor(tonumber(time_result[2]) / 1000)
local openUntil = tonumber(openUntilRaw)

if now_ms < openUntil then
  return 1
end

-- Cooldown elapsed - half-open: reset so one trial request is let through.
redis.call('HSET', key, 'openUntil', '', 'failures', 0)
redis.call('EXPIRE', key, ttlSeconds)
return 0
`;

let scriptsRegistered = false;
function ensureScripts(client) {
  if (scriptsRegistered) return;
  client.defineCommand('mcpDepotCbRecordFailure', { numberOfKeys: 0, lua: RECORD_FAILURE_LUA });
  client.defineCommand('mcpDepotCbIsOpen', { numberOfKeys: 0, lua: IS_OPEN_LUA });
  scriptsRegistered = true;
}

function keyFor(integrationId) {
  return `cb:${integrationId}`;
}

async function isOpen(integrationId) {
  if (!integrationId) return false;
  const client = redisClient.getClient();
  ensureScripts(client);
  const open = await client.mcpDepotCbIsOpen(keyFor(integrationId), KEY_TTL_SECONDS);
  return open === 1;
}

async function recordSuccess(integrationId) {
  if (!integrationId) return;
  await redisClient.getClient().del(keyFor(integrationId));
}

async function recordFailure(integrationId) {
  if (!integrationId) return;
  const client = redisClient.getClient();
  ensureScripts(client);
  const [failures, justOpened] = await client.mcpDepotCbRecordFailure(
    keyFor(integrationId), FAILURE_THRESHOLD, COOLDOWN_MS, KEY_TTL_SECONDS
  );
  if (justOpened === 1) {
    logger.warn({ integrationId, failures, cooldownMs: COOLDOWN_MS }, 'Circuit breaker opened for integration');
  }
}

async function getStatus() {
  const client = redisClient.getClient();
  const now = Date.now();
  const results = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', 'cb:*', 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const entry = await client.hgetall(key);
      const integrationId = key.slice('cb:'.length);
      const failures = parseInt(entry.failures, 10) || 0;
      const openUntil = entry.openUntil ? parseInt(entry.openUntil, 10) : null;
      results.push({
        integrationId,
        failures,
        open: !!(openUntil && now < openUntil),
        reopensInSeconds: openUntil ? Math.max(0, Math.ceil((openUntil - now) / 1000)) : 0
      });
    }
  } while (cursor !== '0');
  return results;
}

module.exports = { isOpen, recordSuccess, recordFailure, getStatus };
