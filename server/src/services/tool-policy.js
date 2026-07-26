const { checkPolicy } = require('./policy');
const User = require('../models/User');

function toolResourceId(tool) {
  return tool.exposedName || tool.name || tool.id;
}

// Thin, tool-specific wrapper around the generic checkPolicy() - derives
// resourceType/resourceId/action for a Tool record and normalizes the two
// shapes callers have on hand (a full `user` object with .role already
// loaded, vs. a bare `userId` string with no role resolved yet).
//
// When there's no authenticated caller at all (some entry points allow
// anonymous access today, e.g. routes/consume.js's optionalAuthWithApiKey),
// the check is skipped entirely and the call proceeds exactly as it did
// before this feature existed - a decision can't be attributed to no one,
// and each entry point already enforces whatever auth requirement it wants
// independent of this policy layer. Anonymous callers are simply not yet
// governed by it.
//
// Tools proxied from an external MCP server (routes/mcp.js's isExternal
// branch) have no local Tool row, so that branch builds a minimal stand-in
// object with the same id/name/exposedName/integrationId shape and passes
// it here - toolResourceId() only needs those fields, not a real Tool
// instance.
async function checkToolPolicy({ user, userId, tool }) {
  let resolvedUser = user;
  if (!resolvedUser && userId) {
    try {
      resolvedUser = await User.findByPk(userId);
    } catch (err) {
      // Same fail-closed stance as checkPolicy() itself - a lookup failure
      // must not silently fall through to "no user, skip the check".
      return { decision: 'deny', reason: 'Policy check failed', matchedRuleId: null, error: true };
    }
  }
  if (!resolvedUser?.id) {
    return { decision: 'allow', reason: 'No authenticated user - policy not evaluated', matchedRuleId: null, skipped: true };
  }

  return checkPolicy({
    user: { id: resolvedUser.id, role: resolvedUser.role },
    resourceType: 'tool',
    resourceId: toolResourceId(tool),
    action: 'execute',
    requestContext: { toolId: tool.id, toolName: tool.name, integrationId: tool.integrationId }
  });
}

module.exports = { checkToolPolicy, toolResourceId };
