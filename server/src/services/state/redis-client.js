'use strict';

// Single shared Redis connection for cross-replica state (rate limiter,
// circuit breaker, notification fan-out). Absent REDIS_URL, isEnabled() is
// false and nothing here ever connects - every consumer falls back to its
// in-memory implementation, which is the exact single-instance behavior
// this app has always had.
const logger = require('../logger');

const REDIS_URL = process.env.REDIS_URL;

let client = null;

function isEnabled() {
  return !!REDIS_URL;
}

// A bounded maxRetriesPerRequest means a Redis outage surfaces as a
// rejection within a bounded number of retries instead of hanging forever -
// this is what the rate limiter/circuit breaker's fail-closed behavior
// depends on. enableOfflineQueue is left at its default (true) deliberately:
// disabling it makes the very first command issued right after the client
// is constructed race the initial connection handshake (the TCP/auth
// handshake hasn't finished yet) and fail immediately with "Stream isn't
// writeable" even against a healthy Redis - confirmed by hitting this
// exact race in manual testing. Queuing briefly during normal connection
// setup is fine; maxRetriesPerRequest is what bounds an actual outage.
function getClient() {
  if (!REDIS_URL) {
    throw new Error('Redis not configured (REDIS_URL is unset)');
  }
  if (!client) {
    const Redis = require('ioredis');
    client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3
    });
    client.on('error', (err) => logger.error({ err: err.message }, 'Redis client error'));
  }
  return client;
}

// A dedicated connection for SUBSCRIBE mode - ioredis (like Redis itself)
// forbids issuing other commands on a connection that's subscribed, so
// pub/sub needs its own connection separate from getClient()'s.
function duplicateClient() {
  return getClient().duplicate();
}

// Store option for the express-rate-limit instances (app.js's global
// limiter, routes/auth.js's login limiter) - undefined means "use the
// library's own default MemoryStore", exactly today's behavior when Redis
// isn't configured. Explicit distinct prefixes per instance (rate-limit-
// redis defaults to "rl:") keep these namespaced away from each other and
// from the custom sliding-window limiter's own "rl:{resourceId}:{bucket}"
// keys (state/rate-limiter.redis.js) - same Redis, unrelated key schemes.
function buildExpressRateLimitStore(prefix) {
  if (!isEnabled()) return undefined;
  const { RedisStore } = require('rate-limit-redis');
  return new RedisStore({
    prefix: `erl:${prefix}:`,
    sendCommand: (...args) => getClient().call(...args)
  });
}

module.exports = { isEnabled, getClient, duplicateClient, buildExpressRateLimitStore };
