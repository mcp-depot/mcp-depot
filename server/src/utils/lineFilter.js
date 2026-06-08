function filterLines(content, pattern) {
  if (!pattern || typeof content !== 'string') return content;
  try {
    const regex = new RegExp(pattern, 'i');
    const matched = content.split('\n').filter(line => regex.test(line));
    return matched.length > 0
      ? matched.join('\n')
      : `[No lines matched pattern: ${pattern}]`;
  } catch (e) {
    return content;
  }
}

module.exports = { filterLines };
