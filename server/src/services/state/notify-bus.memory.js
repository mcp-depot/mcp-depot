'use strict';

// Local-only pub/sub: publish() calls every locally-registered handler for
// that topic directly, synchronously - the exact same call graph the app
// had before this existed (a publish/subscribe indirection around what used
// to be direct method calls), so single-instance behavior is unchanged.
const logger = require('../logger');

const handlers = new Map(); // topic -> Set<handler>

function subscribe(topic, handler) {
  if (!handlers.has(topic)) handlers.set(topic, new Set());
  handlers.get(topic).add(handler);
  return () => handlers.get(topic)?.delete(handler);
}

function publish(topic, payload) {
  const subs = handlers.get(topic);
  if (!subs || subs.size === 0) return;

  // Round-tripped through JSON so the payload shape handlers see is
  // identical to what the Redis-backed path delivers (e.g. Dates become
  // ISO strings) - callers must not rely on non-JSON-safe values surviving
  // a publish, regardless of which backend is active.
  const serialized = JSON.parse(JSON.stringify(payload));

  for (const handler of subs) {
    try {
      handler(serialized);
    } catch (err) {
      logger.warn({ topic, err: err.message }, 'notify-bus: local handler failed');
    }
  }
}

module.exports = { publish, subscribe };
