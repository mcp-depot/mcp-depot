const express = require('express');
const Joi = require('joi');
const { auth, requireAdmin } = require('../middleware/auth');
const { loadModels } = require('../config/database');
const logger = require('../services/logger');
const { verifyPolicyChain } = require('../services/policy-chain-verify');

const router = express.Router();

// resourceType/action are deliberately free strings, not a Joi .valid(...)
// enum - the whole point of the design is that a brand new resource type
// can adopt policy enforcement without a schema or validation change here.
const createRuleSchema = Joi.object({
  resourceType: Joi.string().max(50).required(),
  resourceMatch: Joi.string().max(255).default('*'),
  action: Joi.string().max(50).default('*'),
  subjectType: Joi.string().valid('user', 'role', 'group', '*').required(),
  subjectId: Joi.string().max(255).allow(null, ''),
  effect: Joi.string().valid('allow', 'deny', 'limit').required(),
  limitConfig: Joi.object({
    maxPerHour: Joi.number().integer().positive(),
    maxPerDay: Joi.number().integer().positive()
  }).allow(null),
  priority: Joi.number().integer().default(0),
  isActive: Joi.boolean().default(true),
  description: Joi.string().max(2000).allow('', null)
});

const updateRuleSchema = Joi.object({
  resourceType: Joi.string().max(50),
  resourceMatch: Joi.string().max(255),
  action: Joi.string().max(50),
  subjectType: Joi.string().valid('user', 'role', 'group', '*'),
  subjectId: Joi.string().max(255).allow(null, ''),
  effect: Joi.string().valid('allow', 'deny', 'limit'),
  limitConfig: Joi.object({
    maxPerHour: Joi.number().integer().positive(),
    maxPerDay: Joi.number().integer().positive()
  }).allow(null),
  priority: Joi.number().integer(),
  isActive: Joi.boolean(),
  description: Joi.string().max(2000).allow('', null)
}).min(1);

// Cross-field rules Joi's simple schema shape here doesn't express -
// validated against the fully-merged rule (existing + partial update, for
// PUT) so changing just one half of a pair can't leave the other stale.
function validateRuleCrossFields(value) {
  if (value.subjectType !== '*' && !value.subjectId) {
    return 'subjectId is required when subjectType is "user", "role", or "group"';
  }
  if (value.subjectType === '*' && value.subjectId) {
    return 'subjectId must be empty when subjectType is "*"';
  }
  if (value.effect === 'limit' && (!value.limitConfig || (!value.limitConfig.maxPerHour && !value.limitConfig.maxPerDay))) {
    return 'limitConfig with at least one of maxPerHour/maxPerDay is required when effect is "limit"';
  }
  return null;
}

router.get('/rules', auth, requireAdmin, async (req, res) => {
  try {
    const { PolicyRule } = loadModels();
    const where = {};
    if (req.query.resourceType) where.resourceType = req.query.resourceType;

    const rules = await PolicyRule.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json(rules);
  } catch (err) {
    logger.error({ err: err.message }, 'List policy rules error');
    res.status(500).json({ error: 'Failed to list policy rules' });
  }
});

router.post('/rules', auth, requireAdmin, async (req, res) => {
  try {
    const { error, value } = createRuleSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const crossFieldError = validateRuleCrossFields(value);
    if (crossFieldError) return res.status(400).json({ error: crossFieldError });

    const { PolicyRule } = loadModels();
    const rule = await PolicyRule.create({ ...value, createdBy: req.user.id });

    logger.info({ userId: req.user.id, ruleId: rule.id, resourceType: rule.resourceType, effect: rule.effect }, 'Policy rule created');
    res.status(201).json(rule);
  } catch (err) {
    logger.error({ err: err.message }, 'Create policy rule error');
    res.status(500).json({ error: 'Failed to create policy rule' });
  }
});

router.put('/rules/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { PolicyRule } = loadModels();
    const rule = await PolicyRule.findByPk(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Policy rule not found' });

    if (rule.isSystemManaged) {
      return res.status(403).json({ error: 'This rule is system-managed and cannot be edited' });
    }

    const { error, value } = updateRuleSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const merged = { ...rule.toJSON(), ...value };
    const crossFieldError = validateRuleCrossFields(merged);
    if (crossFieldError) return res.status(400).json({ error: crossFieldError });

    await rule.update(value);
    logger.info({ userId: req.user.id, ruleId: rule.id }, 'Policy rule updated');
    res.json(rule);
  } catch (err) {
    logger.error({ err: err.message }, 'Update policy rule error');
    res.status(500).json({ error: 'Failed to update policy rule' });
  }
});

router.delete('/rules/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { PolicyRule } = loadModels();
    const rule = await PolicyRule.findByPk(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Policy rule not found' });

    if (rule.isSystemManaged) {
      return res.status(403).json({ error: 'This rule is system-managed and cannot be deleted' });
    }

    await rule.destroy();
    logger.info({ userId: req.user.id, ruleId: req.params.id }, 'Policy rule deleted');
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Delete policy rule error');
    res.status(500).json({ error: 'Failed to delete policy rule' });
  }
});

router.get('/decisions', auth, requireAdmin, async (req, res) => {
  try {
    const { PolicyDecision, User, PolicyRule } = loadModels();
    const { resourceType, resourceId, decision, userId } = req.query;
    const where = {};
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;
    if (decision) where.decision = decision;
    if (userId) where.userId = userId;

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const { count, rows } = await PolicyDecision.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'name'] },
        { model: PolicyRule, as: 'matchedRule', attributes: ['id', 'description', 'effect'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({ total: count, decisions: rows });
  } catch (err) {
    logger.error({ err: err.message }, 'List policy decisions error');
    res.status(500).json({ error: 'Failed to list policy decisions' });
  }
});

router.get('/decisions/verify-chain', auth, requireAdmin, async (req, res) => {
  try {
    const result = await verifyPolicyChain();
    res.json(result);
  } catch (err) {
    logger.error({ err: err.message }, 'Policy chain verification error');
    res.status(500).json({ error: 'Failed to verify policy chain' });
  }
});

module.exports = router;
