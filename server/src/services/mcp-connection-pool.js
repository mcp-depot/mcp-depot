'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { WebSocketClientTransport } = require('@modelcontextprotocol/sdk/client/websocket.js');
const { isUrlSafe } = require('../utils/ssrfGuard');
const mcpRunnerClient = require('./mcp-runner-client');
const logger = require('./logger');

const SESSION_IDLE_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // clean every 2 min
const CONNECT_TIMEOUT_MS = 10_000;
const LIST_TIMEOUT_MS = 10_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

class McpConnectionPool {
  constructor() {
    // Map<serverId, { client, transport, lastUsedAt, state, toolsHash, tools }>
    this._pool = new Map();
    // Map<serverId, Promise> - in-flight connect promises to deduplicate concurrent calls
    this._pending = new Map();
    setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
  }

  async getClient(server) {
    const existing = this._pool.get(server.id);
    if (existing && existing.state === 'connected') {
      existing.lastUsedAt = Date.now();
      return existing.client;
    }

    // Deduplicate concurrent connect calls for the same server
    if (existing && existing.state === 'connecting') {
      let pending = this._pending.get(server.id);
      if (!pending) {
        pending = this._connect(server).catch(err => {
          this._pending.delete(server.id);
          throw err;
        });
        this._pending.set(server.id, pending);
      }
      return pending;
    }

    return this._connect(server);
  }

  async _connect(server) {
    logger.info({ serverId: server.id, name: server.name, transport: server.transportType }, 'Connecting to external MCP server');

    const entry = { client: null, transport: null, lastUsedAt: Date.now(), state: 'connecting', toolsHash: null, tools: [] };
    this._pool.set(server.id, entry);

    try {
      const { client, transport } = await this._connectClient(server, `connect:${server.name}`);
      entry.client = client;
      entry.transport = transport;
      entry.state = 'connected';
      logger.info({ serverId: server.id }, 'External MCP server connected');

      // Handle unexpected disconnect
      transport.onclose = () => {
        logger.warn({ serverId: server.id }, 'External MCP server disconnected');
        this._pool.delete(server.id);
      };
      transport.onerror = (err) => {
        logger.error({ serverId: server.id, err: err.message }, 'External MCP server error');
        this._pool.delete(server.id);
      };

      return client;
    } catch (err) {
      this._pool.delete(server.id);
      throw new Error(`Failed to connect to ${server.name}: ${err.message}`);
    }
  }

  // Single chokepoint for "build a client/transport pair and connect it" -
  // branches to the mcp-runner sidecar for stdio servers when it's enabled,
  // otherwise unchanged (_createClient handles http/sse and local-stdio
  // identically to before). All three real call sites (_connect,
  // _listToolsStateless, _callToolStateless) go through this instead of
  // duplicating the connect-with-timeout pairing inline.
  async _connectClient(server, label) {
    if (server.transportType === 'stdio' && mcpRunnerClient.isEnabled()) {
      return this._connectStdioViaRunner(server, label);
    }
    const built = await this._createClient(server);
    await withTimeout(built.client.connect(built.transport), CONNECT_TIMEOUT_MS, label);
    return built;
  }

  // The sidecar is stateless about which servers exist (routes/external-mcp.js
  // pushes config eagerly on create/update, but a sidecar restart forgets
  // everything). The SDK's WebSocketClientTransport also strips WS close
  // codes before they reach onclose, so "the sidecar forgot us" can't be
  // cleanly distinguished from any other connect failure - instead of
  // fragile error-parsing, treat any failure here as "maybe forgotten,"
  // re-register, and retry exactly once with a fresh client/transport pair
  // (WebSocketClientTransport throws if connected twice on one instance).
  async _connectStdioViaRunner(server, label) {
    const args = this._parseJson(server.args, []);
    const env = this._parseJson(server.env, {});

    const attempt = async () => {
      mcpRunnerClient.ensureWebSocketGlobal();
      const client = new Client({ name: 'mcp-depot', version: '1.0.0' });
      const transport = new WebSocketClientTransport(mcpRunnerClient.buildWsUrl(server.id));
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, label);
      return { client, transport };
    };

