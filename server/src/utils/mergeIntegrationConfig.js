function hasCredentialValues(credentials) {
  if (!credentials || typeof credentials !== 'object') return false;
  return Object.values(credentials).some((value) => {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'object') return hasCredentialValues(value);
    return true;
  });
}

// Partial updates (e.g. baseUrl only) must not wipe stored auth credentials.
function mergeIntegrationConfig(existing = {}, incoming = {}) {
  const nextAuth = {
    ...(existing.auth || {}),
    ...(incoming.auth || {})
  };

  if (nextAuth.type === 'none') {
    nextAuth.credentials = {};
  } else if (hasCredentialValues(incoming.auth?.credentials)) {
    nextAuth.credentials = { ...incoming.auth.credentials };
  } else {
    nextAuth.credentials = existing.auth?.credentials;
  }

  return {
    ...existing,
    ...incoming,
    auth: nextAuth
  };
}

module.exports = { mergeIntegrationConfig, hasCredentialValues };
