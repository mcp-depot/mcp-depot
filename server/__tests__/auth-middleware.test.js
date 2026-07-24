jest.mock('../src/models/User');

const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const config = require('../src/config/env');
const { auth, requireAdmin } = require('../src/middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides = {}) {
  return {
    header: jest.fn(() => undefined),
    path: '/some/protected/route',
    ...overrides
  };
}

function signToken(payload, opts = {}) {
  return jwt.sign(payload, config.jwtSecret, opts);
}

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a request with no Authorization header', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a non-Bearer Authorization header', async () => {
    const req = mockReq({ header: jest.fn((name) => (name === 'Authorization' ? 'Basic abc123' : undefined)) });
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a token signed with the wrong secret', async () => {
    const badToken = jwt.sign({ userId: 'user-1' }, 'a-completely-different-secret');
    const req = mockReq({ header: jest.fn((name) => (name === 'Authorization' ? `Bearer ${badToken}` : undefined)) });
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an expired token with a distinct error code', async () => {
    const expiredToken = signToken({ userId: 'user-1' }, { expiresIn: -10 });
    const req = mockReq({ header: jest.fn((name) => (name === 'Authorization' ? `Bearer ${expiredToken}` : undefined)) });
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a valid token whose user no longer exists', async () => {
    User.findByPk.mockResolvedValue(null);
    const token = signToken({ userId: 'deleted-user' });
    const req = mockReq({ header: jest.fn((name) => (name === 'Authorization' ? `Bearer ${token}` : undefined)) });
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a valid token, attaches req.user, and calls next()', async () => {
    const user = { id: 'user-1', role: 'user', mustResetPassword: false };
    User.findByPk.mockResolvedValue(user);
    const token = signToken({ userId: 'user-1' });
    const req = mockReq({ header: jest.fn((name) => (name === 'Authorization' ? `Bearer ${token}` : undefined)) });
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('blocks access to routes other than change-password when mustResetPassword is set', async () => {
    User.findByPk.mockResolvedValue({ id: 'user-1', role: 'user', mustResetPassword: true });
    const token = signToken({ userId: 'user-1' });
    const req = mockReq({
      header: jest.fn((name) => (name === 'Authorization' ? `Bearer ${token}` : undefined)),
      path: '/api/integrations'
    });
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'PASSWORD_RESET_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('allows the change-password route through even when mustResetPassword is set', async () => {
    User.findByPk.mockResolvedValue({ id: 'user-1', role: 'user', mustResetPassword: true });
    const token = signToken({ userId: 'user-1' });
    const req = mockReq({
      header: jest.fn((name) => (name === 'Authorization' ? `Bearer ${token}` : undefined)),
      path: '/api/auth/change-password'
    });
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireAdmin middleware', () => {
  test('rejects when there is no authenticated user on the request', async () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a non-admin user', async () => {
    const req = { user: { id: 'user-1', role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows an admin user through', async () => {
    const req = { user: { id: 'admin-1', role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
