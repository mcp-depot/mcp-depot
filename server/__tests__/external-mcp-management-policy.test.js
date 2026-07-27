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

const { sequelize, loadModels, createDefaultPolicyRules } = require('../src/config/database');
const app = require('../src/app');

let PolicyRule, User;
let ownerToken, otherToken, adminToken, otherUserId;

const signIn = (userId) => {
  const jwt = require('jsonwebtoken');
  const config = require('../src/config/env');
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
};

beforeAll(async () => {
  const models = loadModels();
  PolicyRule = models.PolicyRule;
  User = models.User;
  await sequelize.sync({ force: true });
  await createDefaultPolicyRules();

  const owner = await User.create({ email: 'ext-mgmt-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
  const other = await User.create({ email: 'ext-mgmt-other@test.com', password: 'password123', name: 'Other', role: 'user', mustResetPassword: false });
  const admin = await User.create({ email: 'ext-mgmt-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
  ownerToken = signIn(owner.id);
  otherToken = signIn(other.id);
  adminToken = signIn(admin.id);
  otherUserId = other.id;
}, 20000);

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/external-mcp - create is open by default (no seeded rule)', () => {
  test('a regular, non-admin user can self-service create an http server', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'http-server-1', transportType: 'http', url: 'https://example.com/mcp' });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/v1/external-mcp - configure_stdio is deny-unless-admin by default', () => {
  test('a regular, non-admin user cannot register a stdio server', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'stdio-server-1', transportType: 'stdio', command: 'node', args: '["/app/script.js"]' });
    expect(res.status).toBe(403);
  });

  test('an admin can register a stdio server', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'stdio-server-2', transportType: 'stdio', command: 'node', args: '["/app/script.js"]' });
    expect(res.status).toBe(201);
  });

  test('a policy rule can delegate configure_stdio to a specific non-admin user, without making them a full admin', async () => {
    await PolicyRule.create({
      resourceType: 'external_mcp_server', action: 'configure_stdio', resourceMatch: '*',
      subjectType: 'user', subjectId: otherUserId, effect: 'allow', isActive: true,
      description: 'test: delegate stdio to this one user'
    });

    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'stdio-server-3', transportType: 'stdio', command: 'node', args: '["/app/script.js"]' });
    expect(res.status).toBe(201);

    await PolicyRule.destroy({ where: { subjectId: otherUserId, action: 'configure_stdio' } });
  });
});

describe('PUT /api/v1/external-mcp/:id - reconfiguring to stdio is also policy-gated', () => {
  let httpServerId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'http-to-stdio', transportType: 'http', url: 'https://example.com/mcp' });
    httpServerId = res.body._id;
  });

  test('the owner cannot reconfigure their own server to stdio without admin/delegated rights', async () => {
    const res = await request(app)
      .put(`/api/v1/external-mcp/${httpServerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ transportType: 'stdio', command: 'node', args: '["/app/script.js"]' });
    expect(res.status).toBe(403);
  });

  test('an admin can reconfigure any server to stdio', async () => {
    const res = await request(app)
      .put(`/api/v1/external-mcp/${httpServerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transportType: 'stdio', command: 'node', args: '["/app/script.js"]' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/external-mcp/install - policy-gated (was requireAdmin middleware)', () => {
  test('a regular, non-admin user cannot install a package', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ packageName: 'some-mcp-server', runtime: 'node' });
    expect(res.status).toBe(403);
  });

  test('an admin can install a package', async () => {
    const res = await request(app)
      .post('/api/v1/external-mcp/install')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ packageName: 'some-mcp-server', runtime: 'node' });
    expect(res.status).toBe(200);
  });
});
