const express = require('express');
const { auth } = require('../middleware/auth');
const Integration = require('../models/Integration');
const AdapterFactory = require('../adapters');

const createPlatformRouter = (type) => {
  const router = express.Router();

  router.get('/', auth, async (req, res) => {
    try {
      const integrations = await Integration.find({
        userId: req.user._id,
        type,
        isActive: true
      });

      res.json(integrations.map(i => ({
        id: i._id,
        name: i.name,
        baseUrl: i.config.baseUrl
      })));
    } catch (error) {
      res.status(500).json({ error: `Failed to list ${type} integrations` });
    }
  });

  router.post('/request', auth, async (req, res) => {
    try {
      const { integrationId, method, path, data, params, headers } = req.body;

      const integration = await Integration.findOne({
        _id: integrationId || req.body.integrationId,
        userId: req.user._id,
        type,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      const adapter = AdapterFactory.create(type, integration.config);
      
      let result;
      const reqMethod = (method || 'GET').toUpperCase();

      switch (reqMethod) {
        case 'GET':
          result = await adapter.get(path, { params: params || {}, headers: headers || {} });
          break;
        case 'POST':
          result = await adapter.post(path, data, { params: params || {}, headers: headers || {} });
          break;
        case 'PUT':
          result = await adapter.put(path, data, { params: params || {}, headers: headers || {} });
          break;
        case 'PATCH':
          result = await adapter.patch(path, data, { params: params || {}, headers: headers || {} });
          break;
        case 'DELETE':
          result = await adapter.delete(path, { params: params || {}, headers: headers || {} });
          break;
        default:
          return res.status(400).json({ error: 'Invalid method' });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

module.exports = createPlatformRouter;
