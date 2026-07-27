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

const { sequelize, loadModels, createDefaultPolicyRules, protectBuiltInIntegrations } = require('../src/config/database');
const { isBuiltInIntegration, BUILT_IN_INTEGRATION_NAMES } = require('../src/utils/builtInIntegrations');
const app = require('../src/app');

// Single sync/close for the whole file - sequelize is a shared singleton,
// so each describe below only loads its own fixtures in beforeAll (with an
// explicit truncate where a describe needs an exact count), not a
// competing sync({force:true})/close() pair on the same connection.
beforeAll(async () => {
  loadModels();
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('isBuiltInIntegration (pure function)', () => {
  test('matches by name regardless of metadata', () => {
    expect(isBuiltInIntegration({ name: 'MCP Depot', metadata: {} })).toBe(true);
    expect(isBuiltInIntegration({ name: 'MCP Depot Sessions', metadata: null })).toBe(true);
    expect(isBuiltInIntegration({ name: 'MCP Depot Agents' })).toBe(true);
  });

  test('also matches via the metadata flag, for anything named differently', () => {
    expect(isBuiltInIntegration({ name: 'Some Custom Name', metadata: { source: 'built-in' } })).toBe(true);
  });

  test('a regular integration is not built-in', () => {
    expect(isBuiltInIntegration({ name: 'Jira Prod', metadata: {} })).toBe(false);
  });

  test('handles a missing integration gracefully', () => {
    expect(isBuiltInIntegration(null)).toBe(false);
    expect(isBuiltInIntegration(undefined)).toBe(false);
  });
});

describe('Built-in integration protection (HTTP)', () => {
  let Integration, PolicyRule;
  let ownerToken, adminToken, ownerId;
  let builtInIntegration, regularIntegration;

  const signIn = (userId) => {
    const jwt = require('jsonwebtoken');
    const config = require('../src/config/env');
    return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
  };

  beforeAll(async () => {
    const models = loadModels();
    const { User } = models;
    Integration = models.Integration;
    PolicyRule = models.PolicyRule;
    await createDefaultPolicyRules();

    const owner = await User.create({ email: 'bi-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
    const admin = await User.create({ email: 'bi-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
    ownerId = owner.id;
    ownerToken = signIn(owner.id);
    adminToken = signIn(admin.id);

    builtInIntegration = await Integration.create({
      userId: owner.id, type: 'custom', name: 'MCP Depot',
      config: { baseUrl: 'http://localhost:3000', auth: { type: 'none' } },
      isActive: true, visibility: 'shared'
    });

    regularIntegration = await Integration.create({
      userId: owner.id, type: 'custom', name: 'Jira Prod',
      config: { baseUrl: 'http://jira.example.com', auth: { type: 'none' } },
      isActive: true, visibility: 'private'
    });
  });

  test('the owner cannot delete a built-in integration', async () => {
    const res = await request(app)
      .delete(`/api/v1/integrations/${builtInIntegration.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot be deleted/i);
  });

  test('the system admin ALSO cannot delete a built-in integration - unconditional, no bypass', async () => {
    const res = await request(app)
      .delete(`/api/v1/integrations/${builtInIntegration.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  test('renaming or reconfiguring a built-in integration is rejected', async () => {
    const rename = await request(app)
      .put(`/api/v1/integrations/${builtInIntegration.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Renamed' });
    expect(rename.status).toBe(403);

    const reconfig = await request(app)
      .put(`/api/v1/integrations/${builtInIntegration.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ config: { baseUrl: 'http://evil.example.com', auth: { type: 'none' } } });
    expect(reconfig.status).toBe(403);
  });

  test('toggling isActive on a built-in integration is still allowed - the sanctioned disable path', async () => {
    const res = await request(app)
      .put(`/api/v1/integrations/${builtInIntegration.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    await request(app).put(`/api/v1/integrations/${builtInIntegration.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ isActive: true });
  });

  test('tools cannot be added to a built-in integration', async () => {
    const res = await request(app)
      .post(`/api/v1/integrations/${builtInIntegration.id}/tools`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'evil_tool', endpoint: { path: '/x', method: 'GET' } });
    expect(res.status).toBe(403);
  });

  test('GET /integrations reports isBuiltIn: true for the built-in one, false for a regular one', async () => {
    const res = await request(app).get('/api/v1/integrations').set('Authorization', `Bearer ${ownerToken}`);
    const builtIn = res.body.find(i => i._id === builtInIntegration.id);
    const regular = res.body.find(i => i._id === regularIntegration.id);
    expect(builtIn.isBuiltIn).toBe(true);
    expect(regular.isBuiltIn).toBe(false);
  });

  test('a built-in integration is never attributed to a person, even though it is technically shared and not owned by the viewer', async () => {
    // adminToken is neither the owner nor the same account as the built-in
    // integration's userId, so isShared would be true for it under the
    // plain visibility check - it must still not show a "shared by" name.
    const res = await request(app).get('/api/v1/integrations').set('Authorization', `Bearer ${adminToken}`);
    const builtIn = res.body.find(i => i._id === builtInIntegration.id);
    expect(builtIn.sharedByName).toBeNull();
    expect(builtIn.sharedByEmail).toBeNull();
  });

  test('a regular (non-built-in) integration can still be deleted by its owner, unaffected', async () => {
    const toDelete = await Integration.create({
      userId: ownerId, type: 'custom', name: 'Disposable',
      config: { baseUrl: 'http://localhost', auth: { type: 'none' } }, isActive: true
    });
    const res = await request(app).delete(`/api/v1/integrations/${toDelete.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  test('a policy rule can now deny deletion of a specific regular integration too - the generalized, policy-editable layer', async () => {
    await PolicyRule.create({
      resourceType: 'integration', resourceMatch: regularIntegration.id, action: 'delete',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: true,
      description: 'protect this one specifically for this test'
    });

    const res = await request(app).delete(`/api/v1/integrations/${regularIntegration.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied by policy');
  });
});

describe('protectBuiltInIntegrations (seed function)', () => {
  let Integration, PolicyRule;
  let seededIntegrations = [];

  beforeAll(async () => {
    const models = loadModels();
    Integration = models.Integration;
    PolicyRule = models.PolicyRule;
    // Clean slate - this describe's assertions rely on exact counts, and
    // the previous describe already created its own 'MCP Depot' etc. rows.
    await PolicyRule.destroy({ where: {}, truncate: true, cascade: false });
    await Integration.destroy({ where: {}, truncate: true, cascade: false });

    const { User } = models;
    const admin = await User.create({ email: 'seed-admin@test.com', password: 'password123', name: 'Admin', role: 'admin' });

    for (const name of BUILT_IN_INTEGRATION_NAMES) {
      const integration = await Integration.create({
        userId: admin.id, type: 'custom', name,
        config: { baseUrl: 'http://localhost:3000', auth: { type: 'none' } }, isActive: true
      });
      seededIntegrations.push(integration);
    }
  });

  test('seeds one system-managed deny rule per built-in integration, keyed by its actual id', async () => {
    await protectBuiltInIntegrations();

    for (const integration of seededIntegrations) {
      const rule = await PolicyRule.findOne({
        where: { resourceType: 'integration', resourceMatch: integration.id, action: 'delete' }
      });
      expect(rule).not.toBeNull();
      expect(rule.effect).toBe('deny');
      expect(rule.isSystemManaged).toBe(true);
    }
  });

  test('is idempotent - calling it again does not duplicate rules', async () => {
    const before = await PolicyRule.count();
    await protectBuiltInIntegrations();
    await protectBuiltInIntegrations();
    const after = await PolicyRule.count();
    expect(after).toBe(before);
  });
});

describe('System-managed policy rules cannot be edited or deleted via the REST API', () => {
  let PolicyRule;
  let adminToken;
  let systemRule;

  beforeAll(async () => {
    const models = loadModels();
    PolicyRule = models.PolicyRule;

    const { User } = models;
    const admin = await User.create({ email: 'sysrule-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
    const jwt = require('jsonwebtoken');
    const config = require('../src/config/env');
    adminToken = jwt.sign({ userId: admin.id }, config.jwtSecret, { expiresIn: config.jwtExpire });

    systemRule = await PolicyRule.create({
      resourceType: 'integration', resourceMatch: 'some-id', action: 'delete',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: true, isSystemManaged: true,
      description: 'seeded protection for this test'
    });
  });

  test('PUT is rejected even for an admin', async () => {
    const res = await request(app)
      .put(`/api/v1/policy/rules/${systemRule.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  test('DELETE is rejected even for an admin', async () => {
    const res = await request(app)
      .delete(`/api/v1/policy/rules/${systemRule.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);

    const stillThere = await PolicyRule.findByPk(systemRule.id);
    expect(stillThere).not.toBeNull();
  });

  test('isSystemManaged is not a settable field through the create API at all (only the seed function may set it)', async () => {
    const res = await request(app)
      .post('/api/v1/policy/rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resourceType: 'integration', resourceMatch: '*', action: 'delete', subjectType: '*', effect: 'deny', isSystemManaged: true });
    expect(res.status).toBe(400);
  });
});
