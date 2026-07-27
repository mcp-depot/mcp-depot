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

jest.mock('../src/adapters', () => ({
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: { ok: true }, headers: {} })
  }))
}));

const { sequelize, loadModels } = require('../src/config/database');
const app = require('../src/app');

let Integration, Tool, User;
let ownerToken, otherToken, adminToken;
let privateToolId, sharedToolId;

const signIn = (userId) => {
  const jwt = require('jsonwebtoken');
  const config = require('../src/config/env');
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
};

beforeAll(async () => {
  const models = loadModels();
  Integration = models.Integration;
  Tool = models.Tool;
  User = models.User;
  await sequelize.sync({ force: true });

  const owner = await User.create({ email: 'exec-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
  const other = await User.create({ email: 'exec-other@test.com', password: 'password123', name: 'Other', role: 'user', mustResetPassword: false });
  const admin = await User.create({ email: 'exec-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
  ownerToken = signIn(owner.id);
  otherToken = signIn(other.id);
  adminToken = signIn(admin.id);

  const privateIntegration = await Integration.create({
    userId: owner.id, type: 'custom', name: 'REST Private Integration',
    config: { baseUrl: 'http://example.com', auth: { type: 'none' } }, isActive: true, visibility: 'private'
  });
  const privateTool = await Tool.create({
    userId: owner.id, integrationId: privateIntegration.id, name: 'rest-private-tool',
    endpoint: { path: '/x', method: 'GET' }, isActive: true
  });
  privateToolId = privateTool.id;

  const sharedIntegration = await Integration.create({
    userId: owner.id, type: 'custom', name: 'REST Shared Integration',
    config: { baseUrl: 'http://example.com', auth: { type: 'none' } }, isActive: true, visibility: 'shared'
  });
  const sharedTool = await Tool.create({
    userId: owner.id, integrationId: sharedIntegration.id, name: 'rest-shared-tool',
    endpoint: { path: '/y', method: 'GET' }, isActive: true
  });
  sharedToolId = sharedTool.id;
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/mcp/execute - simple tool branch enforces ownership (mirrors routes/consume.js)', () => {
  test('the owner can execute their own private tool', async () => {
    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ toolId: privateToolId, params: {} });
    expect(res.status).toBe(200);
  });

  test('a different, non-admin user cannot execute someone else\'s private tool', async () => {
    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ toolId: privateToolId, params: {} });
    expect(res.status).toBe(403);
  });

  test('an admin can execute any user\'s private tool', async () => {
    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toolId: privateToolId, params: {} });
    expect(res.status).toBe(200);
  });

  test('anyone can execute a tool on a shared integration', async () => {
    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ toolId: sharedToolId, params: {} });
    expect(res.status).toBe(200);
  });
});
