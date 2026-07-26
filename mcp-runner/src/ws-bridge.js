const { WebSocketServer } = require('ws');
const serverRegistry = require('./server-registry');
const { bridgeSpawn } = require('./spawn-bridge');
const logger = require('./logger');

function rejectUpgrade(socket, statusCode, statusMessage) {
  try {
    socket.write(`HTTP/1.1 ${statusCode} ${statusMessage}\r\nConnection: close\r\n\r\n`);
  } catch (e) {
    // ignore
  }
  socket.destroy();
}

// Rejecting at the HTTP-upgrade layer (raw status line, not accept-then-close)
// is deliberate: it's what lets an unregistered serverId surface to the main
// server as a client.connect() rejection with an inspectable status, rather
// than a silent post-open close indistinguishable from any other failure -
// see mcp-connection-pool.js's _connectStdioViaRunner for how that's used to
// decide when to re-register and retry.
function attachWsBridge(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://internal');
    } catch (e) {
      return rejectUpgrade(socket, 400, 'Bad Request');
    }

    const match = url.pathname.match(/^\/spawn\/([^/]+)$/);
    if (!match) {
      return rejectUpgrade(socket, 404, 'Not Found');
    }

    const requiredToken = process.env.MCP_RUNNER_TOKEN;
    if (requiredToken && url.searchParams.get('token') !== requiredToken) {
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }

    const serverId = decodeURIComponent(match[1]);
    const config = serverRegistry.get(serverId);
    if (!config) {
      logger.warn({ serverId }, 'Rejecting spawn request for unregistered serverId');
      return rejectUpgrade(socket, 404, 'Not Found');
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      logger.info({ serverId, command: config.command }, 'Spawning and bridging external MCP server');
      bridgeSpawn(ws, config, { serverId });
    });
  });

  return wss;
}

module.exports = { attachWsBridge };
