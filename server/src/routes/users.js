const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const logger = require('../services/logger');
const { auth, requireAdmin } = require('../middleware/auth');
const audit = require('../services/audit');

const router = express.Router();

const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().required(),
  role: Joi.string().valid('user', 'admin').default('user'),
  password: Joi.string().allow('').optional()
});

const updateUserSchema = Joi.object({
  email: Joi.string().email().optional(),
  name: Joi.string().optional(),
  role: Joi.string().valid('user', 'admin').optional(),
  password: Joi.string().allow('').optional()
});

router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({ 
      order: [['createdAt', 'ASC']],
      attributes: { exclude: ['password'] }
    });
    res.json(users);
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to fetch users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/', auth, requireAdmin, async (req, res) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, name, role, password } = value;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const crypto = require('crypto');
    const tempPassword = password || crypto.randomBytes(12).toString('base64url');

    const user = await User.create({
      email,
      name,
      role,
      password: tempPassword,
      mustResetPassword: !password
    });

    await audit.log({
      userId: req.user.id,
      action: 'create_user',
      integrationType: 'user_management',
      details: { targetUserId: user.id, email: user.email, role: user.role },
      status: 'success'
    });

    res.status(201).json({
      ...user.toJSON(),
      temporaryPassword: password ? undefined : tempPassword
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to create user');
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (value.email && value.email !== user.email) {
      const existing = await User.findOne({ where: { email: value.email } });
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const roleChanged = value.role !== undefined && value.role !== user.role;
    // Mirrors "leave empty to keep current" in the UI: an empty/absent
    // password must never overwrite the existing one. Only a genuinely
    // non-empty value is applied (and, like admin-created accounts with an
    // explicit password, doesn't force a reset - the admin now knows it).
    const { password, ...rest } = value;
    if (password) {
      rest.password = password;
      rest.mustResetPassword = false;
    }
    await user.update(rest);

    await audit.log({
      userId: req.user.id,
      action: roleChanged ? 'change_user_role' : 'update_user',
      integrationType: 'user_management',
      details: {
        targetUserId: user.id, email: user.email,
        ...(roleChanged ? { newRole: value.role } : {}),
        ...(password ? { passwordChanged: true } : {})
      },
      status: 'success'
    });

    res.json(user.toJSON());
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to update user');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.destroy();

    await audit.log({
      userId: req.user.id,
      action: 'delete_user',
      integrationType: 'user_management',
      details: { targetUserId: user.id, email: user.email },
      status: 'success'
    });

    res.json({ message: 'User deleted' });
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to delete user');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/:id/reset-password', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(12).toString('base64url');

    await user.update({
      password: tempPassword,
      mustResetPassword: true
    });

    await audit.log({
      userId: req.user.id,
      action: 'reset_user_password',
      integrationType: 'user_management',
      details: { targetUserId: user.id, email: user.email },
      status: 'success'
    });

    res.json({ temporaryPassword: tempPassword });
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to reset password');
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;