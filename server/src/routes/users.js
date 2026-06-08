const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const logger = require('../services/logger');
const { auth, requireAdmin } = require('../middleware/auth');

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
  role: Joi.string().valid('user', 'admin').optional()
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

    await user.update(value);
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

    res.json({ temporaryPassword: tempPassword });
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to reset password');
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;