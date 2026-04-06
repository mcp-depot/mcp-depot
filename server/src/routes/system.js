const express = require('express');
const Joi = require('joi');
const { auth } = require('../middleware/auth');
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
  workflows: Joi.array().items(Joi.object()).default([]),
  externalMcpServers: Joi.array().items(Joi.object()).default([])
});

router.get('/', async (req, res) => {
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

router.get('/mcp', async (req, res) => {
  try {
    const setting = await SystemSetting.findByPk('mcp');
    res.json(setting?.value || { authMode: 'none' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:key', async (req, res) => {
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

router.put('/:key', auth, async (req, res) => {
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
    const { externalMcp, integrations, tools, workflows } = req.body;
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
        authHeader: s.authHeader,
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
      const userTools = await Tool.findAll({ where: { userId: req.user.id } });
      exportData.tools = userTools.map(t => ({
        name: t.name,
        description: t.description,
        endpoint: t.endpoint,
        inputSchema: t.inputSchema,
        integrationId: t.integrationId
      }));
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=mcpconnect-export.json');
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', auth, async (req, res) => {
  try {
    const { error, value } = importDataSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { loadModels } = require('../config/database');
    const result = { externalMcp: 0, integrations: 0, tools: 0, workflows: 0 };
    const integrationIdMap = new Map();
    
    if (value.integrations) {
      const { Integration } = loadModels();
      for (let i = 0; i < value.integrations.length; i++) {
        const int = value.integrations[i];
        const created = await Integration.create({
          name: int.name,
          type: int.type,
          config: int.config,
          userId: req.user.id,
          credentials: null
        });
        integrationIdMap.set(i, created.id);
        result.integrations++;
      }
    }
    
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
        if (tool.integrationId != null && integrationIdMap.has(tool.integrationId)) {
          toolData.integrationId = integrationIdMap.get(tool.integrationId);
        }
        await Tool.create(toolData);
        result.tools++;
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
        type: i.type
      }));
    }
    
    if (req.body.tools) {
      preview.tools = req.body.tools.map((t, idx) => ({
        name: t.name,
        description: t.description || '',
        endpoint: t.endpoint,
        integrationId: t.integrationId,
        integrationRef: t.integrationId != null ? `Integration #${t.integrationId}` : null
      }));
    }
    
    if (req.body.workflows) {
      preview.workflows = req.body.workflows.map(w => ({
        name: w.name,
        description: w.description || ''
      }));
    }
    
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
