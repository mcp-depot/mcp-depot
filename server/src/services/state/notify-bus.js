'use strict';

// Selector: same publish(topic, payload)/subscribe(topic, handler) exports
// either way, backend picked once at require-time by whether REDIS_URL is
// set. See notify-bus.memory.js (local-only, today's call graph) and
// notify-bus.redis.js (cross-replica fan-out via pub/sub).
const redisClient = require('./redis-client');

module.exports = redisClient.isEnabled()
  ? require('./notify-bus.redis')
  : require('./notify-bus.memory');
