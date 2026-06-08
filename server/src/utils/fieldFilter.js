function filterFields(obj, paths) {
  if (!paths || paths.length === 0) return obj;
  if (obj === null || typeof obj !== 'object') return obj;

  const grouped = {};
  for (const path of paths) {
    const dotIdx = path.indexOf('.');
    const head = dotIdx === -1 ? path : path.slice(0, dotIdx);
    const tail = dotIdx === -1 ? null : path.slice(dotIdx + 1);
    if (!grouped[head]) grouped[head] = [];
    if (tail) grouped[head].push(tail);
  }

  const result = {};
  for (const [key, subPaths] of Object.entries(grouped)) {
    if (!(key in obj)) continue;
    const val = obj[key];
    if (subPaths.length === 0) {
      result[key] = val;
    } else if (Array.isArray(val)) {
      result[key] = val.map(item => filterFields(item, subPaths));
    } else if (val && typeof val === 'object') {
      result[key] = filterFields(val, subPaths);
    } else {
      result[key] = val;
    }
  }
  return result;
}

module.exports = { filterFields };
