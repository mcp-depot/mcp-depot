process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const { sequelize, loadModels, createDefaultPolicyRules } = require('../src/config/database');
const { checkSessionContextPolicy, checkSessionChannelPolicy } = require('../src/services/session-policy');

describe('createDefaultPolicyRules', () => {
  let User, PolicyRule;
  let admin, user;

  beforeAll(async () => {
    const models = loadModels();
    User = models.User;
    PolicyRule = models.PolicyRule;
    await sequelize.sync({ force: true });

    admin = await User.create({ email: 'admin@test.com', password: 'password123', name: 'Admin', role: 'admin' });
    user = await User.create({ email: 'user@test.com', password: 'password123', name: 'User', role: 'user' });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('seeds exactly 4 rules and is idempotent on repeated calls', async () => {
    await createDefaultPolicyRules();
    const afterFirst = await PolicyRule.count();
    expect(afterFirst).toBe(4);

    await createDefaultPolicyRules();
    await createDefaultPolicyRules();
    const afterRepeat = await PolicyRule.count();
    expect(afterRepeat).toBe(4);
  });

  test('an admin bypasses session context ownership by default (manage_others allowed)', async () => {
    const result = await checkSessionContextPolicy({ user: admin, action: 'manage_others', name: 'someone-elses-ctx' });
    expect(result.decision).toBe('allow');
  });

  test('a regular user cannot bypass session context ownership by default (manage_others denied)', async () => {
    const result = await checkSessionContextPolicy({ user, action: 'manage_others', name: 'someone-elses-ctx' });
    expect(result.decision).toBe('deny');
  });

  test('an admin bypasses session channel ownership by default (manage_others allowed)', async () => {
    const result = await checkSessionChannelPolicy({ user: admin, action: 'manage_others', channel: 'someone-elses-chan' });
    expect(result.decision).toBe('allow');
  });

  test('a regular user cannot bypass session channel ownership by default (manage_others denied)', async () => {
    const result = await checkSessionChannelPolicy({ user, action: 'manage_others', channel: 'someone-elses-chan' });
    expect(result.decision).toBe('deny');
  });

  test('other actions on the same resource types are unaffected by the manage_others seed rules', async () => {
    const ctxRead = await checkSessionContextPolicy({ user, action: 'read', name: 'own-ctx' });
    expect(ctxRead.decision).toBe('allow');

    const chanRead = await checkSessionChannelPolicy({ user, action: 'read', channel: 'own-chan' });
    expect(chanRead.decision).toBe('allow');
  });

  test('admin bypass is overridable: an explicit deny rule for a specific admin user still wins', async () => {
    await PolicyRule.create({
      resourceType: 'session_context', resourceMatch: '*', action: 'manage_others',
      subjectType: 'user', subjectId: admin.id, effect: 'deny', isActive: true,
      description: 'per-user override for this test'
    });

    const result = await checkSessionContextPolicy({ user: admin, action: 'manage_others', name: 'x' });
    expect(result.decision).toBe('deny');
  });
});
