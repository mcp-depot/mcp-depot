const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');
const channelEmitter = require('../services/channel-events');
const audit = require('../services/audit');
const logger = require('../services/logger');
const { checkSessionChannelPolicy } = require('../services/resource-policy');
const notifyBus = require('../services/state/notify-bus');

const router = express.Router();

const sseClientsByChannel = new Map();

function sseBroadcast(channel, data) {
  const clients = sseClientsByChannel.get(channel);
  if (!clients) return;
  const payload = JSON.stringify(data);
  for (const res of clients) {
    try { res.write(`event: message\ndata: ${payload}\n\n`); } catch { clients.delete(res); }
  }
}

// Cross-replica fan-out for this route's own SSE (/stream) and long-poll
// (/watch) endpoints - same bug family as the MCP session notifications in
// mcp/server.js: without this, a message posted while the POST request
// lands on replica A never reached a /stream or /watch client parked on
// replica B. Every replica subscribes at module-load time and delivers to
// its own locally-connected clients only.
notifyBus.subscribe('channel-msg', (payload) => {
  channelEmitter.emit(payload.channel, payload.entry);
  sseBroadcast(payload.channel, payload.entry);
});

// GET /session-channels/:channel/stream — SSE endpoint for live channel updates
router.get('/:channel/stream', auth, async (req, res) => {
  const channel = req.params.channel;

  const policyResult = await checkSessionChannelPolicy({ user: req.user, action: 'read', channel });
  if (policyResult.decision === 'deny') {
    return res.status(403).json({ error: 'Access denied by policy', reason: policyResult.reason });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!sseClientsByChannel.has(channel)) {
    sseClientsByChannel.set(channel, new Set());
  }
  sseClientsByChannel.get(channel).add(res);
  res.on('close', () => {
    const clients = sseClientsByChannel.get(channel);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClientsByChannel.delete(channel);
    }
  });

  try {
    const { SessionChannel } = loadModels();
    const messages = await SessionChannel.findAll({
      where: { channel },
      order: [['createdAt', 'ASC']]
    });
    for (const m of messages) {
      res.write(`data: ${JSON.stringify(m.toJSON())}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
});

// GET /:channel/watch — long-poll until new message arrives on specified channel
router.get('/:channel/watch', auth, async (req, res) => {
  const channel = req.params.channel;
  const timeoutMs = Math.min(parseInt(req.query.timeout) || 25, 25) * 1000;

  const policyResult = await checkSessionChannelPolicy({ user: req.user, action: 'read', channel });
  if (policyResult.decision === 'deny') {
    return res.status(403).json({ error: 'Access denied by policy', reason: policyResult.reason });
  }

  try {
    const msg = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        channelEmitter.off(channel, handler);
        resolve(null);
      }, timeoutMs);

      const handler = (data) => {
        clearTimeout(timer);
        resolve(data);
      };

      channelEmitter.once(channel, handler);
    });

    if (msg) {
      res.json({ message: msg.message, postedAt: msg.createdAt, channel: msg.channel, timedOut: false });
    } else {
      res.json({ timedOut: true, channel });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /session-channels/watch — long-poll until new message arrives on specified channel (query param variant)
router.get('/watch', auth, async (req, res) => {
  const channel = req.query.channel;
  if (!channel) return res.status(400).json({ error: 'channel parameter is required' });
  const timeoutMs = Math.min(parseInt(req.query.timeout) || 25, 25) * 1000;

  const policyResult = await checkSessionChannelPolicy({ user: req.user, action: 'read', channel });
  if (policyResult.decision === 'deny') {
    return res.status(403).json({ error: 'Access denied by policy', reason: policyResult.reason });
  }

  try {
    const msg = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        channelEmitter.off(channel, handler);
        resolve(null);
      }, timeoutMs);

      const handler = (data) => {
        clearTimeout(timer);
        resolve(data);
      };

      channelEmitter.once(channel, handler);
    });

    if (msg) {
      res.json({ message: msg.message, postedAt: msg.createdAt, channel: msg.channel, timedOut: false });
    } else {
      res.json({ timedOut: true, channel });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /session-channels — list distinct channels with count and last activity.
// Not policy-gated: a list spans many channels with no single resourceId to
// evaluate a rule against. Per-channel reads are gated at GET /:channel.
router.get('/', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const where = req.user.role === 'admin' ? {} : { createdBy: req.user.id };
    const all = await SessionChannel.findAll({ where, order: [['createdAt', 'DESC']] });
    const channelMap = new Map();
    for (const m of all) {
      if (!channelMap.has(m.channel)) {
        channelMap.set(m.channel, { channel: m.channel, messageCount: 0, lastActivity: m.createdAt });
      }
      const entry = channelMap.get(m.channel);
      entry.messageCount++;
    }
    const channels = Array.from(channelMap.values()).sort((a, b) =>
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /session-channels/:channel — read messages, optional ?since=ISO timestamp
router.get('/:channel', auth, async (req, res) => {
  const policyResult = await checkSessionChannelPolicy({ user: req.user, action: 'read', channel: req.params.channel });
  if (policyResult.decision === 'deny') {
    return res.status(403).json({ error: 'Access denied by policy', reason: policyResult.reason });
  }

  try {
    const { SessionChannel } = loadModels();
    const where = { channel: req.params.channel };
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (isNaN(since)) return res.status(400).json({ error: 'Invalid since timestamp' });
      where.createdAt = { [Op.gt]: since };
    }
    const messages = await SessionChannel.findAll({
      where,
      order: [['createdAt', 'ASC']]
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const appendSchema = Joi.object({
  channel: Joi.string().max(255).required(),
  message: Joi.string().required()
});

// POST /session-channels — append a message to a channel
router.post('/', auth, async (req, res) => {
  const { error, value } = appendSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const policyResult = await checkSessionChannelPolicy({ user: req.user, action: 'write', channel: value.channel });
  if (policyResult.decision === 'deny') {
    return res.status(403).json({ error: 'Access denied by policy', reason: policyResult.reason });
  }

  try {
    const { SessionChannel } = loadModels();
    const entry = await SessionChannel.create({
      id: require('crypto').randomUUID(),
      channel: value.channel,
      message: value.message,
      createdBy: req.user.id
    });
    res.status(201).json(entry);
    // One publish reaches every local delivery mechanism on every replica -
    // this replica's own /watch, /stream, and MCP session subscribers
    // included, via the subscriptions registered above and in
    // mcp/server.js. See notify-bus.js for the memory-vs-Redis backend.
    notifyBus.publish('channel-msg', { channel: value.channel, entry: entry.toJSON() });
    notifyBus.publish('resource-update', { channel: value.channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /session-channels/:channel — delete all messages in a channel
router.delete('/:channel', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const first = await SessionChannel.findOne({
      where: { channel: req.params.channel },
      order: [['createdAt', 'ASC']]
    });
    if (!first) return res.status(404).json({ error: 'Channel not found or already empty' });

    const policyResult = await checkSessionChannelPolicy({ user: req.user, action: 'delete', channel: req.params.channel });
    if (policyResult.decision === 'deny') {
      return res.status(403).json({ error: 'Access denied by policy', reason: policyResult.reason });
    }

    if (first.createdBy !== req.user.id) {
      const bypassResult = await checkSessionChannelPolicy({ user: req.user, action: 'manage_others', channel: req.params.channel });
      if (bypassResult.decision === 'deny') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const deleted = await SessionChannel.destroy({ where: { channel: req.params.channel } });

    logger.warn({ userId: req.user.id, channel: req.params.channel, deleted }, 'Session channel cleared');
    await audit.log({
      userId: req.user.id,
      action: 'clear_session_channel',
      details: { channel: req.params.channel, deletedCount: deleted },
      status: 'success'
    });

    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /session-channels/:channel/subscribe — subscribe to push notifications
router.post('/:channel/subscribe', auth, async (req, res) => {
  const channel = req.params.channel;

  const policyResult = await checkSessionChannelPolicy({ user: req.user, action: 'subscribe', channel });
  if (policyResult.decision === 'deny') {
    return res.status(403).json({ error: 'Access denied by policy', reason: policyResult.reason });
  }

  try {
    const mcpServer = require('../mcp/server');
    const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!mcpServer._channelSubscriptions.has(channel)) {
      mcpServer._channelSubscriptions.set(channel, new Set());
    }
    mcpServer._channelSubscriptions.get(channel).add(sessionId);
    res.json({ subscribed: true, channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /session-channels/:channel/subscribe — unsubscribe from push notifications.
// Deliberately not policy-gated: a deny rule here would trap a subscriber
// into permanently receiving notifications they can no longer opt out of,
// which is actively harmful rather than merely restrictive.
router.delete('/:channel/subscribe', auth, async (req, res) => {
  try {
    const channel = req.params.channel;
    const mcpServer = require('../mcp/server');
    const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
    if (mcpServer._channelSubscriptions.has(channel)) {
      mcpServer._channelSubscriptions.get(channel).delete(sessionId);
      if (mcpServer._channelSubscriptions.get(channel).size === 0) {
        mcpServer._channelSubscriptions.delete(channel);
      }
    }
    res.json({ unsubscribed: true, channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;