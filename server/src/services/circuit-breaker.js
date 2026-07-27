'use strict';

// Selector: same exports either way, backend picked once at require-time by
// whether REDIS_URL is set. See state/circuit-breaker.memory.js (today's
// single-process behavior, unchanged) and state/circuit-breaker.redis.js
// (shared breaker state across replicas).
const redisClient = require('./state/redis-client');

module.exports = redisClient.isEnabled()
  ? require('./state/circuit-breaker.redis')
  : require('./state/circuit-breaker.memory');
