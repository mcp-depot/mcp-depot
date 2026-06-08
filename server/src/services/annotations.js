function deriveAnnotations(method) {
  const m = method ? method.toUpperCase() : 'GET';
  return {
    readOnlyHint: m === 'GET' || m === 'HEAD',
    destructiveHint: m === 'DELETE' || m === 'POST',
    idempotentHint: m !== 'POST',
    openWorldHint: true
  };
}

module.exports = { deriveAnnotations };
