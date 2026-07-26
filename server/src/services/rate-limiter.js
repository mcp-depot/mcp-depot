'use strict';

// Selector: same exports either way, backend picked once at require-time by
// whether REDIS_URL is set. See state/rate-limiter.memory.js (today's
// single-process behavior, unchanged) and state/rate-limiter.redis.js
// (shared counters across replicas).
const redisClient = require('./state/redis-client');

module.exports = redisClient.isEnabled()
  ? require('./state/rate-limiter.redis')
  : require('./state/rate-limiter.memory');
