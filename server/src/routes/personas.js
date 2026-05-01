const express = require('express');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const logger = require('../services/logger');
const { loadModels } = require('../config/database');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { AgentPersona } = loadModels();
    const personas = await AgentPersona.findAll({
      where: {
        [Op.or]: [
          { createdBy: req.user.id },
          { isShared: true }
        ]
      },
      order: [['name', 'ASC']]
    });
    res.json(personas);
  } catch (error) {
    logger.error({ error: error.message }, 'List personas error');
    res.status(500).json({ error: 'Failed to list personas' });
  }
});

router.get('/:name', auth, async (req, res) => {
  try {
    const { AgentPersona } = loadModels();
    const persona = await AgentPersona.findOne({
      where: {
        name: req.params.name,
        [Op.or]: [
          { createdBy: req.user.id },
          { isShared: true }
        ]
      }
    });
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    res.json(persona);
  } catch (error) {
    logger.error({ error: error.message }, 'Get persona error');
    res.status(500).json({ error: 'Failed to get persona' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, role, systemPrompt, description, isShared } = req.body;
    if (!name || !role || !systemPrompt) {
      return res.status(400).json({ error: 'name, role, and systemPrompt are required' });
    }
    const { AgentPersona } = loadModels();
    const [persona, created] = await AgentPersona.findOrCreate({
      where: { name },
      defaults: {
        name,
        role,
        systemPrompt,
        description: description || '',
        isShared: isShared || false,
        createdBy: req.user.id
      }
    });
    if (!created) {
      await persona.update({
        role,
        systemPrompt,
        description: description !== undefined ? description : persona.description,
        isShared: isShared !== undefined ? isShared : persona.isShared,
        createdBy: req.user.id
      });
    }
    res.status(created ? 201 : 200).json(persona);
  } catch (error) {
    logger.error({ error: error.message }, 'Create persona error');
    res.status(500).json({ error: 'Failed to create persona' });
  }
});

router.delete('/:name', auth, async (req, res) => {
  try {
    const { AgentPersona } = loadModels();
    const persona = await AgentPersona.findOne({
      where: { name: req.params.name, createdBy: req.user.id }
    });
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found or you do not own it' });
    }
    await persona.destroy();
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete persona error');
    res.status(500).json({ error: 'Failed to delete persona' });
  }
});

module.exports = router;
