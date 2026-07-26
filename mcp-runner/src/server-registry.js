// In-memory map of serverId -> spawn config ({command, args, env}), pushed
// here by the main server's POST /register whenever a stdio external MCP
// server is created/updated. Deliberately not persisted - this sidecar is
// stateless by design; if it restarts and loses this map, a WS connect
// attempt against an unregistered serverId fails at the handshake (see
// ws-bridge.js), and the main server's connection pool re-registers and
// retries once (see mcp-connection-pool.js's _connectStdioViaRunner).
const servers = new Map();

function register(serverId, config) {
  servers.set(serverId, config);
}

function get(serverId) {
  return servers.get(serverId);
}

function unregister(serverId) {
  servers.delete(serverId);
}

function size() {
  return servers.size;
}

module.exports = { register, get, unregister, size };
