'use strict';

// Talks to the mcp-runner sidecar - the isolated container that spawns stdio
// external MCP servers and installs their packages, so the main server never
// needs child_process access to arbitrary user-configured commands and never
// shares its own secrets (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY) with
// whatever gets spawned. Everything here is a no-op / not-enabled when
// MCP_RUNNER_URL isn't set, which is the deployment mode for a bare
// `npm install -g mcp-depot` host install that has no container boundary to
// protect and shouldn't be forced into this extra complexity.
const logger = require('./logger');

function isEnabled() {
  return !!process.env.MCP_RUNNER_URL;
}

function baseUrl() {
  return (process.env.MCP_RUNNER_URL || '').replace(/\/+$/, '');
}

function authHeaders() {
  const token = process.env.MCP_RUNNER_TOKEN;
  return token ? { 'X-Runner-Token': token } : {};
}

// WebSocketClientTransport (from the SDK) calls `new WebSocket(...)` against
// the *global* WebSocket - stable in Node only from v22.4+, but the server
// image is pinned to node:20-alpine. Applied lazily (not as a require()-time
// side effect) so tests can toggle MCP_RUNNER_URL freely without caring
// about module load order.
function ensureWebSocketGlobal() {
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = require('ws');
  }
}

function buildWsUrl(serverId) {
  const url = new URL(baseUrl());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/spawn/${encodeURIComponent(serverId)}`;
  const token = process.env.MCP_RUNNER_TOKEN;
  if (token) url.searchParams.set('token', token);
  return url;
}

async function registerServer({ serverId, command, args, env }) {
  const res = await fetch(`${baseUrl()}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ serverId, command, args, env })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `mcp-runner /register failed with status ${res.status}`);
  }
  return res.json();
}

async function unregisterServer(serverId) {
  try {
    await fetch(`${baseUrl()}/register/${encodeURIComponent(serverId)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
  } catch (err) {
    logger.warn({ serverId, err: err.message }, 'Failed to unregister server from mcp-runner (non-fatal - it will just sit unused there)');
  }
}

async function installPackage({ packageName, runtime }) {
  const res = await fetch(`${baseUrl()}/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ packageName, runtime })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `mcp-runner /install failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

module.exports = { isEnabled, buildWsUrl, ensureWebSocketGlobal, registerServer, unregisterServer, installPackage };
