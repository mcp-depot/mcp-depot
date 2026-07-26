'use strict';

// Redis pub/sub fan-out: every replica registers the same local handlers at
// startup (mcp/server.js, routes/session-channel.js), then reacts to
// PUBLISH messages from any replica (including its own) by running its
// *own* local delivery logic against its *own* locally-connected
// sessions/SSE clients/long-pollers. The live connection objects themselves
// (res, sockets) are never sent over Redis - only the "something happened"
// signal is.
//
// Fail-open, deliberately different from the rate limiter/circuit
// breaker's fail-closed choice: by the time publish() is called here, the
// triggering write (e.g. a SessionChannel message) has already succeeded
// and is durably in Postgres. A Redis hiccup means one notification is
// missed - a freshness gap - not a lost safety guarantee, so it's logged
// and swallowed rather than surfaced as a failure of the request that
// triggered it.
const redisClient = require('./redis-client');
const logger = require('../logger');

const CHANNEL_PREFIX = 'mcpdepot:';

const handlers = new Map(); // topic -> Set<handler>
let subscriberClient = null;

function ensureSubscriber() {
  if (subscriberClient) return subscriberClient;

  subscriberClient = redisClient.duplicateClient();
  subscriberClient.on('error', (err) => logger.error({ err: err.message }, 'notify-bus: subscriber connection error'));
  subscriberClient.psubscribe(`${CHANNEL_PREFIX}*`).catch((err) =>
    logger.error({ err: err.message }, 'notify-bus: failed to subscribe')
  );

  subscriberClient.on('pmessage', (_pattern, channel, message) => {
    const topic = channel.slice(CHANNEL_PREFIX.length);
    const subs = handlers.get(topic);
    if (!subs || subs.size === 0) return;

    let payload;
    try {
      payload = JSON.parse(message);
    } catch (err) {
      logger.warn({ topic, err: err.message }, 'notify-bus: dropping malformed pub/sub message');
      return;
    }

    for (const handler of subs) {
      try {
        handler(payload);
      } catch (err) {
        logger.warn({ topic, err: err.message }, 'notify-bus: remote handler failed');
      }
    }
  });

  return subscriberClient;
}

function subscribe(topic, handler) {
  ensureSubscriber();
  if (!handlers.has(topic)) handlers.set(topic, new Set());
  handlers.get(topic).add(handler);
  return () => handlers.get(topic)?.delete(handler);
}

function publish(topic, payload) {
  redisClient.getClient()
    .publish(`${CHANNEL_PREFIX}${topic}`, JSON.stringify(payload))
    .catch((err) => logger.warn({ topic, err: err.message }, 'notify-bus: publish failed'));
}

module.exports = { publish, subscribe };
