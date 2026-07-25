process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const { sequelize, loadModels } = require('../src/config/database');
const { checkSessionContextPolicy, checkSessionChannelPolicy, checkIntegrationPolicy } = require('../src/services/resource-policy');

// Single sync/close for the whole file - sequelize is a shared singleton, so
// each describe block below only loads its own fixtures in beforeAll, not a
// fresh sync/close (two competing sync({force:true})+close() pairs on the
// same connection collide).
beforeAll(async () => {
  loadModels();
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('checkSessionContextPolicy / checkSessionChannelPolicy', () => {
  let User, PolicyRule, PolicyDecision;
  let user;

  beforeAll(async () => {
    const models = loadModels();
    User = models.User;
    PolicyRule = models.PolicyRule;
    PolicyDecision = models.PolicyDecision;

    user = await User.create({ email: 'u@test.com', password: 'password123', name: 'U', role: 'user' });
  });

  test('fails closed (denies, no lookup) when no user is provided at all', async () => {
    const before = await PolicyDecision.count();
    const result = await checkSessionContextPolicy({ action: 'read', name: 'ctx-1' });
    expect(result.decision).toBe('deny');
    expect(result.error).toBe(true);
    expect(await PolicyDecision.count()).toBe(before);
  });

  test('default-allows a session context read with no matching rule', async () => {
    const result = await checkSessionContextPolicy({ user, action: 'read', name: 'ctx-1' });
    expect(result.decision).toBe('allow');
  });

  test('a deny rule on resourceType session_context blocks the matching action', async () => {
    await PolicyRule.create({
      resourceType: 'session_context', resourceMatch: 'secret-ctx', action: 'read',
      subjectType: 'role', subjectId: 'user', effect: 'deny', isActive: true
    });

    const denied = await checkSessionContextPolicy({ user, action: 'read', name: 'secret-ctx' });
    expect(denied.decision).toBe('deny');

    const unaffected = await checkSessionContextPolicy({ user, action: 'read', name: 'other-ctx' });
    expect(unaffected.decision).toBe('allow');

    const differentAction = await checkSessionContextPolicy({ user, action: 'write', name: 'secret-ctx' });
    expect(differentAction.decision).toBe('allow');
  });

  test('default-allows a session channel action with no matching rule', async () => {
    const result = await checkSessionChannelPolicy({ user, action: 'write', channel: 'chan-1' });
    expect(result.decision).toBe('allow');
  });

  test('a deny rule on resourceType session_channel blocks the matching action', async () => {
    await PolicyRule.create({
      resourceType: 'session_channel', resourceMatch: 'locked-chan', action: 'write',
      subjectType: 'role', subjectId: 'user', effect: 'deny', isActive: true
    });

    const denied = await checkSessionChannelPolicy({ user, action: 'write', channel: 'locked-chan' });
    expect(denied.decision).toBe('deny');

    const readStillAllowed = await checkSessionChannelPolicy({ user, action: 'read', channel: 'locked-chan' });
    expect(readStillAllowed.decision).toBe('allow');
  });

  test('fails closed (denies) when no user is provided for a channel check', async () => {
    const result = await checkSessionChannelPolicy({ action: 'read', channel: 'chan-1' });
    expect(result.decision).toBe('deny');
    expect(result.error).toBe(true);
  });
});

describe('checkIntegrationPolicy', () => {
  let User, PolicyRule;
  let user;

  beforeAll(async () => {
    const models = loadModels();
    User = models.User;
    PolicyRule = models.PolicyRule;

    user = await User.create({ email: 'int-user@test.com', password: 'password123', name: 'IntUser', role: 'user' });
  });

  test('fails closed when no user is provided', async () => {
    const result = await checkIntegrationPolicy({ action: 'share', integrationId: 'int-1' });
    expect(result.decision).toBe('deny');
    expect(result.error).toBe(true);
  });

  test('default-allows an integration action with no matching rule', async () => {
    const result = await checkIntegrationPolicy({ user, action: 'share', integrationId: 'int-1' });
    expect(result.decision).toBe('allow');
  });

  test('a deny rule on resourceType integration blocks only the matching action', async () => {
    await PolicyRule.create({
      resourceType: 'integration', resourceMatch: 'int-locked', action: 'share',
      subjectType: 'role', subjectId: 'user', effect: 'deny', isActive: true
    });

    const denied = await checkIntegrationPolicy({ user, action: 'share', integrationId: 'int-locked' });
    expect(denied.decision).toBe('deny');

    const unaffectedResource = await checkIntegrationPolicy({ user, action: 'share', integrationId: 'int-other' });
    expect(unaffectedResource.decision).toBe('allow');

    const unaffectedAction = await checkIntegrationPolicy({ user, action: 'manage_others', integrationId: 'int-locked' });
    expect(unaffectedAction.decision).toBe('allow');
  });
});
