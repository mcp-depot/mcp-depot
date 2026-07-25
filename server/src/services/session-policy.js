const { checkPolicy } = require('./policy');

// Thin wrappers around the generic checkPolicy() for session contexts and
// session channels, mirroring tool-policy.js's shape for tools. Both
// resources are only ever reached behind the `auth` middleware (unlike some
// tool-call entry points, which allow anonymous access) - so unlike
// checkToolPolicy there is no "no authenticated caller, skip" branch here.
// Reaching either function without a user would mean the auth middleware
// itself failed to run, which is fail-closed territory, not a normal path.
async function checkSessionContextPolicy({ user, action, name }) {
  if (!user?.id) {
    return { decision: 'deny', reason: 'No authenticated user', matchedRuleId: null, error: true };
  }
  return checkPolicy({
    user: { id: user.id, role: user.role },
    resourceType: 'session_context',
    resourceId: name,
    action,
    requestContext: { name }
  });
}

async function checkSessionChannelPolicy({ user, action, channel }) {
  if (!user?.id) {
    return { decision: 'deny', reason: 'No authenticated user', matchedRuleId: null, error: true };
  }
  return checkPolicy({
    user: { id: user.id, role: user.role },
    resourceType: 'session_channel',
    resourceId: channel,
    action,
    requestContext: { channel }
  });
}

module.exports = { checkSessionContextPolicy, checkSessionChannelPolicy };
