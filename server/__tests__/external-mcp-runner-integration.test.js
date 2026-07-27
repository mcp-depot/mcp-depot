process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const request = require('supertest');

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

jest.mock('../src/services/mcp-runner-client');
jest.mock('../src/services/mcp-connection-pool', () => ({
  getClient: jest.fn().mockResolvedValue({}),
  disconnect: jest.fn(),
  listTools: jest.fn().mockResolvedValue([]),
  callTool: jest.fn().mockResolvedValue({})
}));

// jest.spyOn on the child_process module object does NOT affect
// routes/external-mcp.js's `const { spawn, execSync } = require('child_process')`
// destructured bindings, captured at that file's own require() time - a
// module-level jest.mock (hoisted before any require() runs) is what
// actually intercepts those.
let mockSpawnImpl = null;
jest.mock('child_process', () => ({
  execSync: jest.fn(() => ''),
  spawn: jest.fn((...args) => {
    if (mockSpawnImpl) return mockSpawnImpl(...args);
    const proc = new (require('events').EventEmitter)();
    proc.stdout = new (require('events').EventEmitter)();
    proc.stderr = new (require('events').EventEmitter)();
    proc.kill = jest.fn();
    process.nextTick(() => proc.emit('close', 0));
    return proc;
  })
}));
const { spawn: mockSpawn } = require('child_process');

const { sequelize, loadModels, createDefaultPolicyRules } = require('../src/config/database');
const mcpRunnerClient = require('../src/services/mcp-runner-client');
const app = require('../src/app');

let adminToken;

const signIn = (userId) => {
  const jwt = require('jsonwebtoken');
  const config = require('../src/config/env');
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
};

beforeAll(async () => {
  const { User } = loadModels();
  await sequelize.sync({ force: true });
  await createDefaultPolicyRules();
  const admin = await User.create({ email: 'runner-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
  adminToken = signIn(admin.id);
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  mcpRunnerClient.registerServer.mockResolvedValue({ ok: true });
  mcpRunnerClient.unregisterServer.mockResolvedValue(undefined);
});

describe('MCP_RUNNER_URL unset - no runner calls happen at all', () => {
  beforeEach(() => {
    delete process.env.MCP_RUNNER_URL;
    mcpRunnerClient.isEnabled.mockReturnValue(false);
  });

  test('creating a stdio server does not call registerServer', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'no-runner-stdio', transportType: 'stdio', command: 'node', args: '["/app/x.js"]' });
    expect(res.status).toBe(201);
    expect(mcpRunnerClient.registerServer).not.toHaveBeenCalled();
  });

  test('installing a package does not call installPackage (falls through to local logic)', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ packageName: 'some-pkg', runtime: 'node' });

    expect(res.status).toBe(200);
    expect(mcpRunnerClient.installPackage).not.toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenCalled();
  });
});

describe('MCP_RUNNER_URL set - create/update/delete push config to the sidecar', () => {
  beforeEach(() => {
    process.env.MCP_RUNNER_URL = 'http://mcp-runner:9500';
    mcpRunnerClient.isEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    delete process.env.MCP_RUNNER_URL;
  });

  test('creating a stdio server eagerly registers it with the parsed args/env', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'runner-stdio-1', transportType: 'stdio', command: 'node', args: '["/app/x.js"]', env: '' });
    expect(res.status).toBe(201);

    await new Promise(r => setImmediate(r)); // let the fire-and-forget call run

    expect(mcpRunnerClient.registerServer).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: res.body._id, command: 'node', args: ['/app/x.js'] })
    );
  });

  test('creating an http server does not register anything with the sidecar (not stdio)', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'runner-http-1', transportType: 'http', url: 'https://example.com/mcp' });
    expect(res.status).toBe(201);
    await new Promise(r => setImmediate(r));
    expect(mcpRunnerClient.registerServer).not.toHaveBeenCalled();
  });

  test('updating a server to stdio re-registers it with the sidecar', async () => {
    const createRes = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'runner-update-target', transportType: 'http', url: 'https://example.com/mcp' });
    mcpRunnerClient.registerServer.mockClear();

    const res = await request(app)
      .put(`/api/v1/external-mcp/${createRes.body._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transportType: 'stdio', command: 'node', args: '["/app/y.js"]' });
    expect(res.status).toBe(200);
    await new Promise(r => setImmediate(r));

    expect(mcpRunnerClient.registerServer).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: createRes.body._id, command: 'node', args: ['/app/y.js'] })
    );
  });

  test('deleting a stdio server unregisters it from the sidecar', async () => {
    const createRes = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'runner-delete-target', transportType: 'stdio', command: 'node', args: '["/app/z.js"]' });

    const res = await request(app)
      .delete(`/api/v1/external-mcp/${createRes.body._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    expect(mcpRunnerClient.unregisterServer).toHaveBeenCalledWith(createRes.body._id);
  });

  test('deleting an http server does not call unregisterServer', async () => {
    const createRes = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'runner-delete-http', transportType: 'http', url: 'https://example.com/mcp' });

    await request(app)
      .delete(`/api/v1/external-mcp/${createRes.body._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(mcpRunnerClient.unregisterServer).not.toHaveBeenCalled();
  });
});

describe('MCP_RUNNER_URL set - POST /install proxies to the sidecar, response shape preserved', () => {
  beforeEach(() => {
    process.env.MCP_RUNNER_URL = 'http://mcp-runner:9500';
    mcpRunnerClient.isEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    delete process.env.MCP_RUNNER_URL;
  });

  test('a successful install proxies the sidecar\'s response verbatim', async () => {
    mcpRunnerClient.installPackage.mockResolvedValue({ success: true, message: 'Successfully installed some-pkg' });

    const res = await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ packageName: 'some-pkg', runtime: 'node' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Successfully installed some-pkg' });
    expect(mcpRunnerClient.installPackage).toHaveBeenCalledWith({ packageName: 'some-pkg', runtime: 'node' });
  });

  test('a failed install relays the sidecar\'s error and status code', async () => {
    const err = new Error('Failed to install package: some pip error');
    err.status = 500;
    mcpRunnerClient.installPackage.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ packageName: 'some-pkg', runtime: 'python' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to install package: some pip error' });
  });

  test('never falls through to local spawn when the sidecar is enabled', async () => {
    mockSpawn.mockClear();
    mcpRunnerClient.installPackage.mockResolvedValue({ success: true, message: 'ok' });

    await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ packageName: 'some-pkg', runtime: 'node' });

    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
