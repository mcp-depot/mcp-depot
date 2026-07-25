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
const { registerMetaTools } = require('../src/mcp/meta-tools');

let Integration, Tool, User;
let handlers;

beforeAll(async () => {
  const models = loadModels();
  Integration = models.Integration;
  Tool = models.Tool;
  User = models.User;
  await sequelize.sync({ force: true });

  const admin = await User.create({ email: 'meta-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });

  // The "MCP Depot - AI Tools" integration gates whether meta-tools run at
  // all (guardIntegrationActive) - it must exist and be active, same as
  // it would be at boot via createDefaultTool().
  await Integration.create({
    userId: admin.id, type: 'custom', name: 'MCP Depot - AI Tools',
    config: { baseUrl: 'http://localhost:3000', auth: { type: 'none' } }, isActive: true
  });

  await Integration.create({
    userId: admin.id, type: 'custom', name: 'MCP Depot',
    config: { baseUrl: 'http://localhost:3000', auth: { type: 'none' } }, isActive: true
  });
  await Tool.create({
    userId: admin.id, integrationId: (await Integration.findOne({ where: { name: 'MCP Depot' } })).id,
    name: 'existing-builtin-tool', endpoint: { path: '/x', method: 'GET' }, isActive: true
  });

  await Integration.create({
    userId: admin.id, type: 'custom', name: 'Jira Prod',
    config: { baseUrl: 'http://jira.example.com', auth: { type: 'none' } }, isActive: true
  });
  await Tool.create({
    userId: admin.id, integrationId: (await Integration.findOne({ where: { name: 'Jira Prod' } })).id,
    name: 'existing-regular-tool', endpoint: { path: '/y', method: 'GET' }, isActive: true
  });

  const toolsMap = new Map();
  const fakeServer = { tool: () => {} };
  registerMetaTools(fakeServer, toolsMap);
  handlers = {};
  for (const [name, entry] of toolsMap.entries()) {
    handlers[name] = entry.handler;
  }
});

afterAll(async () => {
  await sequelize.close();
});

describe('mcp_register_tool - built-in guard', () => {
  test('rejects adding a tool to a built-in integration by name', async () => {
    const res = await handlers.mcp_register_tool({
      integration: 'MCP Depot', name: 'evil-tool', path: '/evil', method: 'GET'
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/built-in integration/i);

    const tool = await Tool.findOne({ where: { name: 'evil-tool' } });
    expect(tool).toBeNull();
  });

  test('still allows adding a tool to a regular integration', async () => {
    const res = await handlers.mcp_register_tool({
      integration: 'Jira Prod', name: 'new-tool', path: '/new', method: 'GET'
    });
    expect(res.isError).toBeFalsy();

    const tool = await Tool.findOne({ where: { name: 'new-tool' } });
    expect(tool).not.toBeNull();
  });
});

describe('mcp_remove_tool - built-in guard', () => {
  test('rejects removing a tool from a built-in integration', async () => {
    const res = await handlers.mcp_remove_tool({
      integration: 'MCP Depot', name: 'existing-builtin-tool', confirm: true
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/built-in integration/i);

    const tool = await Tool.findOne({ where: { name: 'existing-builtin-tool' } });
    expect(tool).not.toBeNull();
  });

  test('still allows removing a tool from a regular integration', async () => {
    const res = await handlers.mcp_remove_tool({
      integration: 'Jira Prod', name: 'existing-regular-tool', confirm: true
    });
    expect(res.isError).toBeFalsy();

    const tool = await Tool.findOne({ where: { name: 'existing-regular-tool' } });
    expect(tool).toBeNull();
  });
});
