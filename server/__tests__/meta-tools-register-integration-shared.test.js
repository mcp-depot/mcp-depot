process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

const { sequelize, loadModels, createDefaultPolicyRules } = require('../src/config/database');
const { registerMetaTools } = require('../src/mcp/meta-tools');

let Integration, PolicyDecision, User;
let handlers;
let admin, regularUser;

beforeAll(async () => {
  const models = loadModels();
  Integration = models.Integration;
  PolicyDecision = models.PolicyDecision;
  User = models.User;
  await sequelize.sync({ force: true });

  await createDefaultPolicyRules();

  admin = await User.create({ email: 'shared-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });
  regularUser = await User.create({ email: 'shared-user@test.com', password: 'password123', name: 'Regular', role: 'user', mustResetPassword: false });

  await Integration.create({
    userId: admin.id, type: 'custom', name: 'MCP Depot - AI Tools',
    config: { baseUrl: 'http://localhost:3000', auth: { type: 'none' } }, isActive: true
  });

  const toolsMap = new Map();
  const fakeServer = { tool: () => {} };
  // A fake mcpServerInstance standing in for the real MCPServer wrapper -
  // only _sessionClientMap is read by resolveCallerUser.
  const fakeMcpServerInstance = {
    _sessionClientMap: new Map([
      ['admin-session', { userId: admin.id }],
      ['regular-session', { userId: regularUser.id }]
    ])
  };
  registerMetaTools(fakeServer, toolsMap, fakeMcpServerInstance);
  handlers = {};
  for (const [name, entry] of toolsMap.entries()) {
    handlers[name] = entry.handler;
  }
});

afterAll(async () => {
  await sequelize.close();
});

describe('mcp_register_integration - shared:true is policy-gated, not a free pass', () => {
  test('an admin session can create a company-wide shared integration', async () => {
    const res = await handlers.mcp_register_integration(
      { name: 'Admin Shared Tool', baseUrl: 'http://example.com', shared: true },
      { sessionId: 'admin-session' }
    );
    expect(res.isError).toBeFalsy();
    const integration = await Integration.findOne({ where: { name: 'Admin Shared Tool' } });
    expect(integration.visibility).toBe('shared');
    expect(integration.userId).toBe(admin.id);

    const decision = await PolicyDecision.findOne({ where: { userId: admin.id, resourceId: integration.id, action: 'share' } });
    expect(decision).not.toBeNull();
    expect(decision.decision).toBe('allow');
  });

  test('a regular (non-admin) session requesting shared:true gets a private integration instead, not a silent bypass', async () => {
    const res = await handlers.mcp_register_integration(
      { name: 'Regular User Shared Tool', baseUrl: 'http://example.com', shared: true },
      { sessionId: 'regular-session' }
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/only admins can share/i);

    const integration = await Integration.findOne({ where: { name: 'Regular User Shared Tool' } });
    expect(integration.visibility).toBe('private');
    // Denied the *share* request, but ownership attribution is a separate
    // concern - it's still correctly attributed to the real caller.
    expect(integration.userId).toBe(regularUser.id);
  });

  test('when the caller cannot be identified at all (no session, no REST user), shared:true still fails safe to private', async () => {
    const res = await handlers.mcp_register_integration(
      { name: 'Unidentified Caller Tool', baseUrl: 'http://example.com', shared: true },
      {}
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/could not be identified/i);

    const integration = await Integration.findOne({ where: { name: 'Unidentified Caller Tool' } });
    expect(integration.visibility).toBe('private');
  });

  test('a REST-resolved user (extra.user) is honored the same way as a session lookup', async () => {
    const res = await handlers.mcp_register_integration(
      { name: 'REST Admin Shared Tool', baseUrl: 'http://example.com', shared: true },
      { user: admin }
    );
    expect(res.isError).toBeFalsy();
    const integration = await Integration.findOne({ where: { name: 'REST Admin Shared Tool' } });
    expect(integration.visibility).toBe('shared');
  });

  test('shared:false (or omitted) never touches policy at all and stays private', async () => {
    const res = await handlers.mcp_register_integration(
      { name: 'Plain Private Tool', baseUrl: 'http://example.com' },
      { sessionId: 'admin-session' }
    );
    expect(res.isError).toBeFalsy();
    const integration = await Integration.findOne({ where: { name: 'Plain Private Tool' } });
    expect(integration.visibility).toBe('private');
  });
});

describe('identity threading - chat-created resources are attributed to the real caller', () => {
  test('an integration created via a regular (non-admin) session is owned by that user, not a hardcoded admin', async () => {
    const res = await handlers.mcp_register_integration(
      { name: 'Owned By Regular User', baseUrl: 'http://example.com' },
      { sessionId: 'regular-session' }
    );
    expect(res.isError).toBeFalsy();
    const integration = await Integration.findOne({ where: { name: 'Owned By Regular User' } });
    expect(integration.userId).toBe(regularUser.id);
  });

  test('falls back to an admin owner when the caller cannot be identified at all', async () => {
    const res = await handlers.mcp_register_integration(
      { name: 'Owned By Fallback Admin', baseUrl: 'http://example.com' },
      {}
    );
    expect(res.isError).toBeFalsy();
    const integration = await Integration.findOne({ where: { name: 'Owned By Fallback Admin' } });
    expect(integration.userId).toBe(admin.id);
  });

  test('a tool added via a regular session is attributed to that user, not a hardcoded admin', async () => {
    await handlers.mcp_register_integration(
      { name: 'Tool Ownership Target', baseUrl: 'http://example.com' },
      { sessionId: 'regular-session' }
    );
    const res = await handlers.mcp_register_tool(
      { integration: 'Tool Ownership Target', name: 'owned-tool', path: '/x', method: 'GET' },
      { sessionId: 'regular-session' }
    );
    expect(res.isError).toBeFalsy();
    const { Tool } = loadModels();
    const tool = await Tool.findOne({ where: { name: 'owned-tool' } });
    expect(tool.userId).toBe(regularUser.id);
  });

  test('a REST-resolved user (extra.user) owns the tool it registers, same as a session lookup', async () => {
    await handlers.mcp_register_integration(
      { name: 'REST Tool Ownership Target', baseUrl: 'http://example.com' },
      { user: regularUser }
    );
    const res = await handlers.mcp_register_tool(
      { integration: 'REST Tool Ownership Target', name: 'rest-owned-tool', path: '/x', method: 'GET' },
      { user: regularUser }
    );
    expect(res.isError).toBeFalsy();
    const { Tool } = loadModels();
    const tool = await Tool.findOne({ where: { name: 'rest-owned-tool' } });
    expect(tool.userId).toBe(regularUser.id);
  });
});
