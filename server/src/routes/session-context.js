const express = require('express');
const Joi = require('joi');
const { authenticateToken } = require('../middleware/auth');
const { loadModels } = require('../config/database');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { SessionContext, User } = loadModels();
    const contexts = await SessionContext.findAll({
      include: [{ model: User, as: 'creator', attributes: ['id', 'username'] }],
      order: [['updatedAt', 'DESC']]
    });
    res.json(contexts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', authenticateToken, async (req, res) => {
  try {
    const { SessionContext, User } = loadModels();
    const ctx = await SessionContext.findOne({
      where: { name: req.params.name },
      include: [{ model: User, as: 'creator', attributes: ['id', 'username'] }]
    });
    if (!ctx) return res.status(404).json({ error: 'Context not found' });
    res.json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const upsertSchema = Joi.object({
  name: Joi.string().max(255).required(),
  content: Joi.string().required()
});

router.post('/', authenticateToken, async (req, res) => {
  const { error, value } = upsertSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { SessionContext } = loadModels();
    const { randomUUID } = require('crypto');
    const [ctx, created] = await SessionContext.findOrCreate({
      where: { name: value.name },
      defaults: { id: randomUUID(), name: value.name, content: value.content, createdBy: req.user.id }
    });
    if (!created) {
      await ctx.update({ content: value.content });
    }
    res.status(created ? 201 : 200).json(ctx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:name', authenticateToken, async (req, res) => {
  try {
    const { SessionContext } = loadModels();
    const deleted = await SessionContext.destroy({ where: { name: req.params.name } });
    if (!deleted) return res.status(404).json({ error: 'Context not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
