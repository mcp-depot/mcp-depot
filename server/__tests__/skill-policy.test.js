process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

const { sequelize, loadModels } = require('../src/config/database');
const mcpServerInstance = require('../src/mcp/server');

let User, PolicyRule;
let owner, other, admin;

beforeAll(async () => {
  const models = loadModels();
  User = models.User;
  PolicyRule = models.PolicyRule;
  await sequelize.sync({ force: true });

  owner = await User.create({ email: 'skill-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
  other = await User.create({ email: 'skill-other@test.com', password: 'password123', name: 'Other', role: 'user', mustResetPassword: false });
  admin = await User.create({ email: 'skill-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });

  mcpServerInstance._sessionClientMap.set('owner-session', { userId: owner.id });
  mcpServerInstance._sessionClientMap.set('other-session', { userId: other.id });
  mcpServerInstance._sessionClientMap.set('admin-session', { userId: admin.id });

  mcpServerInstance.registerSkill({
    name: 'private-skill', prompt: 'secret: {{x}}', isShared: false, userId: owner.id,
    outputFormat: 'text', inputs: [{ name: 'x', type: 'string' }]
  });
  mcpServerInstance.registerSkill({
    name: 'shared-skill', prompt: 'public: {{x}}', isShared: true, userId: owner.id,
    outputFormat: 'text', inputs: [{ name: 'x', type: 'string' }]
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('registerSkill / invokeSkill - MCP protocol path is ownership- and policy-gated', () => {
  test('the owner can invoke their own private skill', async () => {
    const res = await mcpServerInstance.invokeSkill('skill_private-skill', { x: 'hi' }, { sessionId: 'owner-session' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe('secret: hi');
  });

  test('a different, non-admin user cannot invoke someone else\'s private skill', async () => {
    const res = await mcpServerInstance.invokeSkill('skill_private-skill', { x: 'hi' }, { sessionId: 'other-session' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/private to another user/i);
  });

  test('an admin can invoke any user\'s private skill', async () => {
    const res = await mcpServerInstance.invokeSkill('skill_private-skill', { x: 'hi' }, { sessionId: 'admin-session' });
    expect(res.isError).toBeFalsy();
  });

  test('any user can invoke a shared skill', async () => {
    const res = await mcpServerInstance.invokeSkill('skill_shared-skill', { x: 'hi' }, { sessionId: 'other-session' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe('public: hi');
  });

  test('a policy deny rule targeting this exact skill blocks even the owner - proves the policy gate is real', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'skill_shared-skill', action: 'execute',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: true,
      description: 'test: block this skill'
    });

    const res = await mcpServerInstance.invokeSkill('skill_shared-skill', { x: 'hi' }, { sessionId: 'owner-session' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/access denied/i);

    await PolicyRule.destroy({ where: { resourceMatch: 'skill_shared-skill' } });
  });

  test('an unresolvable/anonymous caller (no session) cannot invoke a private skill', async () => {
    const res = await mcpServerInstance.invokeSkill('skill_private-skill', { x: 'hi' }, {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/private to another user/i);
  });
});
