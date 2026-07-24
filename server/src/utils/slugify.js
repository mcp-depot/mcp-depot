function slugify(str, maxLength = 32) {
  let slug = str
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!slug) slug = '_';
  if (slug.length > maxLength) {
    slug = slug.substring(0, maxLength).replace(/_+$/g, '');
  }
  return slug;
}

function computeExposedName(integrationSlug, toolName, maxTotal = 64) {
  const slug = slugify(integrationSlug, 32);
  const toolPart = toolName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const prefix = slug + '_';
  const budget = maxTotal - prefix.length;
  const truncated = budget > 0 ? toolPart.substring(0, budget).replace(/_+$/g, '') : '';
  return prefix + truncated;
}

module.exports = { slugify, computeExposedName };
