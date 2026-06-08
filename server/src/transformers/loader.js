'use strict';

const fs = require('fs');
const path = require('path');
const builtins = require('./builtins');
const logger = require('../services/logger');

const BUILTIN_NAMES = new Set(Object.keys(builtins));
const MAX_TRUNCATE_LENGTH = 500;

class TransformerLoader {
  constructor() {
    this.transformers = new Map();
    this.loadBuiltins();
  }

  loadBuiltins() {
    for (const [name, fn] of Object.entries(builtins)) {
      if (name === 'truncateStrings') {
        this.transformers.set(name, fn(MAX_TRUNCATE_LENGTH));
      } else {
        this.transformers.set(name, fn);
      }
    }
    logger.info({ count: BUILTIN_NAMES.size }, 'Built-in transformers loaded');
  }

  loadUserTransformers(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('index'));
    for (const file of files) {
      const name = path.basename(file, '.js');
      if (BUILTIN_NAMES.has(name)) {
        logger.warn({ name, file }, 'Skipping user transformer — name conflicts with built-in');
        continue;
      }
      try {
        const mod = require(path.join(dir, file));
        const fn = mod.default || mod;
        if (typeof fn === 'function') {
          this.transformers.set(name, fn);
          logger.debug({ name, file }, 'User transformer loaded');
        } else {
          logger.warn({ name }, 'Transformer file does not export a function');
        }
      } catch (err) {
        logger.warn({ name, file, error: err.message }, 'Failed to load user transformer');
      }
    }
  }

  get(name) {
    return this.transformers.get(name) || null;
  }

  list() {
    return Array.from(this.transformers.keys());
  }
}

const loader = new TransformerLoader();

module.exports = loader;
