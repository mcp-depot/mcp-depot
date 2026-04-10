const express = require('express');
const Joi = require('joi');
const { auth } = require('../middleware/auth');
const logger = require('../services/logger');
const { loadModels } = require('../config/database');

const router = express.Router();

const promptSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('', null),
  inputs: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    label: Joi.string().required(),
    type: Joi.string().valid('string', 'number', 'boolean').default('string'),
    required: Joi.boolean().default(false),
    placeholder: Joi.string()
  })).default([]),
  prompt: Joi.string().required()
});

const promptUpdateSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string().allow('', null),
  inputs: Joi.array().items(Joi.object()).default([]),
  prompt: Joi.string()
});

router.get('/', auth, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const prompts = await PromptLibrary.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(prompts);
  } catch (error) {
    logger.error({ error: error.message }, 'List prompts error');
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = promptSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { PromptLibrary } = loadModels();
    const { name, description, inputs, prompt } = value;
    
    const newPrompt = await PromptLibrary.create({
      userId: req.user.id,
      name,
      description,
      inputs: inputs || [],
      prompt,
      isDefault: false
    });
    
    res.status(201).json(newPrompt);
  } catch (error) {
    logger.error({ error: error.message }, 'Create prompt error');
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { error, value } = promptUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { PromptLibrary } = loadModels();
    const { id } = req.params;
    const { name, description, inputs, prompt } = value;
    
    const existingPrompt = await PromptLibrary.findOne({
      where: { id, userId: req.user.id }
    });
    
    if (!existingPrompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    await existingPrompt.update({
      name: name || existingPrompt.name,
      description: description || existingPrompt.description,
      inputs: inputs || existingPrompt.inputs,
      prompt: prompt || existingPrompt.prompt
    });
    
    res.json(existingPrompt);
  } catch (error) {
    logger.error({ error: error.message }, 'Update prompt error');
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const { id } = req.params;
    
    const existingPrompt = await PromptLibrary.findOne({
      where: { id, userId: req.user.id }
    });
    
    if (!existingPrompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    if (existingPrompt.isDefault) {
      return res.status(400).json({ error: 'Cannot delete default prompts' });
    }
    
    await existingPrompt.destroy();
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete prompt error');
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

module.exports = router;
