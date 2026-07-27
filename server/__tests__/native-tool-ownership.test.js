process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

// executeTool would otherwise make a real HTTP call via the adapter -
// mock it so the "allowed" test cases exercise only the ownership gate,
// not real network I/O.
jest.mock('../src/adapters', () => ({
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: { ok: true }, headers: {} })
  }))
}));

const { sequelize, loadModels } = require('../src/config/database');
const mcpServerInstance = require('../src/mcp/server');

let Integration, Tool, User;
let owner, other, admin;
let privateTool, sharedTool;

async function fetchWithIntegration(toolId) {
  return Tool.findByPk(toolId, { include: [{ model: Integration, as: 'integration' }] });
}

beforeAll(async () => {
  const models = loadModels();
  Integration = models.Integration;
  Tool = models.Tool;
  User = models.User;
  await sequelize.sync({ force: true });

  owner = await User.create({ email: 'native-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
  other = await User.create({ email: 'native-other@test.com', password: 'password123', name: 'Other', role: 'user', mustResetPassword: false });
  admin = await User.create({ email: 'native-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });

  const privateIntegration = await Integration.create({
    userId: owner.id, type: 'custom', name: 'Native Private Integration',
    config: { baseUrl: 'http://example.com', auth: { type: 'none' } }, isActive: true, visibility: 'private'
  });
  const privateToolRow = await Tool.create({
    userId: owner.id, integrationId: privateIntegration.id, name: 'native-private-tool',
    endpoint: { path: '/x', method: 'GET' }, isActive: true
  });
  privateTool = await fetchWithIntegration(privateToolRow.id);

  const sharedIntegration = await Integration.create({
    userId: owner.id, type: 'custom', name: 'Native Shared Integration',
    config: { baseUrl: 'http://example.com', auth: { type: 'none' } }, isActive: true, visibility: 'shared'
  });
  const sharedToolRow = await Tool.create({
    userId: owner.id, integrationId: sharedIntegration.id, name: 'native-shared-tool',
    endpoint: { path: '/y', method: 'GET' }, isActive: true
  });
  sharedTool = await fetchWithIntegration(sharedToolRow.id);
});

afterAll(async () => {
  await sequelize.close();
});

describe('executeTool - native MCP protocol path enforces the same ownership rule as the REST endpoints', () => {
  test('the owner can execute their own private tool', async () => {
    const result = await mcpServerInstance.executeTool(privateTool, {}, {}, owner.id);
    expect(result).toEqual({ ok: true });
  });

  test('a different, non-admin user cannot execute someone else\'s private tool', async () => {
    await expect(mcpServerInstance.executeTool(privateTool, {}, {}, other.id)).rejects.toThrow(/access denied/i);
  });

  test('an admin can execute any user\'s private tool', async () => {
    const result = await mcpServerInstance.executeTool(privateTool, {}, {}, admin.id);
    expect(result).toEqual({ ok: true });
  });

  test('anyone can execute a tool on a shared integration', async () => {
    const result = await mcpServerInstance.executeTool(sharedTool, {}, {}, other.id);
    expect(result).toEqual({ ok: true });
  });

  test('an anonymous/unidentified caller (no callerUserId) cannot execute a private tool', async () => {
    await expect(mcpServerInstance.executeTool(privateTool, {}, {}, null)).rejects.toThrow(/access denied/i);
  });
});
