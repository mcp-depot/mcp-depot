const express = require('express');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const prompts = await PromptLibrary.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(prompts);
  } catch (error) {
    console.error('List prompts error:', error);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const { name, description, inputs, prompt } = req.body;
    
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
    console.error('Create prompt error:', error);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { PromptLibrary } = loadModels();
    const { id } = req.params;
    const { name, description, inputs, prompt } = req.body;
    
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
    console.error('Update prompt error:', error);
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
    console.error('Delete prompt error:', error);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

module.exports = router;
