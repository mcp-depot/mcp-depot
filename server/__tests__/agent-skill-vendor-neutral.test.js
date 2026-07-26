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

let Agent, PromptLibrary, User;
let userToken, ownerId;

const signIn = (userId) => {
  const jwt = require('jsonwebtoken');
  const config = require('../src/config/env');
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
};

beforeAll(async () => {
  loadModels();
  await sequelize.sync({ force: true });

  const models = loadModels();
  Agent = models.Agent;
  PromptLibrary = models.PromptLibrary;
  User = models.User;

  const owner = await User.create({ email: 'agent-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
  ownerId = owner.id;
  userToken = signIn(owner.id);

  await Agent.create({
    name: 'test-reviewer', role: 'Reviewer', systemPrompt: 'You review code.',
    description: 'A test agent', tools: '["read", "grep"]', model: 'claude-opus-4-7',
    isShared: true, createdBy: ownerId
  });

  await PromptLibrary.create({
    userId: ownerId, name: 'test-skill', description: 'A test skill',
    prompt: 'Do the thing with {{input}}', inputs: [], isShared: true
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/agents/:name - vendor-neutral install config', () => {
  test('always returns the generic agent definition, ignoring clientType for formatting', async () => {
    const res = await request(app)
      .get('/api/v1/agents/test-reviewer')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.installConfig).toMatchObject({ clientType: 'generic' });
    expect(res.body.installConfig.agent.name).toBe('test-reviewer');
    expect(res.body.installConfig.agent.systemPrompt).toBe('You review code.');
    expect(res.body.installConfig.note).toMatch(/vendor-neutral/i);
    // No vendor-specific file path/content should ever be produced.
    expect(res.body.installConfig.installPath).toBeUndefined();
    expect(res.body.installConfig.content).toBeUndefined();
  });

  test('requesting clientType=opencode does not change the shape - no more guessing at OpenCode\'s file format', async () => {
    const res = await request(app)
      .get('/api/v1/agents/test-reviewer?clientType=opencode')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.installConfig.clientType).toBe('generic');
    expect(res.body.installConfig.installPath).toBeUndefined();
  });

  test('requesting clientType=claude-code also gets the same generic shape now, not a pre-rendered AGENT.md', async () => {
    const res = await request(app)
      .get('/api/v1/agents/test-reviewer?clientType=claude-code')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.installConfig.clientType).toBe('generic');
    expect(res.body.installConfig.installPath).toBeUndefined();
  });

  test('modelCompatibility is still computed per clientType - that is a legitimate, non-format concern', async () => {
    const res = await request(app)
      .get('/api/v1/agents/test-reviewer?clientType=opencode')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.modelCompatibility).toBeDefined();
    expect(res.body.modelCompatibility.compatible).toBe(false);
  });
});

describe('GET /api/v1/mcp/agents/:name - vendor-neutral install config (mirrors the REST route)', () => {
  test('always returns the generic agent definition regardless of clientType', async () => {
    const res = await request(app).get('/api/v1/mcp/agents/test-reviewer?clientType=opencode');
    expect(res.status).toBe(200);
    expect(res.body.installConfig).toMatchObject({ clientType: 'generic' });
    expect(res.body.installConfig.installPath).toBeUndefined();
    expect(res.body.installConfig.note).toMatch(/vendor-neutral/i);
  });
});

describe('GET /api/v1/mcp/skills/:name - leads with the universal MCP tool path', () => {
  test('returns the callable MCP tool name instead of unconditionally pushing SKILL.md', async () => {
    const res = await request(app).get('/api/v1/mcp/skills/test-skill');
    expect(res.status).toBe(200);
    expect(res.body.usage).toBeDefined();
    expect(res.body.usage.mcpTool).toBe('skill_test-skill');
    expect(res.body.usage.note).toMatch(/MCP tool/i);
    // The old unconditional Claude-specific convention should no longer be
    // presented as the (only) way to use the skill.
    expect(res.body.install).toBeUndefined();
  });
});
