process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.MCP_PACKAGES_PATH = 'C:\\fake\\mcp-packages';
delete process.env.DATABASE_URL;

const request = require('supertest');
const path = require('path');
const { EventEmitter } = require('events');

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

let lastSpawnCall = null;
jest.mock('child_process', () => ({
  execSync: jest.fn(() => ''), // isCommandAvailable() - pretend npm/pip3 are on PATH
  spawn: jest.fn((cmd, args) => {
    lastSpawnCall = { cmd, args };
    const proc = new (require('events').EventEmitter)();
    proc.stdout = new (require('events').EventEmitter)();
    proc.stderr = new (require('events').EventEmitter)();
    proc.kill = jest.fn();
    // Resolve success on next tick, like a real short-lived install would.
    process.nextTick(() => proc.emit('close', 0));
    return proc;
  })
}));

const { sequelize, loadModels } = require('../src/config/database');
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
  const admin = await User.create({ email: 'install-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
  adminToken = signIn(admin.id);
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/external-mcp/install - targets MCP_PACKAGES_PATH, not the default global location', () => {
  test('a node package install passes --prefix pointing at MCP_PACKAGES_PATH/node', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ packageName: 'some-mcp-server', runtime: 'node' });

    expect(res.status).toBe(200);
    expect(lastSpawnCall.cmd).toBe('npm');
    expect(lastSpawnCall.args).toContain('--prefix');
    const prefixIdx = lastSpawnCall.args.indexOf('--prefix');
    expect(lastSpawnCall.args[prefixIdx + 1]).toBe(path.join('C:\\fake\\mcp-packages', 'node'));
  });

  test('a python package install passes --target pointing at MCP_PACKAGES_PATH/python', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ packageName: 'some-mcp-server', runtime: 'python' });

    expect(res.status).toBe(200);
    expect(lastSpawnCall.cmd).toBe('pip3');
    expect(lastSpawnCall.args).toContain('--target');
    const targetIdx = lastSpawnCall.args.indexOf('--target');
    expect(lastSpawnCall.args[targetIdx + 1]).toBe(path.join('C:\\fake\\mcp-packages', 'python'));
  });
});
