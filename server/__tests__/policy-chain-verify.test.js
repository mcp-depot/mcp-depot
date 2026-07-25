process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const { sequelize, loadModels } = require('../src/config/database');
const { checkPolicy } = require('../src/services/policy');
const { verifyPolicyChain } = require('../src/services/policy-chain-verify');

describe('verifyPolicyChain', () => {
  let User, PolicyDecision, user;

  beforeAll(async () => {
    const models = loadModels();
    User = models.User;
    PolicyDecision = models.PolicyDecision;
    await sequelize.sync({ force: true });
    user = await User.create({ email: 'chain@test.com', password: 'password123', name: 'Chain', role: 'user' });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('an empty chain is trivially valid', async () => {
    const result = await verifyPolicyChain();
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(0);
  });

  test('a chain of untouched decisions verifies as valid', async () => {
    await checkPolicy({ user: { id: user.id, role: 'user' }, resourceType: 'tool', resourceId: 'a', action: 'execute' });
    await checkPolicy({ user: { id: user.id, role: 'user' }, resourceType: 'tool', resourceId: 'b', action: 'execute' });
    await checkPolicy({ user: { id: user.id, role: 'user' }, resourceType: 'tool', resourceId: 'c', action: 'execute' });

    const result = await verifyPolicyChain();
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(3);
  });

  test('detects tampering with a record\'s content (reason field altered after the fact)', async () => {
    const records = await PolicyDecision.findAll({ order: [['createdAt', 'ASC']] });
    const target = records[1];
    await PolicyDecision.update({ reason: 'tampered reason' }, { where: { id: target.id } });

    const result = await verifyPolicyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe(target.id);
    expect(result.reason).toMatch(/recordHash/);
  });
});
