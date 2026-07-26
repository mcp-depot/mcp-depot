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

// The real pool would try to open an actual MCP connection - mock it so
// these tests exercise only the ownership/policy logic in the route.
jest.mock('../src/services/mcp-connection-pool', () => ({
  callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'external tool result' }] }),
  listTools: jest.fn().mockResolvedValue([{ name: 'do-thing', description: 'does the thing' }])
}));

const { sequelize, loadModels } = require('../src/config/database');
const app = require('../src/app');

let ExternalMcpServer, ExternalMcpTool, User, PolicyRule;
let ownerAToken, ownerBToken, adminToken;
let server, toolId;

const signIn = (userId) => {
  const jwt = require('jsonwebtoken');
  const config = require('../src/config/env');
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
};

beforeAll(async () => {
  const models = loadModels();
  ExternalMcpServer = models.ExternalMcpServer;
  ExternalMcpTool = models.ExternalMcpTool;
  User = models.User;
  PolicyRule = models.PolicyRule;
  await sequelize.sync({ force: true });

  const ownerA = await User.create({ email: 'ext-owner-a@test.com', password: 'password123', name: 'Owner A', role: 'user', mustResetPassword: false });
  const ownerB = await User.create({ email: 'ext-owner-b@test.com', password: 'password123', name: 'Owner B', role: 'user', mustResetPassword: false });
  const admin = await User.create({ email: 'ext-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
  ownerAToken = signIn(ownerA.id);
  ownerBToken = signIn(ownerB.id);
  adminToken = signIn(admin.id);

  server = await ExternalMcpServer.create({
    userId: ownerA.id, name: 'Owner A Jira MCP', transportType: 'http',
    url: 'https://jira-mcp.example.com/mcp', authType: 'none', isActive: true
  });
  await ExternalMcpTool.create({
    externalMcpServerId: server.id, toolName: 'do-thing',
    namespacedName: 'Owner_A_Jira_MCP__do-thing', description: 'does the thing', isActive: true
  });
  toolId = `external-${server.id}-do-thing`;
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/mcp/tools - external MCP servers are scoped per-owner', () => {
  test("the owner sees their own external server's tools", async () => {
    const res = await request(app).get('/api/v1/mcp/tools').set('Authorization', `Bearer ${ownerAToken}`);
    expect(res.status).toBe(200);
    const names = res.body.tools.map(t => t.name);
    expect(names).toContain('Owner_A_Jira_MCP__do-thing');
  });

  test('a different, non-admin user does NOT see it', async () => {
    const res = await request(app).get('/api/v1/mcp/tools').set('Authorization', `Bearer ${ownerBToken}`);
    expect(res.status).toBe(200);
    const names = res.body.tools.map(t => t.name);
    expect(names).not.toContain('Owner_A_Jira_MCP__do-thing');
  });

  test('an admin sees every user\'s external server tools', async () => {
    const res = await request(app).get('/api/v1/mcp/tools').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.tools.map(t => t.name);
    expect(names).toContain('Owner_A_Jira_MCP__do-thing');
  });
});

describe('POST /api/v1/mcp/execute - external tool calls are ownership- and policy-gated', () => {
  test('the owner can call their own external tool', async () => {
    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ toolId, params: {} });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('external');
  });

  test('a different, non-admin user cannot call someone else\'s external tool (404, not 403 - no existence leak)', async () => {
    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ toolId, params: {} });
    expect(res.status).toBe(404);
  });

  test('an admin can call any user\'s external tool', async () => {
    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toolId, params: {} });
    expect(res.status).toBe(200);
  });

  test('a policy deny rule targeting this exact external tool blocks even the owner - proves the policy gate is real, not skipped', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: toolId, action: 'execute',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: true,
      description: 'test: block this external tool'
    });

    const res = await request(app)
      .post('/api/v1/mcp/execute')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ toolId, params: {} });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied by policy');

    await PolicyRule.destroy({ where: { resourceMatch: toolId } });
  });
});
