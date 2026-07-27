process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const { sequelize, loadModels, createDefaultPolicyRules } = require('../src/config/database');
const { checkSessionContextPolicy, checkSessionChannelPolicy, checkIntegrationPolicy, checkGroupPolicy, checkExternalMcpPolicy } = require('../src/services/resource-policy');

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

  test('seeds exactly 16 rules and is idempotent on repeated calls', async () => {
    await createDefaultPolicyRules();
    const afterFirst = await PolicyRule.count();
    expect(afterFirst).toBe(16);

    await createDefaultPolicyRules();
    await createDefaultPolicyRules();
    const afterRepeat = await PolicyRule.count();
    expect(afterRepeat).toBe(16);
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

  test('an admin may share, manage others\' credentials, and view users on an integration by default', async () => {
    const share = await checkIntegrationPolicy({ user: admin, action: 'share', integrationId: 'int-x' });
    expect(share.decision).toBe('allow');

    const manageOthers = await checkIntegrationPolicy({ user: admin, action: 'manage_others', integrationId: 'int-x' });
    expect(manageOthers.decision).toBe('allow');

    const viewUsers = await checkIntegrationPolicy({ user: admin, action: 'view_users', integrationId: 'int-x' });
    expect(viewUsers.decision).toBe('allow');
  });

  test('a regular user is denied share, manage_others, and view_users on an integration by default', async () => {
    const share = await checkIntegrationPolicy({ user, action: 'share', integrationId: 'int-x' });
    expect(share.decision).toBe('deny');

    const manageOthers = await checkIntegrationPolicy({ user, action: 'manage_others', integrationId: 'int-x' });
    expect(manageOthers.decision).toBe('deny');

    const viewUsers = await checkIntegrationPolicy({ user, action: 'view_users', integrationId: 'int-x' });
    expect(viewUsers.decision).toBe('deny');
  });

  test('an admin bypasses group management by default; a regular user does not', async () => {
    const adminResult = await checkGroupPolicy({ user: admin, action: 'manage_others', groupId: 'g-x' });
    expect(adminResult.decision).toBe('allow');

    const userResult = await checkGroupPolicy({ user, action: 'manage_others', groupId: 'g-x' });
    expect(userResult.decision).toBe('deny');
  });

  test('an admin may configure stdio external MCP servers and install packages by default; a regular user cannot', async () => {
    const adminStdio = await checkExternalMcpPolicy({ user: admin, action: 'configure_stdio', resourceId: 'srv-x' });
    expect(adminStdio.decision).toBe('allow');
    const userStdio = await checkExternalMcpPolicy({ user, action: 'configure_stdio', resourceId: 'srv-x' });
    expect(userStdio.decision).toBe('deny');

    const adminInstall = await checkExternalMcpPolicy({ user: admin, action: 'install_package', resourceId: 'some-pkg' });
    expect(adminInstall.decision).toBe('allow');
    const userInstall = await checkExternalMcpPolicy({ user, action: 'install_package', resourceId: 'some-pkg' });
    expect(userInstall.decision).toBe('deny');
  });

  test('create has no seeded rule for external MCP servers - open by default for both admin and regular users', async () => {
    const adminCreate = await checkExternalMcpPolicy({ user: admin, action: 'create', resourceId: 'srv-x' });
    expect(adminCreate.decision).toBe('allow');
    const userCreate = await checkExternalMcpPolicy({ user, action: 'create', resourceId: 'srv-x' });
    expect(userCreate.decision).toBe('allow');
  });
});
