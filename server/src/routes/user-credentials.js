const express = require('express');
const Joi = require('joi');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');
const encryption = require('../services/encryption');

const router = express.Router();

const credentialsSchema = Joi.object({
  credentials: Joi.object().required()
});

router.get('/credentials/:integrationId', auth, async (req, res) => {
  try {
    const { UserIntegrationCredentials, Integration } = loadModels();
    const { integrationId } = req.params;
    const userId = req.user.id;

    const integration = await Integration.findByPk(integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const userCreds = await UserIntegrationCredentials.findOne({
      where: { userId, integrationId, isActive: true }
    });

    if (!userCreds) {
      return res.json({ hasCredentials: false });
    }

    const decryptedCredentials = encryption.decryptObject(userCreds.credentials);

    res.json({
      hasCredentials: true,
      credentials: decryptedCredentials
    });
  } catch (error) {
    console.error('Get credentials error:', error);
    res.status(500).json({ error: 'Failed to get credentials' });
  }
});

router.post('/credentials/:integrationId', auth, async (req, res) => {
  try {
    const { error, value } = credentialsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { UserIntegrationCredentials, Integration } = loadModels();
    const { integrationId } = req.params;
    const userId = req.user.id;
    const { credentials } = value;

    const integration = await Integration.findByPk(integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const encryptedCredentials = encryption.encryptObject(credentials);

    const [userCreds, created] = await UserIntegrationCredentials.upsert({
      userId,
      integrationId,
      credentials: encryptedCredentials,
      isActive: true
    });

    res.json({ 
      success: true, 
      message: created ? 'Credentials saved' : 'Credentials updated' 
    });
  } catch (error) {
    console.error('Save credentials error:', error);
    res.status(500).json({ error: 'Failed to save credentials' });
  }
});

router.delete('/credentials/:integrationId', auth, async (req, res) => {
  try {
    const { UserIntegrationCredentials } = loadModels();
    const { integrationId } = req.params;
    const userId = req.user.id;

    const deleted = await UserIntegrationCredentials.destroy({
      where: { userId, integrationId }
    });

    if (deleted) {
      res.json({ success: true, message: 'Credentials removed' });
    } else {
      res.status(404).json({ error: 'No credentials found' });
    }
  } catch (error) {
    console.error('Delete credentials error:', error);
    res.status(500).json({ error: 'Failed to delete credentials' });
  }
});

router.get('/shared', auth, async (req, res) => {
  try {
    const { Integration, UserIntegrationCredentials } = loadModels();
    const userId = req.user.id;

    const integrations = await Integration.findAll({
      where: { isActive: true },
      attributes: ['id', 'type', 'name', 'description'],
      order: [['name', 'ASC']],
      raw: true
    });

    const userCreds = await UserIntegrationCredentials.findAll({
      where: { userId, isActive: true },
      attributes: ['integrationId'],
      raw: true
    });
    const credsMap = new Set(userCreds.map(c => c.integrationId));

    const result = integrations.map(i => ({
      ...i,
      hasUserCredentials: credsMap.has(i.id)
    }));

    res.json(result);
  } catch (error) {
    console.error('Get shared integrations error:', error);
    res.status(500).json({ error: 'Failed to get integrations' });
  }
});

module.exports = router;