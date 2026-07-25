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

module.exports = { BUILT_IN_INTEGRATION_NAMES, isBuiltInIntegration };
