process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

const jwt = require('jsonwebtoken');
const { sequelize, loadModels } = require('../src/config/database');
const { resolveMcpUserFromRequest, checkMcpAuth } = require('../src/middleware/mcpAuth');
const SystemSetting = require('../src/models/SystemSetting');

describe('resolveMcpUserFromRequest / checkMcpAuth', () => {
  let User;
  let admin;
  let rawApiKey;

  beforeAll(async () => {
    ({ User } = loadModels());
    await sequelize.sync({ force: true });
    admin = await User.create({
      email: 'mcp-auth-admin@test.com',
      password: 'password123',
      name: 'Admin',
      role: 'admin',
      mustResetPassword: false
    });
    rawApiKey = admin.generateApiKey();
    await admin.save();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const reqWith = (headers) => ({
    header: (name) => headers[name] || headers[name.toLowerCase()] || null,
    headers,
    user: undefined
  });

  test('resolves X-API-Key to the owning user', async () => {
    const user = await resolveMcpUserFromRequest(reqWith({ 'X-API-Key': rawApiKey }));
    expect(user?.id).toBe(admin.id);
  });

  test('resolves Authorization Bearer API key (not only JWT)', async () => {
    const user = await resolveMcpUserFromRequest(reqWith({ Authorization: `Bearer ${rawApiKey}` }));
    expect(user?.id).toBe(admin.id);
  });

  test('resolves Authorization Bearer JWT', async () => {
    const token = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET);
    const user = await resolveMcpUserFromRequest(reqWith({ Authorization: `Bearer ${token}` }));
    expect(user?.id).toBe(admin.id);
  });

  test('returns null when credentials are missing or wrong', async () => {
    expect(await resolveMcpUserFromRequest(reqWith({}))).toBeNull();
    expect(await resolveMcpUserFromRequest(reqWith({ Authorization: 'Bearer mcp_not_a_real_key' }))).toBeNull();
  });

  test('optional authMode attaches user from X-API-Key without requiring auth', async () => {
    await SystemSetting.upsert({ key: 'mcp', value: { authMode: 'optional' } });
    const req = reqWith({ 'X-API-Key': rawApiKey });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await checkMcpAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe(admin.id);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('optional authMode continues anonymously when no credentials', async () => {
    await SystemSetting.upsert({ key: 'mcp', value: { authMode: 'optional' } });
    const req = reqWith({});
    const next = jest.fn();
    await checkMcpAuth(req, { status: jest.fn().mockReturnThis(), json: jest.fn() }, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  test('required authMode rejects missing credentials with 401', async () => {
    await SystemSetting.upsert({ key: 'mcp', value: { authMode: 'required' } });
    const req = reqWith({});
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await checkMcpAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
