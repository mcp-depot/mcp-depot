const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');

const router = express.Router();

function readableWhere(userId) {
  return { [Op.or]: [{ createdBy: userId }, { isShared: true }, { createdBy: null }] };
}

router.get('/', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const contexts = await SessionContext.findAll({
      where: readableWhere(req.user.id),
      order: [['updatedAt', 'DESC']]
    });
    res.json(contexts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({
      where: { name: req.params.name, ...readableWhere(req.user.id) }
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
  shared: Joi.boolean().default(false)
});

router.post('/', auth, async (req, res) => {
  const { error, value } = upsertSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');

    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name: value.name },
      defaults: {
        id: randomUUID(),
        name: value.name,
        content: value.content,
        isShared: value.shared,
        createdBy: req.user.id
      }
    });

    if (!created) {
      if (ctx.createdBy !== req.user.id) {
        return res.status(403).json({ error: 'You do not own this context' });
      }
      await ctx.update({ content: value.content, isShared: value.shared });
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
    if (ctx.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    const isShared = typeof req.body.shared === 'boolean' ? req.body.shared : !ctx.isShared;
    await ctx.update({ isShared });
    res.json({ name: ctx.name, isShared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:name', auth, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const ctx = await SessionContext.findOne({ where: { name: req.params.name } });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    if (ctx.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this context' });
    }
    await ctx.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;