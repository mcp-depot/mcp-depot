const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');
const channelEmitter = require('../services/channel-events');

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

// GET /session-channels/:channel/stream — SSE endpoint for live channel updates
router.get('/:channel/stream', auth, async (req, res) => {
  const channel = req.params.channel;
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

// GET /session-channels — list distinct channels with count and last activity
router.get('/', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const all = await SessionChannel.findAll({ order: [['createdAt', 'DESC']] });
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

  try {
    const { SessionChannel } = loadModels();
    const entry = await SessionChannel.create({
      id: require('crypto').randomUUID(),
      channel: value.channel,
      message: value.message,
      createdBy: req.user.id
    });
    res.status(201).json(entry);
    channelEmitter.emit(value.channel, entry);
    sseBroadcast(value.channel, entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /session-channels/:channel — delete all messages in a channel
router.delete('/:channel', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const deleted = await SessionChannel.destroy({ where: { channel: req.params.channel } });
    if (!deleted) return res.status(404).json({ error: 'Channel not found or already empty' });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;