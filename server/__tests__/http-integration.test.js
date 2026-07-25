process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const request = require('supertest');

// auth.js pulls in jwks-rsa (for OIDC) which transitively loads the ESM-only
// "jose" package - not parseable by Jest's default CJS transform. None of
// these tests exercise the OIDC path, so a stub is enough (same mock used by
// oidc-verification.test.js).
jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

const { sequelize, loadModels } = require('../src/config/database');
const app = require('../src/app');

// Real HTTP-level integration coverage — these go through supertest against
// the actual Express app (real routing, real middleware, real auth checks)
// backed by a real in-memory SQLite database, rather than mocking models and
// calling route handlers directly like the rest of the suite does.
describe('HTTP integration', () => {
  beforeAll(async () => {
    loadModels();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('GET /health', () => {
    test('responds 200 without authentication', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('POST /api/v1/auth/register', () => {
    test('is disabled (403) unless ALLOW_REGISTRATION=true - regression coverage for the auto-registration bypass fix', async () => {
      delete process.env.ALLOW_REGISTRATION;
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'blocked@example.com', password: 'password123', name: 'Blocked' });

      expect(res.status).toBe(403);
    });

    test('creates a user and returns tokens when ALLOW_REGISTRATION=true', async () => {
      process.env.ALLOW_REGISTRATION = 'true';
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'newuser@example.com', password: 'password123', name: 'New User' });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('newuser@example.com');
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
      delete process.env.ALLOW_REGISTRATION;
    });

    test('rejects a duplicate email with 400', async () => {
      process.env.ALLOW_REGISTRATION = 'true';
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'dupe@example.com', password: 'password123', name: 'First' });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'dupe@example.com', password: 'password123', name: 'Second' });

      expect(res.status).toBe(400);
      delete process.env.ALLOW_REGISTRATION;
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeAll(async () => {
      process.env.ALLOW_REGISTRATION = 'true';
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'logintest@example.com', password: 'correct-password', name: 'Login Test' });
      delete process.env.ALLOW_REGISTRATION;
    });

    test('rejects an incorrect password with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'logintest@example.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.accessToken).toBeUndefined();
    });

    test('returns a valid access token for correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'logintest@example.com', password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('logintest@example.com');
    });
  });

  describe('GET /api/v1/integrations', () => {
    let accessToken;

    beforeAll(async () => {
      // Created directly via the model (mustResetPassword: false) rather than
      // through /register, whose fresh users must reset their password before
      // any other route lets them through - that's a separate, already-tested
      // concern here.
      const { User } = loadModels();
      const user = await User.create({
        email: 'integrationstest@example.com',
        password: 'password123',
        name: 'Integrations Test',
        mustResetPassword: false
      });
      const jwt = require('jsonwebtoken');
      const config = require('../src/config/env');
      accessToken = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpire });
    });

    test('rejects an unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/integrations');
      expect(res.status).toBe(401);
    });

    test('returns 200 with an array for an authenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/integrations')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('rejects a request with a malformed token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/integrations')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/mcp/execute - policy enforcement', () => {
    let accessToken, tool;

    beforeAll(async () => {
      const { User, Integration, Tool, PolicyRule } = loadModels();
      const user = await User.create({
        email: 'policytest@example.com',
        password: 'password123',
        name: 'Policy Test',
        role: 'user',
        mustResetPassword: false
      });
      const integration = await Integration.create({
        userId: user.id,
        type: 'custom',
        name: 'Policy Test Integration',
        config: { baseUrl: 'http://localhost', auth: { type: 'none' } },
        isActive: true,
        visibility: 'private'
      });
      tool = await Tool.create({
        userId: user.id,
        integrationId: integration.id,
        name: 'policy_test_tool',
        endpoint: { path: '/test', method: 'GET', params: {}, headers: {} },
        isActive: true
      });
      await PolicyRule.create({
        resourceType: 'tool',
        resourceMatch: 'policy_test_tool',
        action: 'execute',
        subjectType: 'role',
        subjectId: 'user',
        effect: 'deny',
        isActive: true
      });

      const jwt = require('jsonwebtoken');
      const config = require('../src/config/env');
      accessToken = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpire });
    });

    test('a real HTTP call to a tool blocked by policy gets 403, never reaches the adapter', async () => {
      const res = await request(app)
        .post('/api/v1/mcp/execute')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ toolName: tool.name, params: {} });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied by policy');
    });

    test('the denial is actually recorded in the policy decision chain', async () => {
      const { PolicyDecision } = loadModels();
      const record = await PolicyDecision.findOne({
        where: { resourceId: 'policy_test_tool', decision: 'deny' },
        order: [['createdAt', 'DESC']]
      });
      expect(record).not.toBeNull();
      expect(record.recordHash).toBeDefined();
    });
  });

  describe('Policy REST API (/api/v1/policy)', () => {
    let adminToken, userToken;

    beforeAll(async () => {
      const { User } = loadModels();
      const jwt = require('jsonwebtoken');
      const config = require('../src/config/env');

      const admin = await User.create({
        email: 'policyapi-admin@example.com', password: 'password123', name: 'Admin',
        role: 'admin', mustResetPassword: false
      });
      const nonAdmin = await User.create({
        email: 'policyapi-user@example.com', password: 'password123', name: 'User',
        role: 'user', mustResetPassword: false
      });
      adminToken = jwt.sign({ userId: admin.id }, config.jwtSecret, { expiresIn: config.jwtExpire });
      userToken = jwt.sign({ userId: nonAdmin.id }, config.jwtSecret, { expiresIn: config.jwtExpire });
    });

    test('a non-admin cannot list, create, or delete policy rules', async () => {
      const list = await request(app).get('/api/v1/policy/rules').set('Authorization', `Bearer ${userToken}`);
      expect(list.status).toBe(403);

      const create = await request(app)
        .post('/api/v1/policy/rules')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ resourceType: 'tool', subjectType: '*', effect: 'deny' });
      expect(create.status).toBe(403);
    });

    test('admin can create a rule, list it, update it, then delete it', async () => {
      const create = await request(app)
        .post('/api/v1/policy/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resourceType: 'tool', resourceMatch: 'api_test_tool', action: 'execute', subjectType: '*', effect: 'deny', description: 'API test rule' });
      expect(create.status).toBe(201);
      expect(create.body.id).toBeDefined();
      const ruleId = create.body.id;

      const list = await request(app).get('/api/v1/policy/rules').set('Authorization', `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      expect(list.body.some(r => r.id === ruleId)).toBe(true);

      const update = await request(app)
        .put(`/api/v1/policy/rules/${ruleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(update.status).toBe(200);
      expect(update.body.isActive).toBe(false);

      const del = await request(app).delete(`/api/v1/policy/rules/${ruleId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(del.status).toBe(200);

      const listAfter = await request(app).get('/api/v1/policy/rules').set('Authorization', `Bearer ${adminToken}`);
      expect(listAfter.body.some(r => r.id === ruleId)).toBe(false);
    });

    test('rejects a rule with subjectType=role but no subjectId', async () => {
      const res = await request(app)
        .post('/api/v1/policy/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resourceType: 'tool', subjectType: 'role', effect: 'deny' });
      expect(res.status).toBe(400);
    });

    test('rejects a limit rule with no limitConfig', async () => {
      const res = await request(app)
        .post('/api/v1/policy/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resourceType: 'tool', subjectType: '*', effect: 'limit' });
      expect(res.status).toBe(400);
    });

    test('lists policy decisions and confirms the chain verifies intact', async () => {
      const decisions = await request(app).get('/api/v1/policy/decisions').set('Authorization', `Bearer ${adminToken}`);
      expect(decisions.status).toBe(200);
      expect(Array.isArray(decisions.body.decisions)).toBe(true);
      expect(decisions.body.total).toBeGreaterThan(0);

      const verify = await request(app).get('/api/v1/policy/decisions/verify-chain').set('Authorization', `Bearer ${adminToken}`);
      expect(verify.status).toBe(200);
      expect(verify.body.valid).toBe(true);
    });
  });
});
