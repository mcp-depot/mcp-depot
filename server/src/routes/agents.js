const express = require('express');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const logger = require('../services/logger');
const { loadModels } = require('../config/database');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const agents = await Agent.findAll({
      where: {
        [Op.or]: [
          { createdBy: req.user.id },
          { isShared: true }
        ]
      },
      order: [['name', 'ASC']]
    });
    res.json(agents);
  } catch (error) {
    logger.error({ error: error.message }, 'List agents error');
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

router.get('/:name', auth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const agent = await Agent.findOne({
      where: {
        name: req.params.name,
        [Op.or]: [
          { createdBy: req.user.id },
          { isShared: true }
        ]
      }
    });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const response = agent.toJSON();
    response.tools = agent.tools ? JSON.parse(agent.tools) : [];

    const clientType = req.query.clientType;
    if (clientType) {
      response.installConfig = generateInstallConfig(agent, clientType.toLowerCase(), response.tools);
    }

    res.json(response);
  } catch (error) {
    logger.error({ error: error.message }, 'Get agent error');
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

function generateInstallConfig(agent, clientType, tools) {
  if (clientType === 'claude-code') {
    return {
      clientType: 'claude-code',
      installPath: `.claude/agents/${agent.name}/AGENT.md`,
      content: `---
description: ${agent.description || `${agent.role} agent`}
tools: [${(tools.length ? tools.join(', ') : 'read, grep, bash')}]
model: ${agent.model || ''}
---
${agent.systemPrompt}`
    };
  }
  if (clientType === 'opencode') {
    return {
      clientType: 'opencode',
      installPath: `.opencode/agents/${agent.name}.md`,
      content: `# ${agent.name}\n\n${agent.systemPrompt}`
    };
  }
  return { clientType: 'generic', agent: agent.toJSON() };
}

router.post('/', auth, async (req, res) => {
  try {
    const { name, role, systemPrompt, description, isShared, tools, model } = req.body;
    if (!name || !role || !systemPrompt) {
      return res.status(400).json({ error: 'name, role, and systemPrompt are required' });
    }
    const { Agent } = loadModels();
    const [agent, created] = await Agent.findOrCreate({
      where: { name },
      defaults: {
        name,
        role,
        systemPrompt,
        description: description || '',
        isShared: isShared || false,
        tools: tools ? JSON.stringify(tools) : '[]',
        model: model || null,
        createdBy: req.user.id
      }
    });
    if (!created) {
      await agent.update({
        role,
        systemPrompt,
        description: description !== undefined ? description : agent.description,
        isShared: isShared !== undefined ? isShared : agent.isShared,
        tools: tools !== undefined ? JSON.stringify(tools) : agent.tools,
        model: model !== undefined ? model : agent.model,
        createdBy: req.user.id
      });
    }
    res.status(created ? 201 : 200).json(agent);
  } catch (error) {
    logger.error({ error: error.message }, 'Create agent error');
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.put('/:name', auth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const agent = await Agent.findOne({
      where: { name: req.params.name, createdBy: req.user.id }
    });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or you do not own it' });
    }
    const { role, systemPrompt, description, isShared, tools, model } = req.body;
    const updates = {};
    if (role !== undefined) updates.role = role;
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (description !== undefined) updates.description = description;
    if (isShared !== undefined) updates.isShared = isShared;
    if (tools !== undefined) updates.tools = JSON.stringify(tools);
    if (model !== undefined) updates.model = model;
    await agent.update(updates);
    res.json(agent);
  } catch (error) {
    logger.error({ error: error.message }, 'Update agent error');
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

router.delete('/:name', auth, async (req, res) => {
  try {
    const { Agent } = loadModels();
    const agent = await Agent.findOne({
      where: { name: req.params.name, createdBy: req.user.id }
    });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or you do not own it' });
    }
    await agent.destroy();
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete agent error');
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

module.exports = router;
