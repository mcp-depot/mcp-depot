// Canonical list of MCP Depot's own integrations, created by
// createDefaultTool() at boot (config/database.js) - not something a user
// created and not safe to delete or restructure, since the app's own
// meta-tools/session/agent tooling depends on them existing with a stable
// name. Previously duplicated as inline literals in several files
// (meta-tools.js, consume.js, mcp.js) that had each drifted out of sync
// with each other and with the metadata.source==='built-in' flag the
// integrations.js delete/edit guards actually checked - which is exactly
// why "MCP Depot" and "MCP Depot Sessions" were deletable despite the
// guard existing: their seed code never set that flag. Name-based matching
// is the one signal that's actually reliable, since it doesn't depend on
// any seed function remembering to also set metadata.
const BUILT_IN_INTEGRATION_NAMES = ['MCP Depot', 'MCP Depot Sessions', 'MCP Depot Agents', 'MCP Depot - AI Tools'];

function isBuiltInIntegration(integration) {
  if (!integration) return false;
  return BUILT_IN_INTEGRATION_NAMES.includes(integration.name) || integration.metadata?.source === 'built-in';
}

// The one visibility rule for "can this caller see/use a tool belonging to
// this integration" - previously duplicated (and subtly diverged: one copy
// treated a missing integration as visible, the other as not) between
// mcp/server.js's tools/list filter and routes/mcp.js's REST tool listing.
// Fails closed on a missing integration, matching the stricter of the two
// prior copies - both source queries inner-join to an active integration
// already, so this only ever matters as a defensive default, not a real
// behavior change for existing callers.
function isToolVisibleToCaller(integration, callerUserId, role) {
  if (!integration) return false;
  if (role === 'admin') return true;
  return integration.visibility === 'shared' || integration.userId === callerUserId || isBuiltInIntegration(integration);
}

module.exports = { BUILT_IN_INTEGRATION_NAMES, isBuiltInIntegration, isToolVisibleToCaller };
