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

let Integration, Tool, PromptLibrary, User;
let owner, other, admin;

beforeAll(async () => {
  const models = loadModels();
  Integration = models.Integration;
  Tool = models.Tool;
  PromptLibrary = models.PromptLibrary;
  User = models.User;
  await sequelize.sync({ force: true });

  owner = await User.create({ email: 'list-owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
  other = await User.create({ email: 'list-other@test.com', password: 'password123', name: 'Other', role: 'user', mustResetPassword: false });
  admin = await User.create({ email: 'list-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });

  const privateIntegration = await Integration.create({
    userId: owner.id, type: 'custom', name: 'List Private Integration',
    config: { baseUrl: 'http://example.com', auth: { type: 'none' } }, isActive: true, visibility: 'private'
  });
  await Tool.create({
    userId: owner.id, integrationId: privateIntegration.id, name: 'list-private-tool',
    endpoint: { path: '/x', method: 'GET' }, isActive: true
  });

  const sharedIntegration = await Integration.create({
    userId: owner.id, type: 'custom', name: 'List Shared Integration',
    config: { baseUrl: 'http://example.com', auth: { type: 'none' } }, isActive: true, visibility: 'shared'
  });
  await Tool.create({
    userId: owner.id, integrationId: sharedIntegration.id, name: 'list-shared-tool',
    endpoint: { path: '/y', method: 'GET' }, isActive: true
  });

  await PromptLibrary.create({
    userId: owner.id, name: 'list-private-skill', prompt: 'secret', isShared: false
  });
  await PromptLibrary.create({
    userId: owner.id, name: 'list-shared-skill', prompt: 'public', isShared: true
  });

  await mcpServerInstance.initialize();

  mcpServerInstance._sessionClientMap.set('owner-session', { userId: owner.id });
  mcpServerInstance._sessionClientMap.set('other-session', { userId: other.id });
  mcpServerInstance._sessionClientMap.set('admin-session', { userId: admin.id });
});

afterAll(async () => {
  await sequelize.close();
});

async function listToolNames(sessionId) {
  const handler = mcpServerInstance.server.server._requestHandlers.get('tools/list');
  const result = await handler({ method: 'tools/list', params: {} }, { sessionId });
  return result.tools.map(t => t.name);
}

describe('tools/list (native MCP protocol) - now filtered by ownership/visibility, not global', () => {
  test('the owner sees their own private tool and skill', async () => {
    const names = await listToolNames('owner-session');
    expect(names).toContain('list-private-tool');
    expect(names).toContain('skill_list-private-skill');
  });

  test('a different, non-admin user does NOT see the private tool or skill', async () => {
    const names = await listToolNames('other-session');
    expect(names).not.toContain('list-private-tool');
    expect(names).not.toContain('skill_list-private-skill');
  });

  test('a different, non-admin user DOES see the shared tool and shared skill', async () => {
    const names = await listToolNames('other-session');
    expect(names).toContain('list-shared-tool');
    expect(names).toContain('skill_list-shared-skill');
  });

  test('an admin sees everything', async () => {
    const names = await listToolNames('admin-session');
    expect(names).toContain('list-private-tool');
    expect(names).toContain('skill_list-private-skill');
  });

  test('meta-tools are always visible regardless of caller', async () => {
    const names = await listToolNames('other-session');
    expect(names).toContain('mcp_list_integrations');
  });
});
