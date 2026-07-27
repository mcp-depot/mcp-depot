process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const request = require('supertest');

jest.mock('jwks-rsa', () => jest.fn(() => ({
  getSigningKey: (kid, callback) => callback(new Error('not used in this test'))
})));

const { sequelize, loadModels, createDefaultPolicyRules } = require('../src/config/database');
const app = require('../src/app');

describe('Groups API (/api/v1/groups)', () => {
  let User;
  let ownerToken, memberToken, outsiderToken, adminToken;
  let ownerId, memberId, outsiderId, adminId;

  const signIn = (userId) => {
    const jwt = require('jsonwebtoken');
    const config = require('../src/config/env');
    return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
  };

  beforeAll(async () => {
    const models = loadModels();
    User = models.User;
    await sequelize.sync({ force: true });
    // Mirrors production boot: canManageGroup()'s manage_others bypass only
    // denies non-admins by default because this seed exists - a fresh,
    // rule-less DB would default-allow anyone into any group's management.
    await createDefaultPolicyRules();

    const owner = await User.create({ email: 'owner@test.com', password: 'password123', name: 'Owner', role: 'user', mustResetPassword: false });
    const member = await User.create({ email: 'member@test.com', password: 'password123', name: 'Member', role: 'user', mustResetPassword: false });
    const outsider = await User.create({ email: 'outsider@test.com', password: 'password123', name: 'Outsider', role: 'user', mustResetPassword: false });
    const admin = await User.create({ email: 'groups-admin@test.com', password: 'password123', name: 'Admin', role: 'admin', mustResetPassword: false });

    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    adminId = admin.id;

    ownerToken = signIn(owner.id);
    memberToken = signIn(member.id);
    outsiderToken = signIn(outsider.id);
    adminToken = signIn(admin.id);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  let groupId;

  test('any authenticated user can create a group, and becomes its admin', async () => {
    const res = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Jira Team', description: 'People who use the Jira integration' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jira Team');
    groupId = res.body.id;

    const view = await request(app).get(`/api/v1/groups/${groupId}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(view.status).toBe(200);
    expect(view.body.members).toHaveLength(1);
    expect(view.body.members[0].role).toBe('admin');
    expect(view.body.canManage).toBe(true);
  });

  test('group names are unique, case-insensitively, regardless of creator', async () => {
    const sameCase = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Jira Team' });
    expect(sameCase.status).toBe(409);

    const differentCase = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'JIRA TEAM' });
    expect(differentCase.status).toBe(409);
  });

  test('renaming a group to collide with another existing name is rejected, but renaming to its own current name is not', async () => {
    const other = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Some Other Group' });
    expect(other.status).toBe(201);

    const collide = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'some other group' });
    expect(collide.status).toBe(409);

    const noOp = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Jira Team', description: 'updated description' });
    expect(noOp.status).toBe(200);
  });

  test('members can also be added by email (no admin-only user lookup required)', async () => {
    const create = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Email Add Test' });
    const emailGroupId = create.body.id;

    const res = await request(app)
      .post(`/api/v1/groups/${emailGroupId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'outsider@test.com' });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(outsiderId);
    expect(res.body.user.email).toBe('outsider@test.com');
  });

  test('rejects a request supplying both userId and email, or neither', async () => {
    const create = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Xor Validation Test' });
    const xorGroupId = create.body.id;

    const both = await request(app)
      .post(`/api/v1/groups/${xorGroupId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: outsiderId, email: 'outsider@test.com' });
    expect(both.status).toBe(400);

    const neither = await request(app)
      .post(`/api/v1/groups/${xorGroupId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(neither.status).toBe(400);
  });

  test('an outsider (not a member) gets 404, not 403, on a group they cannot see', async () => {
    const res = await request(app).get(`/api/v1/groups/${groupId}`).set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  test('the system admin can view any group via the manage_others bypass', async () => {
    const res = await request(app).get(`/api/v1/groups/${groupId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('GET /groups scopes the list: owner sees it, outsider does not, admin sees everything', async () => {
    const ownerList = await request(app).get('/api/v1/groups').set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerList.body.some(g => g.id === groupId)).toBe(true);

    const outsiderList = await request(app).get('/api/v1/groups').set('Authorization', `Bearer ${outsiderToken}`);
    expect(outsiderList.body.some(g => g.id === groupId)).toBe(false);

    const adminList = await request(app).get('/api/v1/groups').set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.body.some(g => g.id === groupId)).toBe(true);
  });

  test('the group-admin (owner) can add a member', async () => {
    const res = await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('member');
  });

  test('canManage on GET /:id matches what the API will actually allow - false for a plain member, true via the system-admin bypass', async () => {
    const asMember = await request(app).get(`/api/v1/groups/${groupId}`).set('Authorization', `Bearer ${memberToken}`);
    expect(asMember.body.canManage).toBe(false);

    const asAdmin = await request(app).get(`/api/v1/groups/${groupId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(asAdmin.body.canManage).toBe(true);
  });

  test('a plain member cannot manage the group (add members, rename, delete)', async () => {
    const addAttempt = await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ userId: outsiderId });
    expect(addAttempt.status).toBe(403);

    const renameAttempt = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Hijacked name' });
    expect(renameAttempt.status).toBe(403);
  });

  test('the group-admin can promote another member to group-admin - delegated administration', async () => {
    const promote = await request(app)
      .patch(`/api/v1/groups/${groupId}/members/${memberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe('admin');

    // The newly-promoted admin can now manage the group too, not just the original creator.
    const nowCanManage = await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ userId: outsiderId });
    expect(nowCanManage.status).toBe(201);
  });

  test('the last remaining group-admin cannot be demoted or removed', async () => {
    // Demote the original owner back to member first, leaving memberId as the sole admin.
    const demoteOwner = await request(app)
      .patch(`/api/v1/groups/${groupId}/members/${ownerId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ role: 'member' });
    expect(demoteOwner.status).toBe(200);

    const demoteLastAdmin = await request(app)
      .patch(`/api/v1/groups/${groupId}/members/${memberId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ role: 'member' });
    expect(demoteLastAdmin.status).toBe(400);

    const removeLastAdmin = await request(app)
      .delete(`/api/v1/groups/${groupId}/members/${memberId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(removeLastAdmin.status).toBe(400);
  });

  test('a regular (non-owning) member can be removed freely', async () => {
    const res = await request(app)
      .delete(`/api/v1/groups/${groupId}/members/${outsiderId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
  });

  test('?memberUserId lets an admin see a specific user\'s groups with their role in each - powers the Users page group management view', async () => {
    // ownerId was demoted back to a plain member earlier (delegated
    // administration test) and is still in the group at this point.
    const res = await request(app)
      .get(`/api/v1/groups?memberUserId=${ownerId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some(g => g.id === groupId && g.membershipRole === 'member')).toBe(true);
  });

  test('?memberUserId is admin-only', async () => {
    const res = await request(app)
      .get(`/api/v1/groups?memberUserId=${adminId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  test('the group-admin can delete the group', async () => {
    const res = await request(app)
      .delete(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);

    const gone = await request(app).get(`/api/v1/groups/${groupId}`).set('Authorization', `Bearer ${memberToken}`);
    expect(gone.status).toBe(404);
  });
});
