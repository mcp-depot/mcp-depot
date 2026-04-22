function pruneNulls(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => pruneNulls(item)).filter(item => item !== null && item !== undefined);
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const pruned = pruneNulls(value);
    if (pruned !== null && pruned !== undefined) {
      if (typeof pruned === 'object' && Object.keys(pruned).length === 0) continue;
      result[key] = pruned;
    }
  }
  return result;
}

module.exports = { pruneNulls };
