const express = require('express');
const Joi = require('joi');
const { randomUUID } = require('crypto');
const { auth } = require('../middleware/auth');
const { loadModels } = require('../config/database');
const { checkGroupPolicy } = require('../services/resource-policy');
const audit = require('../services/audit');
const logger = require('../services/logger');

const router = express.Router();

// Group-admin (membership.role === 'admin') or the system-wide admin bypass
// (checkGroupPolicy's manage_others) may manage a group's settings/members.
// Membership is plain relational data, not a policy decision - this mirrors
// how integration ownership is a plain column check with a policy bypass
// layered on top for admins.
async function canManageGroup(user, groupId) {
  const { GroupMembership } = loadModels();
  const membership = await GroupMembership.findOne({ where: { groupId, userId: user.id } });
  if (membership?.role === 'admin') return true;

  const policyResult = await checkGroupPolicy({ user, action: 'manage_others', groupId });
  return policyResult.decision === 'allow';
}

const createGroupSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().allow('').optional()
});

const updateGroupSchema = Joi.object({
  name: Joi.string().max(255),
  description: Joi.string().allow('')
}).min(1);

// userId OR email - GET /users (the only user directory) is admin-only, so
// a non-admin group-admin has no way to resolve a colleague's UUID
// themselves. Accepting an email lets the add-member UI just take an email
// address and resolve it server-side.
const addMemberSchema = Joi.object({
  userId: Joi.string().uuid(),
  email: Joi.string().email(),
  role: Joi.string().valid('member', 'admin').default('member')
}).xor('userId', 'email');

const updateMemberSchema = Joi.object({
  role: Joi.string().valid('member', 'admin').required()
});

