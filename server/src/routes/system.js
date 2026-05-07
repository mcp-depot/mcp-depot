const express = require('express');
const Joi = require('joi');
const { auth, requireAdmin } = require('../middleware/auth');
const SystemSetting = require('../models/SystemSetting');

const router = express.Router();

const updateSettingSchema = Joi.object({
  value: Joi.any().required(),
  description: Joi.string()
});

const importDataSchema = Joi.object({
  externalMcp: Joi.array().items(Joi.object()).default([]),
  integrations: Joi.array().items(Joi.object()).default([]),
  tools: Joi.array().items(Joi.object()).default([]),
  skills: Joi.array().items(Joi.object()).default([]),
  sessionContexts: Joi.array().items(Joi.object()).default([]),
  externalMcpServers: Joi.array().items(Joi.object()).default([])
});

router.get('/', auth, async (req, res) => {
  try {
    const settings = await SystemSetting.findAll();
    const result = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/mcp', auth, async (req, res) => {
  try {
    const setting = await SystemSetting.findByPk('mcp');
    res.json(setting?.value || { authMode: 'none' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const DEFAULT_FEATURES = ['integrations', 'tools', 'skills', 'sessions', 'channels', 'personas', 'users', 'monitoring', 'health'];

router.get('/features', auth, async (req, res) => {
  try {
    const setting = await SystemSetting.findByPk('enabled_features');
    res.json({ enabledFeatures: setting?.value?.features || DEFAULT_FEATURES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/features', auth, requireAdmin, async (req, res) => {
  try {
    const { features } = req.body;
    if (!Array.isArray(features)) {
      return res.status(400).json({ error: 'features must be an array' });
    }
    const LOCKED_FEATURES = ['integrations', 'tools'];
    const merged = [...new Set([...LOCKED_FEATURES, ...features])];
    await SystemSetting.upsert({ 
      key: 'enabled_features', 
      value: { features: merged },
      description: 'Enabled UI feature sections'
    });
    res.json({ enabledFeatures: merged });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/setup-status', auth, async (req, res) => {
  try {
    const setting = await SystemSetting.findByPk('setup_complete');
    res.json({ setupComplete: setting?.value?.complete === true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/setup-complete', auth, requireAdmin, async (req, res) => {
  try {
    const { mode, enabledFeatures } = req.body;
    await SystemSetting.upsert({ 
      key: 'setup_complete', 
      value: { complete: true, mode, completedAt: new Date().toISOString() }
    });
    if (enabledFeatures) {
      await SystemSetting.upsert({ key: 'enabled_features', value: { features: enabledFeatures } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/setup-complete', auth, requireAdmin, async (req, res) => {
  try {
    await SystemSetting.destroy({ where: { key: 'setup_complete' } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:key', auth, async (req, res) => {
  try {
    const setting = await SystemSetting.findByPk(req.params.key);
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json(setting.value);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:key', auth, requireAdmin, async (req, res) => {
  try {
    const { error, value } = updateSettingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { key } = req.params;
    const { value: settingValue, description } = value;
    
    const [setting, created] = await SystemSetting.upsert({
      key,
      value: settingValue,
      description
    });
    
    res.json({ success: true, setting: { key: setting.key, value: setting.value } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/export', auth, async (req, res) => {
    try {
    const { externalMcp, integrations, tools, skills, sessionContexts } = req.body;
    const { loadModels } = require('../config/database');
    const exportData = { exportedAt: new Date().toISOString(), version: '1.0' };
    
    if (externalMcp) {
      const { ExternalMcpServer } = loadModels();
      const servers = await ExternalMcpServer.findAll({ where: { userId: req.user.id } });
      exportData.externalMcpServers = servers.map(s => ({
        name: s.name,
        transportType: s.transportType,
        runtime: s.runtime,
        url: s.url,
        command: s.command,
        args: s.args,
        env: s.env,
        authType: s.authType,
        isActive: s.isActive
      }));
    }
    
    if (integrations) {
      const { Integration } = loadModels();
      const ints = await Integration.findAll({ where: { userId: req.user.id } });
      exportData.integrations = ints.map(i => {
        const { credentials, ...authWithoutCredentials } = i.config?.auth || {};
        return {
          name: i.name,
          type: i.type,
          config: {
            ...i.config,
            auth: authWithoutCredentials
          }
        };
      });
    }
    
    if (tools) {
      const Tool = require('../models/Tool');
      const Integration = require('../models/Integration');
      const userTools = await Tool.findAll({ 
        where: { userId: req.user.id },
        include: [{ model: Integration, as: 'integration', attributes: ['name'] }]
      });
      exportData.tools = userTools.map(t => ({
        name: t.name,
        description: t.description,
        endpoint: t.endpoint,
        inputSchema: t.inputSchema,
        integrationName: t.integration?.name || null
      }));
    }
    
    if (skills) {
      const { PromptLibrary } = loadModels();
      const items = await PromptLibrary.findAll({ where: { userId: req.user.id } });
      exportData.skills = items.map(s => ({
        name: s.name,
        description: s.description,
        inputs: s.inputs,
        prompt: s.prompt,
        isDefault: s.isDefault
      }));
    }

    if (sessionContexts) {
      const { SessionContext } = loadModels();
      const items = await SessionContext.findAll({ 
        where: { userId: req.user.id, ttlHours: 0 }
      });
      exportData.sessionContexts = items.map(c => ({
        name: c.name,
        content: c.content,
        isShared: c.isShared,
        ttlHours: 0
      }));
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=mcp-depot-export.json');
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', auth, requireAdmin, async (req, res) => {
  try {
    const { error, value } = importDataSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { loadModels } = require('../config/database');
    const result = { externalMcp: 0, integrations: 0, tools: 0, skills: 0, sessionContexts: 0 };
    
    if (value.integrations) {
      const { Integration } = loadModels();
      for (let i = 0; i < value.integrations.length; i++) {
        const int = value.integrations[i];
        const [created] = await Integration.findOrCreate({
          where: { name: int.name, userId: req.user.id },
          defaults: {
            type: int.type,
            config: int.config ?? {},
            credentials: null
          }
        });
        result.integrations++;
      }
    }

    // Build a complete name→id map from ALL of the user's integrations (imported + pre-existing)
    const { Integration } = loadModels();
    const allIntegrations = await Integration.findAll({ where: { userId: req.user.id } });
    const integrationNameToId = new Map(allIntegrations.map(i => [i.name, i.id]));
    
    if (value.externalMcpServers) {
      const { ExternalMcpServer } = loadModels();
      for (const server of value.externalMcpServers) {
        await ExternalMcpServer.create({
          ...server,
          userId: req.user.id,
          authToken: null
        });
        result.externalMcp++;
      }
    }
    
    if (value.tools) {
      const Tool = require('../models/Tool');
      for (const tool of value.tools) {
        const toolData = {
          name: tool.name,
          description: tool.description,
          endpoint: tool.endpoint,
          inputSchema: tool.inputSchema,
          userId: req.user.id
        };
        if (tool.integrationName && integrationNameToId.has(tool.integrationName)) {
          toolData.integrationId = integrationNameToId.get(tool.integrationName);
        }
        if (!toolData.integrationId) {
          console.warn(`Skipping tool "${tool.name}" — no linked integration found`);
          continue;
        }
        await Tool.findOrCreate({
          where: { name: tool.name, userId: req.user.id },
          defaults: toolData
        });
        result.tools++;
      }
    }
    
    if (value.skills) {
      const { PromptLibrary } = loadModels();
      for (const skill of value.skills) {
        await PromptLibrary.findOrCreate({
          where: { name: skill.name, userId: req.user.id },
          defaults: {
            name: skill.name,
            description: skill.description,
            inputs: skill.inputs,
            prompt: skill.prompt,
            isDefault: skill.isDefault,
            userId: req.user.id
          }
        });
        result.skills++;
      }
    }

    if (value.sessionContexts) {
      const { SessionContext } = loadModels();
      for (const ctx of value.sessionContexts) {
        await SessionContext.findOrCreate({
          where: { name: ctx.name, userId: req.user.id },
          defaults: {
            name: ctx.name,
            content: ctx.content,
            isShared: ctx.isShared,
            ttlHours: 0,
            createdBy: req.user.id
          }
        });
        result.sessionContexts++;
      }
    }
    
    res.json(result);

    if (process.env.MCP_ENABLED === 'true') {
      const { refreshToolsIfEnabled } = require('../mcp/server');
      refreshToolsIfEnabled();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import-preview', auth, async (req, res) => {
  try {
    const preview = {
      externalMcpServers: [],
      integrations: [],
      tools: [],
      workflows: []
    };
    
    if (req.body.externalMcpServers) {
      preview.externalMcpServers = req.body.externalMcpServers.map(s => ({
        name: s.name,
        transportType: s.transportType || 'http',
        runtime: s.runtime || 'node',
        url: s.url || '',
        command: s.command || '',
        args: s.args || ''
      }));
    }
    
    if (req.body.integrations) {
      preview.integrations = req.body.integrations.map(i => ({
        name: i.name,
        type: i.type,
        config: i.config ?? {}
      }));
    }
    
    if (req.body.tools) {
      preview.tools = req.body.tools.map((t, idx) => ({
        name: t.name,
        description: t.description || '',
        endpoint: t.endpoint,
        inputSchema: t.inputSchema,
        integrationName: t.integrationName || null,
        integrationId: t.integrationId,
        integrationRef: t.integrationName
          || (t.integrationId != null ? `Integration #${t.integrationId}` : null)
      }));
    }

    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