    try {
      return await attempt();
    } catch (err) {
      logger.warn({ serverId: server.id, err: err.message }, 'stdio-via-runner connect failed, re-registering with mcp-runner and retrying once');
      await mcpRunnerClient.registerServer({ serverId: server.id, command: server.command, args, env });
      return attempt();
    }
  }

  async _createClient(server) {
    let transport;
    if (server.transportType === 'stdio') {
      const args = this._parseJson(server.args, []);
      const env = { ...process.env, ...this._parseJson(server.env, {}) };
      transport = new StdioClientTransport({
        command: server.command,
        args,
        env
      });
    } else {
      // http / sse
      // isUrlSafe is also checked when the server config is saved
      // (routes/external-mcp.js), but that only catches a bad URL at
      // write time. Connections here are pooled, reused, and reconnected
      // on idle timeout or reload - re-checking right before every actual
      // connection is what catches DNS rebinding (public IP at save time,
      // internal/metadata address by the time this runs).
      if (!(await isUrlSafe(server.url))) {
        throw new Error(`Refusing to connect to "${server.name}": URL points to a blocked or unresolvable internal address`);
      }
      const headers = this._buildAuthHeaders(server);
      transport = new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } });
    }

    const client = new Client({ name: 'mcp-depot', version: '1.0.0' });
    return { client, transport };
  }

  async listTools(server) {
    if (server.sessionMode === 'stateless') {
      return this._listToolsStateless(server);
    }
    const client = await this.getClient(server);
    const result = await withTimeout(client.listTools(), LIST_TIMEOUT_MS, `listTools:${server.name}`);
    return result.tools || [];
  }

  async _listToolsStateless(server) {
    const { client, transport } = await this._connectClient(server, `connect:${server.name}`);
    try {
      const result = await withTimeout(client.listTools(), LIST_TIMEOUT_MS, `listTools:${server.name}`);
      return result.tools || [];
    } finally {
      try { transport.close(); } catch {}
    }
  }

  async callTool(server, toolName, toolArgs) {
    if (server.sessionMode === 'stateless') {
      return this._callToolStateless(server, toolName, toolArgs);
    }
    try {
      const client = await this.getClient(server);
      return await client.callTool({ name: toolName, arguments: toolArgs || {} });
    } catch (err) {
      if (this._isConnectionError(err)) {
        logger.warn({ serverId: server.id, err: err.message }, 'Connection error - invalidating session');
        this.disconnect(server.id);
      }
      throw err;
    }
  }

  async _callToolStateless(server, toolName, toolArgs) {
    const { client, transport } = await this._connectClient(server, `connect:${server.name}`);
    try {
      return await client.callTool({ name: toolName, arguments: toolArgs || {} });
    } finally {
      try { transport.close(); } catch {}
    }
  }

  disconnect(serverId) {
    const entry = this._pool.get(serverId);
    if (entry) {
      try { entry.transport.close(); } catch {}
      this._pool.delete(serverId);
    }
  }

  async closeAll() {
    const ids = [...this._pool.keys()];
    for (const id of ids) {
      this.disconnect(id);
    }
    logger.info({ count: ids.length }, 'Connection pool closed');
  }

  _isConnectionError(err) {
    const msg = err.message || '';
    return msg.includes('ECONNREFUSED') ||
           msg.includes('EPIPE') ||
           msg.includes('socket hang up') ||
           msg.includes('Transport closed') ||
           msg.includes('Connection closed');
  }

  _cleanup() {
    const now = Date.now();
    for (const [id, entry] of this._pool.entries()) {
      if (now - entry.lastUsedAt > SESSION_IDLE_MS) {
        logger.info({ serverId: id }, 'Closing idle external MCP connection');
        try { entry.transport.close(); } catch {}
        this._pool.delete(id);
      }
    }
  }

  _parseJson(value, defaultValue) {
    if (!value) return defaultValue;
    try { return JSON.parse(value); } catch { return defaultValue; }
  }

  _buildAuthHeaders(server) {
    const headers = {};
    if (!server.authToken) return headers;
    const encryption = require('./encryption');
    const token = encryption.decrypt(server.authToken);
    if (!token) return headers;
    if (server.authType === 'bearer') headers['Authorization'] = `Bearer ${token}`;
    if (server.authType === 'apiKey') headers[server.authHeader || 'X-API-Key'] = token;
    return headers;
  }

  getPoolStatus() {
    const status = [];
    for (const [id, entry] of this._pool.entries()) {
      status.push({ serverId: id, state: entry.state, idleSecs: Math.floor((Date.now() - entry.lastUsedAt) / 1000) });
    }
    return status;
  }
}

module.exports = new McpConnectionPool();