router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = createGroupSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { Group, GroupMembership } = loadModels();
    const group = await Group.create({
      name: value.name,
      description: value.description || null,
      createdBy: req.user.id
    });

    await GroupMembership.create({
      id: randomUUID(),
      groupId: group.id,
      userId: req.user.id,
      role: 'admin',
      addedBy: req.user.id
    });

    await audit.log({ userId: req.user.id, action: 'create_group', details: { groupId: group.id, name: group.name }, status: 'success' });

    res.status(201).json(group);
  } catch (err) {
    logger.error({ err: err.message }, 'Create group error');
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Admins see every group; everyone else sees only groups they belong to.
// Plain membership-scoped list query, not policy-gated - consistent with
// every other list endpoint in this app (no single resourceId to check).
//
// ?memberUserId=<id> is a separate, admin-only mode: which groups does a
// SPECIFIC (possibly different) user belong to, with their role in each -
// powers the "manage this person's groups" view from the Users page. Not
// available to non-admins - it's a cross-user lookup, not "my own groups".
router.get('/', auth, async (req, res) => {
  try {
    const { Group, GroupMembership } = loadModels();

    if (req.query.memberUserId) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      const memberships = await GroupMembership.findAll({
        where: { userId: req.query.memberUserId },
        include: [{ model: Group, as: 'group' }],
        order: [['createdAt', 'ASC']]
      });
      return res.json(memberships.map(m => ({ ...m.group.toJSON(), membershipRole: m.role })));
    }

    let groups;
    if (req.user.role === 'admin') {
      groups = await Group.findAll({ order: [['createdAt', 'DESC']] });
    } else {
      const memberships = await GroupMembership.findAll({ where: { userId: req.user.id }, attributes: ['groupId'], raw: true });
      const groupIds = memberships.map(m => m.groupId);
      groups = groupIds.length > 0
        ? await Group.findAll({ where: { id: groupIds }, order: [['createdAt', 'DESC']] })
        : [];
    }

    res.json(groups);
  } catch (err) {
    logger.error({ err: err.message }, 'List groups error');
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { Group, GroupMembership, User } = loadModels();
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const membership = await GroupMembership.findOne({ where: { groupId: group.id, userId: req.user.id } });
    if (!membership) {
      const policyResult = await checkGroupPolicy({ user: req.user, action: 'manage_others', groupId: group.id });
      if (policyResult.decision === 'deny') return res.status(404).json({ error: 'Group not found' });
    }

    const members = await GroupMembership.findAll({
      where: { groupId: group.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'ASC']]
    });

    res.json({ ...group.toJSON(), members });
  } catch (err) {
    logger.error({ err: err.message }, 'Get group error');
    res.status(500).json({ error: 'Failed to get group' });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const { error, value } = updateGroupSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { Group } = loadModels();
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!(await canManageGroup(req.user, group.id))) {
      return res.status(403).json({ error: 'You do not administer this group' });
    }

    await group.update(value);
    await audit.log({ userId: req.user.id, action: 'update_group', details: { groupId: group.id }, status: 'success' });

    res.json(group);
  } catch (err) {
    logger.error({ err: err.message }, 'Update group error');
    res.status(500).json({ error: 'Failed to update group' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { Group } = loadModels();
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!(await canManageGroup(req.user, group.id))) {
      return res.status(403).json({ error: 'You do not administer this group' });
    }

    await group.destroy();
    await audit.log({ userId: req.user.id, action: 'delete_group', details: { groupId: group.id, name: group.name }, status: 'success' });

    res.json({ message: 'Group deleted' });
  } catch (err) {
    logger.error({ err: err.message }, 'Delete group error');
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

router.post('/:id/members', auth, async (req, res) => {
  try {
    const { error, value } = addMemberSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { Group, GroupMembership, User } = loadModels();
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!(await canManageGroup(req.user, group.id))) {
      return res.status(403).json({ error: 'You do not administer this group' });
    }

    const targetUser = value.userId
      ? await User.findByPk(value.userId)
      : await User.findOne({ where: { email: value.email } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const [membership, created] = await GroupMembership.findOrCreate({
      where: { groupId: group.id, userId: targetUser.id },
      defaults: { id: randomUUID(), role: value.role, addedBy: req.user.id }
    });
    if (!created) return res.status(409).json({ error: 'User is already a member of this group' });

    await audit.log({ userId: req.user.id, action: 'add_group_member', details: { groupId: group.id, targetUserId: targetUser.id, role: value.role }, status: 'success' });

    res.status(201).json({ ...membership.toJSON(), user: { id: targetUser.id, name: targetUser.name, email: targetUser.email } });
  } catch (err) {
    logger.error({ err: err.message }, 'Add group member error');
    res.status(500).json({ error: 'Failed to add group member' });
  }
});

router.patch('/:id/members/:userId', auth, async (req, res) => {
  try {
    const { error, value } = updateMemberSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { Group, GroupMembership } = loadModels();
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!(await canManageGroup(req.user, group.id))) {
      return res.status(403).json({ error: 'You do not administer this group' });
    }

    const membership = await GroupMembership.findOne({ where: { groupId: group.id, userId: req.params.userId } });
    if (!membership) return res.status(404).json({ error: 'Membership not found' });

    if (membership.role === 'admin' && value.role === 'member') {
      const adminCount = await GroupMembership.count({ where: { groupId: group.id, role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last remaining group admin' });
      }
    }

    await membership.update({ role: value.role });
    await audit.log({ userId: req.user.id, action: 'update_group_member_role', details: { groupId: group.id, targetUserId: req.params.userId, newRole: value.role }, status: 'success' });

    res.json(membership);
  } catch (err) {
    logger.error({ err: err.message }, 'Update group member error');
    res.status(500).json({ error: 'Failed to update group member' });
  }
});

router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const { Group, GroupMembership } = loadModels();
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!(await canManageGroup(req.user, group.id))) {
      return res.status(403).json({ error: 'You do not administer this group' });
    }

    const membership = await GroupMembership.findOne({ where: { groupId: group.id, userId: req.params.userId } });
    if (!membership) return res.status(404).json({ error: 'Membership not found' });

    if (membership.role === 'admin') {
      const adminCount = await GroupMembership.count({ where: { groupId: group.id, role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last remaining group admin' });
      }
    }

    await membership.destroy();
    await audit.log({ userId: req.user.id, action: 'remove_group_member', details: { groupId: group.id, targetUserId: req.params.userId }, status: 'success' });

    res.json({ message: 'Member removed' });
  } catch (err) {
    logger.error({ err: err.message }, 'Remove group member error');
    res.status(500).json({ error: 'Failed to remove group member' });
  }
});

module.exports = router;
