'use strict';

function stripNulls(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls).filter(v => v !== undefined);
  if (typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleaned = stripNulls(value);
    if (cleaned !== undefined && cleaned !== null) {
      result[key] = cleaned;
    }
  }
  return result;
}

function flattenSingle(obj) {
  if (obj && typeof obj === 'object') {
    const values = Object.values(obj);
    if (values.length === 1) return values[0];
  }
  return obj;
}

function snakeToTitle(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function snakeToTitleKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(snakeToTitleKeys);
  if (typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToTitle(key)] = snakeToTitleKeys(value);
  }
  return result;
}

function makeTruncateStrings(maxLength) {
  return function truncateStrings(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(truncateStrings);
    if (typeof obj === 'string') {
      return obj.length > maxLength ? obj.slice(0, maxLength) + '...' : obj;
    }
    if (typeof obj !== 'object') return obj;
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = truncateStrings(value);
    }
    return result;
  };
}

function makeAddTimestamp() {
  return function addTimestamp(obj) {
    const wrapper = { _fetchedAt: new Date().toISOString() };
    if (Array.isArray(obj)) {
      return obj.map(item => ({ ...wrapper, ...item }));
    }
    if (obj && typeof obj === 'object') {
      return { ...wrapper, ...obj };
    }
    return wrapper;
  };
}

module.exports = {
  stripNulls,
  flattenSingle,
  snakeToTitle: snakeToTitleKeys,
  truncateStrings: makeTruncateStrings,
  addTimestamp: makeAddTimestamp,
};
