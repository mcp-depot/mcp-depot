function filterFields(obj, paths) {
  if (!paths || paths.length === 0) return obj;
  const result = {};
  for (const path of paths) {
    const parts = path.split('.');
    let src = obj;
    let dst = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (src == null) break;
      if (Array.isArray(src)) {
        src = src.map(item => {
          const nested = {};
          let n = nested;
          for (let j = i; j < parts.length - 1; j++) {
            if (item == null) break;
            n[parts[j]] = {};
            n = n[parts[j]];
            item = item[parts[j]];
          }
          const leaf = parts.at(-1);
          if (item != null && leaf in item) n[leaf] = item[leaf];
          return nested;
        });
        dst[parts[i]] = src;
        break;
      }
      dst[parts[i]] ??= {};
      dst = dst[parts[i]];
      src = src?.[parts[i]];
    }
    if (!Array.isArray(src)) {
      const leaf = parts.at(-1);
      if (src != null && leaf in src) dst[leaf] = src[leaf];
    }
  }
  return result;
}

module.exports = { filterFields };
