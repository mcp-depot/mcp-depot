const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');

const router = express.Router();

// GET /session-channels — list distinct channels with count and last activity
router.get('/', auth, async (req, res) => {
  try {
    const { SessionChannel } = loadModels();
    const rows = await SessionChannel.findAll({
      attributes: [
        'channel',
        [SessionChannel.sequelize.fn('COUNT', SessionChannel.sequelize.col('id')), 'messageCount'],
        [SessionChannel.sequelize.fn('MAX', SessionChannel.sequelize.col('createdAt')), 'lastActivity']
      ],
      group: ['channel'],
      order: [[SessionChannel.sequelize.literal('lastActivity'), 'DESC']]
    });
    res.json(rows);
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