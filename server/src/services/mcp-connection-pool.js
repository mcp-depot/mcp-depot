'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
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

    const { client, transport } = await this._createClient(server);

    const entry = { client, transport, lastUsedAt: Date.now(), state: 'connecting', toolsHash: null, tools: [] };
    this._pool.set(server.id, entry);

    try {
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connect:${server.name}`);
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
    const { client, transport } = await this._createClient(server);
    try {
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connect:${server.name}`);
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
    const { client, transport } = await this._createClient(server);
    try {
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connect:${server.name}`);
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
