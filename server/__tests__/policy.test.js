process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const { sequelize, loadModels } = require('../src/config/database');
const { checkPolicy, canonicalize, computeHash } = require('../src/services/policy');

describe('canonicalize', () => {
  test('sorts keys at every nesting level regardless of insertion order', () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('preserves array order (arrays are not sorted, only object keys)', () => {
    const result = canonicalize({ list: [3, 1, 2] });
    expect(result.list).toEqual([3, 1, 2]);
  });
});

describe('computeHash', () => {
  test('is deterministic for the same inputs', () => {
    const fields = { userId: 'u1', decision: 'allow' };
    expect(computeHash('prev', fields)).toBe(computeHash('prev', fields));
  });

  test('changes when previousHash changes (chain linkage matters)', () => {
    const fields = { userId: 'u1', decision: 'allow' };
    expect(computeHash('prev-a', fields)).not.toBe(computeHash('prev-b', fields));
  });

  test('changes when any field changes', () => {
    expect(computeHash('prev', { decision: 'allow' })).not.toBe(computeHash('prev', { decision: 'deny' }));
  });
});

describe('checkPolicy', () => {
  let PolicyRule, User;
  const admin = { id: null, role: 'admin' };
  const regularUser = { id: null, role: 'user' };

  beforeAll(async () => {
    const models = loadModels();
    PolicyRule = models.PolicyRule;
    User = models.User;
    await sequelize.sync({ force: true });

    const createdAdmin = await User.create({ email: 'admin@test.com', password: 'password123', name: 'Admin', role: 'admin' });
    const createdUser = await User.create({ email: 'user@test.com', password: 'password123', name: 'User', role: 'user' });
    admin.id = createdAdmin.id;
    regularUser.id = createdUser.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  afterEach(async () => {
    await PolicyRule.destroy({ where: {}, truncate: true, cascade: false });
  });

  test('defaults to allow when no rule matches anything (backward-compatibility default)', async () => {
    const result = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'jira_create_issue', action: 'execute' });
    expect(result.decision).toBe('allow');
    expect(result.matchedRuleId).toBeNull();
  });

  test('an exact-match deny rule blocks the matching user', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'jira_delete_issue', action: 'execute',
      subjectType: 'role', subjectId: 'user', effect: 'deny', isActive: true
    });

    const denied = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'jira_delete_issue', action: 'execute' });
    expect(denied.decision).toBe('deny');

    const stillAllowedForAdmin = await checkPolicy({ user: admin, resourceType: 'tool', resourceId: 'jira_delete_issue', action: 'execute' });
    expect(stillAllowedForAdmin.decision).toBe('allow');
  });

  test('a more specific rule wins over a broader one, regardless of creation order', async () => {
    // Broad: deny all tool execution for role=user
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: '*', action: 'execute',
      subjectType: 'role', subjectId: 'user', effect: 'deny', isActive: true
    });
    // Specific: allow this one exact tool for role=user
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'jira_read_issue', action: 'execute',
      subjectType: 'role', subjectId: 'user', effect: 'allow', isActive: true
    });

    const specificAllowed = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'jira_read_issue', action: 'execute' });
    expect(specificAllowed.decision).toBe('allow');

    const broadDenyStillApplies = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'jira_delete_issue', action: 'execute' });
    expect(broadDenyStillApplies.decision).toBe('deny');
  });

  test('prefix pattern rules match by prefix', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'jira_*', action: 'execute',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: true
    });

    const denied = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'jira_anything', action: 'execute' });
    expect(denied.decision).toBe('deny');

    const unaffected = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'github_anything', action: 'execute' });
    expect(unaffected.decision).toBe('allow');
  });

  test('equal-specificity deny beats equal-specificity allow', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'jira_x', action: 'execute',
      subjectType: 'role', subjectId: 'user', effect: 'allow', isActive: true
    });
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'jira_x', action: 'execute',
      subjectType: 'role', subjectId: 'user', effect: 'deny', isActive: true
    });

    const result = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'jira_x', action: 'execute' });
    expect(result.decision).toBe('deny');
  });

  test('an inactive rule is ignored', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'jira_x', action: 'execute',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: false
    });

    const result = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'jira_x', action: 'execute' });
    expect(result.decision).toBe('allow');
  });

  test('a rule for a different resourceType does not apply, even with the same resourceMatch', async () => {
    await PolicyRule.create({
      resourceType: 'session_channel', resourceMatch: '*', action: '*',
      subjectType: '*', subjectId: null, effect: 'deny', isActive: true
    });

    const toolCallUnaffected = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'anything', action: 'execute' });
    expect(toolCallUnaffected.decision).toBe('allow');

    const channelDenied = await checkPolicy({ user: regularUser, resourceType: 'session_channel', resourceId: 'general', action: 'clear' });
    expect(channelDenied.decision).toBe('deny');
  });

  test('limit effect denies once the configured count is exceeded', async () => {
    await PolicyRule.create({
      resourceType: 'tool', resourceMatch: 'rate_limited_tool', action: 'execute',
      subjectType: '*', subjectId: null, effect: 'limit', limitConfig: { maxPerHour: 2 }, isActive: true
    });

    const first = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'rate_limited_tool', action: 'execute' });
    const second = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'rate_limited_tool', action: 'execute' });
    const third = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'rate_limited_tool', action: 'execute' });

    expect(first.decision).toBe('allow');
    expect(second.decision).toBe('allow');
    expect(third.decision).toBe('deny');
  });

  test('every decision is written and hash-chained to the previous one', async () => {
    const { PolicyDecision } = loadModels();
    const before = await PolicyDecision.count();

    const r1 = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'chain_test_1', action: 'execute' });
    const r2 = await checkPolicy({ user: regularUser, resourceType: 'tool', resourceId: 'chain_test_2', action: 'execute' });

    const after = await PolicyDecision.count();
    expect(after).toBe(before + 2);

    const rec1 = await PolicyDecision.findByPk(r1.decisionId);
    const rec2 = await PolicyDecision.findByPk(r2.decisionId);
    expect(rec2.previousHash).toBe(rec1.recordHash);
    expect(rec2.recordHash).not.toBe(rec1.recordHash);
  });
});
