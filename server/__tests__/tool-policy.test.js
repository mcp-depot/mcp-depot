process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const { sequelize, loadModels } = require('../src/config/database');
const { checkToolPolicy, toolResourceId } = require('../src/services/tool-policy');

describe('toolResourceId', () => {
  test('prefers exposedName, then name, then id', () => {
    expect(toolResourceId({ exposedName: 'jira_x', name: 'x', id: '1' })).toBe('jira_x');
    expect(toolResourceId({ exposedName: null, name: 'x', id: '1' })).toBe('x');
    expect(toolResourceId({ exposedName: null, name: null, id: '1' })).toBe('1');
  });
});

describe('checkToolPolicy', () => {
  let User, PolicyRule, PolicyDecision;
  let user, tool;

  beforeAll(async () => {
    const models = loadModels();
    User = models.User;
    PolicyRule = models.PolicyRule;
    PolicyDecision = models.PolicyDecision;
    await sequelize.sync({ force: true });

    user = await User.create({ email: 'u@test.com', password: 'password123', name: 'U', role: 'user' });
    tool = { id: 'tool-1', name: 'jira_delete', exposedName: 'jira_delete', integrationId: 'int-1' };
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('skips the check (allows, writes no record) when no user or userId is provided', async () => {
    const before = await PolicyDecision.count();
    const result = await checkToolPolicy({ tool });
    expect(result.decision).toBe('allow');
    expect(result.skipped).toBe(true);
    expect(await PolicyDecision.count()).toBe(before);
  });

  test('resolves a bare userId to a full user and evaluates policy against it', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'jira_delete', action: 'execute',
      subjectType: 'role', subjectId: 'user', effect: 'deny', isActive: true
    });

    const result = await checkToolPolicy({ userId: user.id, tool });
    expect(result.decision).toBe('deny');
    expect(result.skipped).toBeUndefined();
  });

  test('accepts an already-loaded user object directly (no extra lookup)', async () => {
    const result = await checkToolPolicy({ user: { id: user.id, role: 'user' }, tool });
    expect(result.decision).toBe('deny');
  });

  test('fails closed if resolving the userId throws', async () => {
    const brokenLookup = jest.spyOn(User, 'findByPk').mockRejectedValueOnce(new Error('db down'));
    const result = await checkToolPolicy({ userId: user.id, tool });
    expect(result.decision).toBe('deny');
    expect(result.error).toBe(true);
    brokenLookup.mockRestore();
  });

  test('a userId that resolves to no user is treated as anonymous (skipped, not denied)', async () => {
    const result = await checkToolPolicy({ userId: '00000000-0000-0000-0000-000000000000', tool });
    expect(result.decision).toBe('allow');
    expect(result.skipped).toBe(true);
  });
});
