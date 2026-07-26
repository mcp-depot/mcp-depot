const { spawn } = require('child_process');
const { LineFramer } = require('./line-framer');
const processRegistry = require('./process-registry');
const logger = require('./logger');

// Bridges one WebSocket connection to one spawned child process for its
// entire lifetime. Message framing matches the MCP SDK's stdio convention
// (see line-framer.js) on the child's side; on the WS side, one full
// JSON-RPC message per frame (matching WebSocketClientTransport, which the
// main server uses unmodified on its end - see mcp-connection-pool.js).
//
// Two failure directions both need to end the connection cleanly, or a
// pending client.request() on the main server hangs forever (the SDK's
// Protocol layer only rejects in-flight requests when the transport's
// onclose actually fires - see dist/cjs/shared/protocol.js):
//   - the child dies unexpectedly -> close the WS
//   - the WS closes (client done, or network drop) -> kill the child
function bridgeSpawn(ws, { command, args, env }, meta = {}) {
  const child = spawn(command, args || [], {
    env: { ...process.env, ...(env || {}) },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  processRegistry.track(child);

  const framer = new LineFramer();
  let closed = false;

  const closeWithChild = (code, reason) => {
    if (closed) return;
    closed = true;
    try {
      if (!child.killed) child.kill('SIGTERM');
    } catch (e) {
      // ignore
    }
    try {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        ws.close(code, reason);
      }
    } catch (e) {
      // ignore
    }
  };

  child.stdout.on('data', (chunk) => {
    framer.append(chunk);
    for (const { message, error, line } of framer.readMessages()) {
      if (error) {
        logger.warn({ ...meta, err: error.message, line }, 'Dropping malformed line from spawned process stdout');
        continue;
      }
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    logger.debug({ ...meta, command, stderr: chunk.toString().slice(0, 500) }, 'spawned process stderr');
  });

  child.on('exit', (exitCode, signal) => {
    logger.info({ ...meta, command, exitCode, signal }, 'Spawned process exited');
    closeWithChild(1011, `spawned process exited (code=${exitCode}, signal=${signal})`.slice(0, 123));
  });

  child.on('error', (err) => {
    logger.error({ ...meta, command, err: err.message }, 'Failed to spawn process');
    closeWithChild(1011, `failed to spawn: ${err.message}`.slice(0, 123));
  });

  ws.on('message', (data) => {
    if (child.killed || !child.stdin.writable) return;
    let parsed;
    try {
      parsed = JSON.parse(data.toString());
    } catch (err) {
      logger.warn({ ...meta, err: err.message }, 'Dropping malformed WS message, not valid JSON');
      return;
    }
    child.stdin.write(JSON.stringify(parsed) + '\n');
  });

  ws.on('close', () => {
    closeWithChild(1000, 'client closed connection');
  });

  ws.on('error', (err) => {
    logger.warn({ ...meta, err: err.message }, 'WebSocket error, terminating spawned process');
    closeWithChild(1011, 'websocket error');
  });
}

module.exports = { bridgeSpawn };
