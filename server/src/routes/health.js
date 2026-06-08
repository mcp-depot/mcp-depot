'use strict';

const express = require('express');
const { authWithApiKey } = require('../middleware/auth');
const Integration = require('../models/Integration');
const { checkAll, getCached, getCachedById } = require('../health/checker');
const logger = require('../services/logger');

const router = express.Router();

router.get('/', authWithApiKey, async (req, res) => {
  try {
    const cached = getCached();
    res.json({ cached, lastRefresh: cached.length > 0 ? cached[0]?.checkedAt : null });
  } catch (err) {
    logger.error({ err: err.message }, 'Health check error');
    res.status(500).json({ error: 'Failed to get health status' });
  }
});

router.post('/refresh', authWithApiKey, async (req, res) => {
  try {
    const whereClause = req.user.role === 'admin'
      ? { isActive: true }
      : { isActive: true, userId: req.user.id };

    const integrations = await Integration.findAll({ where: whereClause });
    const results = await checkAll(integrations);

    res.json({ results, checkedAt: new Date().toISOString() });
  } catch (err) {
    logger.error({ err: err.message }, 'Health refresh error');
    res.status(500).json({ error: 'Failed to refresh health' });
  }
});

module.exports = router;
