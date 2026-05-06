const express = require('express');
const Joi = require('joi');
const { auth } = require('../middleware/auth');
const logger = require('../services/logger');
const { loadModels } = require('../config/database');

const router = express.Router();

const skillSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('', null),
  inputs: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    label: Joi.string().required(),
    type: Joi.string().valid('string', 'number', 'boolean').default('string'),
    required: Joi.boolean().default(false),
    placeholder: Joi.string()
  })).default([]),
  prompt: Joi.string().required(),
  outputFormat: Joi.string().valid('text', 'json', 'markdown').default('text'),
  isShared: Joi.boolean().default(false),
  tags: Joi.array().items(Joi.string()).default([])
});

const skillUpdateSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string().allow('', null),
  inputs: Joi.array().items(Joi.object()).default([]),
  prompt: Joi.string(),
  outputFormat: Joi.string().valid('text', 'json', 'markdown'),
  isShared: Joi.boolean(),
  tags: Joi.array().items(Joi.string())
});

const invokeSchema = Joi.object({
  inputs: Joi.object().default({})
});

function renderSkillPrompt(skill, inputValues) {
  let rendered = skill.prompt || '';
  
  Object.entries(inputValues || {}).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, value !== undefined && value !== null ? String(value) : '');
    
    const conditionalStart = new RegExp(`\\{\\{#${key}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
    rendered = rendered.replace(conditionalStart, (match, content) => {
      return (value && String(value).trim()) ? content : '';
    });
    
    const conditionalInverse = new RegExp(`\\{\\{\\^{${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
    rendered = rendered.replace(conditionalInverse, (match, content) => {
      return (!value || !String(value).trim()) ? content : '';
    });
  });
  
  return rendered;
}

router.get('/', auth, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const prompts = await PromptLibrary.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(prompts);
  } catch (error) {
    logger.error({ error: error.message }, 'List skills error');
    res.status(500).json({ error: 'Failed to list skills' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = skillSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { PromptLibrary } = loadModels();
    const { name, description, inputs, prompt, outputFormat, isShared, tags } = value;
    
    const newSkill = await PromptLibrary.create({
      userId: req.user.id,
      name,
      description,
      inputs: inputs || [],
      prompt,
      outputFormat,
      isShared,
      isDefault: false,
      tags
    });
    
    res.status(201).json(newSkill);
  } catch (error) {
    logger.error({ error: error.message }, 'Create skill error');
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { error, value } = skillUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { PromptLibrary } = loadModels();
    const { id } = req.params;
    
    const existingSkill = await PromptLibrary.findOne({
      where: { id, userId: req.user.id }
    });
    
    if (!existingSkill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    await existingSkill.update({
      name: value.name || existingSkill.name,
      description: value.description !== undefined ? value.description : existingSkill.description,
      inputs: value.inputs || existingSkill.inputs,
      prompt: value.prompt || existingSkill.prompt,
      outputFormat: value.outputFormat || existingSkill.outputFormat,
      isShared: value.isShared !== undefined ? value.isShared : existingSkill.isShared,
      tags: value.tags !== undefined ? value.tags : existingSkill.tags
    });
    
    res.json(existingSkill);
  } catch (error) {
    logger.error({ error: error.message }, 'Update skill error');
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const { id } = req.params;
    
    const existingSkill = await PromptLibrary.findOne({
      where: { id, userId: req.user.id }
    });
    
    if (!existingSkill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    if (existingSkill.isDefault) {
      return res.status(400).json({ error: 'Cannot delete default skills' });
    }
    
    await existingSkill.destroy();
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete skill error');
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

router.post('/:id/invoke', auth, async (req, res) => {
  try {
    const { error, value } = invokeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { PromptLibrary } = loadModels();
    const { id } = req.params;
    
    const skill = await PromptLibrary.findOne({
      where: {
        id,
        userId: req.user.id
      }
    });
    
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    const renderedPrompt = renderSkillPrompt(skill, value.inputs);
    
    let result;
    if (skill.outputFormat === 'json') {
      try {
        result = JSON.parse(renderedPrompt);
      } catch {
        result = { output: renderedPrompt };
      }
    } else if (skill.outputFormat === 'markdown') {
      result = { format: 'markdown', content: renderedPrompt };
    } else {
      result = { format: 'text', content: renderedPrompt };
    }
    
    res.json({
      skillId: skill.id,
      skillName: skill.name,
      rendered: renderedPrompt,
      result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Invoke skill error');
    res.status(500).json({ error: 'Failed to invoke skill' });
  }
});

module.exports = router;
