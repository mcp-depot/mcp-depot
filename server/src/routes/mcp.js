const express = require('express');
const { spawn } = require('child_process');
const axios = require('axios');
const { sequelize, connectDB, loadModels } = require('../config/database');
const { optionalApiKey, authWithApiKey, optionalAuth } = require('../middleware/auth');
const { checkMcpAuth } = require('../middleware/mcpAuth');
const Tool = require('../models/Tool');
const Integration = require('../models/Integration');
const User = require('../models/User');
const AdapterFactory = require('../adapters');

const toolsCache = {
  data: null,
  timestamp: 0,
  ttl: parseInt(process.env.TOOLS_CACHE_TTL) || 300000
};

function getCachedTools() {
  const now = Date.now();
  if (toolsCache.data && (now - toolsCache.timestamp) < toolsCache.ttl) {
    return toolsCache.data;
  }
  return null;
}

function setCachedTools(tools) {
  toolsCache.data = tools;
  toolsCache.timestamp = Date.now();
}

function clearToolsCache() {
  toolsCache.data = null;
  toolsCache.timestamp = 0;
}

module.exports = { router, clearToolsCache };
