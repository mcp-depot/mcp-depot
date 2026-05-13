const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');

const router = express.Router();

const DEFAULT_TTL_HOURS = 168; // 7 days

function readableWhere(userId, role) {
  const conditions = [{ createdBy: userId }, { isShared: true }];
  if (role === 'admin') conditions.push({ createdBy: null });
  return { [Op.or]: conditions };
}

router.get('/', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const contexts = await SessionContext.findAll({
      where: readableWhere(req.user.id, req.user.role),
      order: [['updatedAt', 'DESC']]
    });
    res.json(contexts.map(c => {
      const expiresAt = c.ttlHours != null
        ? new Date(new Date(c.updatedAt).getTime() + c.ttlHours * 3600000).toISOString()
        : null;
      return {
        id: c.id,
        name: c.name,
        content: c.content,
        isShared: c.isShared,
        ttlHours: c.ttlHours,
        expiresAt,
        createdBy: c.createdBy,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({
      where: { name: req.params.name, ...readableWhere(req.user.id, req.user.role) }
    });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    res.json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const upsertSchema = Joi.object({
  name: Joi.string().max(255).required(),
  content: Joi.string().required(),
  shared: Joi.boolean().default(false),
  ttlHours: Joi.number().integer().min(0).default(DEFAULT_TTL_HOURS)
});

router.post('/', auth, async (req, res) => {
  const ttlProvided = Object.prototype.hasOwnProperty.call(req.body, 'ttlHours');
  const { error, value } = upsertSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');

    const rawNum = (value.ttlHours !== undefined && value.ttlHours !== null) ? Number(value.ttlHours) : value.ttlHours;
    const ttlHours = rawNum === 0 ? null : rawNum;

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name: value.name },
      defaults: {
        id: randomUUID(),
        name: value.name,
        content: value.content,
        isShared: value.shared,
        ttlHours,
        createdBy: req.user.id
      }
    });

    if (!created) {
      if (ctx.createdBy !== req.user.id && ctx.createdBy != null && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      const updateData = { content: value.content, isShared: value.shared };
      if (ttlProvided) updateData.ttlHours = ttlHours;
      await ctx.update(updateData);
    }

    res.status(created ? 201 : 200).json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:name/share', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name: req.params.name } });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    if (ctx.createdBy !== req.user.id && ctx.createdBy != null && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    const isShared = typeof req.body.shared === 'boolean' ? req.body.shared : !ctx.isShared;
    await ctx.update({ isShared });
    res.json({ name: ctx.name, isShared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name: req.params.name } });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    if (ctx.createdBy !== req.user.id && ctx.createdBy != null && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    const updates = {};
    if (typeof req.body.shared === 'boolean') updates.isShared = req.body.shared;
    if (typeof req.body.ttlHours === 'number') updates.ttlHours = req.body.ttlHours === 0 ? null : req.body.ttlHours;
    await ctx.update(updates);
    res.json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name: req.params.name } });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    if (ctx.createdBy !== req.user.id && ctx.createdBy != null && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    await ctx.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;