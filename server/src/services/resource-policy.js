const { checkPolicy, evaluatePolicy } = require('./policy');

// Thin wrappers around the generic checkPolicy() for each resource type that
// has migrated its hardcoded role checks onto the policy engine, mirroring
// tool-policy.js's shape for tools. All of these resources are only ever
// reached behind the `auth` middleware (unlike some tool-call entry points,
// which allow anonymous access) - so unlike checkToolPolicy there is no "no
// authenticated caller, skip" branch here. Reaching any of these functions
// without a user would mean the auth middleware itself failed to run, which
// is fail-closed territory, not a normal path.
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

async function checkIntegrationPolicy({ user, action, integrationId }) {
  if (!user?.id) {
    return { decision: 'deny', reason: 'No authenticated user', matchedRuleId: null, error: true };
  }
  return checkPolicy({
    user: { id: user.id, role: user.role },
    resourceType: 'integration',
    resourceId: integrationId,
    action,
    requestContext: { integrationId }
  });
}

async function checkGroupPolicy({ user, action, groupId }) {
  if (!user?.id) {
    return { decision: 'deny', reason: 'No authenticated user', matchedRuleId: null, error: true };
  }
  return checkPolicy({
    user: { id: user.id, role: user.role },
    resourceType: 'group',
    resourceId: groupId,
    action,
    requestContext: { groupId }
  });
}

// External MCP server management (create / configure_stdio / install_package)
// - previously hardcoded requireAdmin/inline role checks in routes/external-mcp.js,
// with no way to delegate any of it short of making someone a full site admin.
// resourceId is the server's name (or the package name for install_package) -
// there's often no server row yet at check time (create, install_package
// isn't even tied to one server), so unlike checkIntegrationPolicy this is a
// capability check more than a specific-resource check. Default policy (see
// createDefaultPolicyRules) preserves prior behavior: configure_stdio and
// install_package deny-unless-admin, create has no seeded rule so it stays
// open (matching today's self-service http/sse creation) unless an admin
// adds one.
async function checkExternalMcpPolicy({ user, action, resourceId }) {
  if (!user?.id) {
    return { decision: 'deny', reason: 'No authenticated user', matchedRuleId: null, error: true };
  }
  return checkPolicy({
    user: { id: user.id, role: user.role },
    resourceType: 'external_mcp_server',
    resourceId,
    action,
    requestContext: { resourceId }
  });
}

// Read-only preview for list rendering (e.g. "show the Share button on
// this row?") across potentially many integrations at once - see
// evaluatePolicy's comment in policy.js for why this must not be the
// audited checkPolicy path. Never use this to gate an actual action.
async function evaluateIntegrationPolicy({ user, action, integrationId }) {
  if (!user?.id) {
    return { decision: 'deny', reason: 'No authenticated user' };
  }
  return evaluatePolicy({
    user: { id: user.id, role: user.role },
    resourceType: 'integration',
    resourceId: integrationId,
    action
  });
}

module.exports = { checkSessionContextPolicy, checkSessionChannelPolicy, checkIntegrationPolicy, checkGroupPolicy, checkExternalMcpPolicy, evaluateIntegrationPolicy };
