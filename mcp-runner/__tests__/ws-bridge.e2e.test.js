// Genuine integration test - a real http.Server, a real spawned Node process
// (__tests__/fixtures/echo-server.js), and a real `ws` client, no mocks. This
// is the one piece that can't be meaningfully unit-tested: the whole point of
// this file is proving stdout/stdin actually get bridged to WebSocket frames
// correctly end to end. No Docker required - this runs directly under Jest.
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { attachWsBridge } = require('../src/ws-bridge');
const serverRegistry = require('../src/server-registry');

let server;
let port;

beforeAll((done) => {
  server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  attachWsBridge(server);
  server.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

afterEach(() => {
  serverRegistry.unregister('echo-test');
});

// Polls instead of a single fixed setTimeout, since how long SIGTERM takes to
// actually reap the child can vary - and waits for the real 'exit' event, not
// just 'close', so this test can't leak state into whatever runs after it.
async function waitForActiveCount(processRegistry, expected, timeoutMs = 5000) {
  const start = Date.now();
  while (processRegistry.getActiveCount() !== expected) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for active process count to reach ${expected}, still ${processRegistry.getActiveCount()}`);
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

test('a registered stdio server bridges a full request/response round trip over WebSocket', async () => {
  serverRegistry.register('echo-test', {
    command: 'node',
    args: [path.join(__dirname, 'fixtures', 'echo-server.js')],
    env: {}
  });

  const ws = new WebSocket(`ws://localhost:${port}/spawn/echo-test`);
  const processRegistry = require('../src/process-registry');
  const before = processRegistry.getActiveCount();

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'ping', params: { hello: 'world' } }));
    });
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      expect(message).toEqual({ jsonrpc: '2.0', id: 42, result: { echoed: { hello: 'world' } } });
      ws.close();
    });
    ws.on('close', resolve);
    ws.on('error', reject);
  });

  // Wait for the spawned process to actually be reaped before finishing,
  // so this test doesn't leak an in-flight process into whatever runs next.
  await waitForActiveCount(processRegistry, before);
}, 15000);

test('closing the WebSocket terminates the spawned process (no orphaned processes)', async () => {
  serverRegistry.register('echo-test', {
    command: 'node',
    args: [path.join(__dirname, 'fixtures', 'echo-server.js')],
    env: {}
  });

  const processRegistry = require('../src/process-registry');
  const before = processRegistry.getActiveCount();

  const ws = new WebSocket(`ws://localhost:${port}/spawn/echo-test`);

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      expect(processRegistry.getActiveCount()).toBe(before + 1);
      ws.close();
    });
    ws.on('close', resolve);
    ws.on('error', reject);
  });

  await waitForActiveCount(processRegistry, before);
}, 15000);

test('an unregistered serverId is rejected at the HTTP-upgrade handshake, not accepted then closed', (done) => {
  const ws = new WebSocket(`ws://localhost:${port}/spawn/never-registered-id`);

  ws.on('open', () => {
    done(new Error('Expected the handshake to be rejected, but it succeeded'));
  });

  ws.on('unexpected-response', (req, res) => {
    expect(res.statusCode).toBe(404);
    done();
  });

  ws.on('error', () => {
    // Some environments surface this as a generic error instead of
    // 'unexpected-response' - either is acceptable as long as it never opens.
  });
}, 15000);

test('an unknown path (not matching /spawn/:id) is rejected with 404', (done) => {
  const ws = new WebSocket(`ws://localhost:${port}/not-a-real-path`);

  ws.on('open', () => {
    done(new Error('Expected the handshake to be rejected, but it succeeded'));
  });

  ws.on('unexpected-response', (req, res) => {
    expect(res.statusCode).toBe(404);
    done();
  });

  ws.on('error', () => {});
}, 15000);

describe('MCP_RUNNER_TOKEN enforcement on the WS handshake', () => {
  afterEach(() => {
    delete process.env.MCP_RUNNER_TOKEN;
  });

  test('rejects a connection with no token when one is required', (done) => {
    process.env.MCP_RUNNER_TOKEN = 'secret-token';
    serverRegistry.register('echo-test', { command: 'node', args: [path.join(__dirname, 'fixtures', 'echo-server.js')], env: {} });

    const ws = new WebSocket(`ws://localhost:${port}/spawn/echo-test`);
    ws.on('open', () => done(new Error('Expected rejection, but connection opened')));
    ws.on('unexpected-response', (req, res) => {
      expect(res.statusCode).toBe(401);
      done();
    });
    ws.on('error', () => {});
  }, 15000);

  test('accepts a connection with the correct token', (done) => {
    process.env.MCP_RUNNER_TOKEN = 'secret-token';
    serverRegistry.register('echo-test', { command: 'node', args: [path.join(__dirname, 'fixtures', 'echo-server.js')], env: {} });

    const ws = new WebSocket(`ws://localhost:${port}/spawn/echo-test?token=secret-token`);
    ws.on('open', () => {
      ws.close();
      done();
    });
    ws.on('error', (err) => done(err));
  }, 15000);
});
