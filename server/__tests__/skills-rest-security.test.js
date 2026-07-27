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

const { sequelize, loadModels } = require('../src/config/database');
const app = require('../src/app');

let PromptLibrary, User, PolicyRule;
let ownerToken, otherToken, adminToken;
let privateSkill, sharedSkill;

const signIn = (userId) => {
  const jwt = require('jsonwebtoken');
  const config = require('../src/config/env');
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
};

beforeAll(async () => {
  const models = loadModels();
  PromptLibrary = models.PromptLibrary;
  User = models.User;
  PolicyRule = models.PolicyRule;
  await sequelize.sync({ force: true });

  const owner = await User.create({ email: 'rest-skill-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
  const other = await User.create({ email: 'rest-skill-other@test.com', password: 'password123', name: 'Other', role: 'user', mustResetPassword: false });
  const admin = await User.create({ email: 'rest-skill-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
  ownerToken = signIn(owner.id);
  otherToken = signIn(other.id);
  adminToken = signIn(admin.id);

  privateSkill = await PromptLibrary.create({
    userId: owner.id, name: 'private-rest-skill', description: 'private', prompt: 'secret content', isShared: false
  });
  sharedSkill = await PromptLibrary.create({
    userId: owner.id, name: 'shared-rest-skill', description: 'shared', prompt: 'shared content', isShared: true
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/mcp/skills - scoped to owner/shared, not world-readable', () => {
  test('the owner sees both their private and shared skills', async () => {
    const res = await request(app).get('/api/v1/mcp/skills').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const names = res.body.skills.map(s => s.name);
    expect(names).toContain('private-rest-skill');
    expect(names).toContain('shared-rest-skill');
  });

  test('a different, non-admin user sees only the shared skill', async () => {
    const res = await request(app).get('/api/v1/mcp/skills').set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    const names = res.body.skills.map(s => s.name);
    expect(names).not.toContain('private-rest-skill');
    expect(names).toContain('shared-rest-skill');
  });

  test('an admin sees every skill', async () => {
    const res = await request(app).get('/api/v1/mcp/skills').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.skills.map(s => s.name);
    expect(names).toContain('private-rest-skill');
  });
});

describe('GET /api/v1/mcp/skills/:name - full prompt content is not world-readable', () => {
  test('the owner can fetch their private skill\'s full content', async () => {
    const res = await request(app).get('/api/v1/mcp/skills/private-rest-skill').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('secret content');
  });

  test('a different, non-admin user gets 404 for someone else\'s private skill (no existence leak)', async () => {
    const res = await request(app).get('/api/v1/mcp/skills/private-rest-skill').set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  test('anyone can fetch a shared skill\'s content', async () => {
    const res = await request(app).get('/api/v1/mcp/skills/shared-rest-skill').set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('shared content');
  });
});

describe('POST /api/v1/mcp/skills/invoke/:id - ownership- and policy-gated', () => {
  test('the owner can invoke their own private skill', async () => {
    const res = await request(app)
      .post(`/api/v1/mcp/skills/invoke/${privateSkill.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ inputs: {} });
    expect(res.status).toBe(200);
  });

  test('a different, non-admin user cannot invoke someone else\'s private skill', async () => {
    const res = await request(app)
      .post(`/api/v1/mcp/skills/invoke/${privateSkill.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ inputs: {} });
    expect(res.status).toBe(404);
  });

  test('a policy deny rule targeting this skill blocks even the owner', async () => {
    const mcpServer = require('../src/mcp/server');
    const skillToolName = 'skill_' + mcpServer.sanitizeToolName(sharedSkill.name);
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: skillToolName, action: 'execute',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: true,
      description: 'test: block this skill via REST invoke'
    });

    const res = await request(app)
      .post(`/api/v1/mcp/skills/invoke/${sharedSkill.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ inputs: {} });
    expect(res.status).toBe(403);

    await PolicyRule.destroy({ where: { resourceMatch: skillToolName } });
  });
});
