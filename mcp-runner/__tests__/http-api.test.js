const request = require('supertest');
const express = require('express');

jest.mock('child_process', () => ({
  execSync: jest.fn(() => ''),
  spawn: jest.fn(() => {
    const proc = new (require('events').EventEmitter)();
    proc.stdout = new (require('events').EventEmitter)();
    proc.stderr = new (require('events').EventEmitter)();
    proc.kill = jest.fn();
    process.nextTick(() => proc.emit('close', 0));
    return proc;
  })
}));

const httpApi = require('../src/http-api');
const serverRegistry = require('../src/server-registry');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', httpApi);
  return app;
}

describe('POST /register', () => {
  afterEach(() => {
    delete process.env.MCP_RUNNER_TOKEN;
    serverRegistry.unregister('srv-1');
  });

  test('accepts a valid registration and stores it', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .send({ serverId: 'srv-1', command: 'node', args: ['/app/x.js'], env: { FOO: 'bar' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(serverRegistry.get('srv-1')).toEqual({ command: 'node', args: ['/app/x.js'], env: { FOO: 'bar' } });
  });

  test('rejects a command not in the allowlist', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .send({ serverId: 'srv-1', command: 'bash', args: [] });
    expect(res.status).toBe(400);
  });

  test('rejects a missing serverId', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .send({ command: 'node', args: [] });
    expect(res.status).toBe(400);
  });

  test('when MCP_RUNNER_TOKEN is set, a request without the header is rejected', async () => {
    process.env.MCP_RUNNER_TOKEN = 'secret-token';
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .send({ serverId: 'srv-1', command: 'node', args: [] });
    expect(res.status).toBe(401);
  });

  test('when MCP_RUNNER_TOKEN is set, the correct header is accepted', async () => {
    process.env.MCP_RUNNER_TOKEN = 'secret-token';
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .set('X-Runner-Token', 'secret-token')
      .send({ serverId: 'srv-1', command: 'node', args: [] });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /register/:serverId', () => {
  test('unregisters a previously registered server', async () => {
    const app = buildApp();
    serverRegistry.register('srv-1', { command: 'node', args: [], env: {} });
    const res = await request(app).delete('/register/srv-1');
    expect(res.status).toBe(200);
    expect(serverRegistry.get('srv-1')).toBeUndefined();
  });
});

describe('POST /install', () => {
  test('installs a node package and returns the same shape the original route used', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/install')
      .send({ packageName: 'some-mcp-server', runtime: 'node' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Successfully installed some-mcp-server' });
  });

  test('rejects an invalid package name format', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/install')
      .send({ packageName: '../../etc/passwd', runtime: 'node' });
    expect(res.status).toBe(400);
  });

  test('rejects a missing packageName', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/install')
      .send({ runtime: 'node' });
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  test('returns ok with the current registered count', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.registered).toBe('number');
  });
});
