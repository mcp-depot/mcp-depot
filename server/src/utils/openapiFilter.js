function shouldInclude(operation, filter) {
  if (!filter) return true;
  const tags = operation.tags ?? [];
  const { tags: tagFilter, operationIds: opFilter } = filter;

  if (tagFilter?.include?.length) {
    if (!tags.some(t => tagFilter.include.includes(t))) return false;
  }
  if (tagFilter?.exclude?.length) {
    if (tags.some(t => tagFilter.exclude.includes(t))) return false;
  }
  if (opFilter?.exclude?.length) {
    if (opFilter.exclude.includes(operation.operationId)) return false;
  }
  return true;
}

module.exports = { shouldInclude };
