const crypto = require('crypto');
const { Op } = require('sequelize');
const config = require('../config/env');
const logger = require('./logger');
const { checkSlidingWindow } = require('./rate-limiter');
const { sequelize } = require('../config/database');
const PolicyRule = require('../models/PolicyRule');
const PolicyDecision = require('../models/PolicyDecision');
const PolicyChainState = require('../models/PolicyChainState');

// Generic policy decision point (PDP) for MCP Depot. Not tied to tools -
// resourceType/action are free strings so any resource (tool, session
// context, session channel, and anything added later) can reuse this same
// engine without a schema or code change to the engine itself. See
// PolicyRule/PolicyDecision/PolicyChainState models for the storage shape.

function matchesResource(resourceMatch, resourceId) {
  if (resourceMatch === '*') return true;
  if (resourceMatch.endsWith('*')) {
    return resourceId.startsWith(resourceMatch.slice(0, -1));
  }
  return resourceMatch === resourceId;
}

function matchesSubject(rule, user) {
  if (rule.subjectType === '*') return true;
  if (rule.subjectType === 'role') return rule.subjectId === user.role;
  if (rule.subjectType === 'user') return rule.subjectId === user.id;
  return false;
}

// Registry-style scoring instead of an if/else precedence chain - each
// dimension contributes independently, so adding a new dimension later
// doesn't require re-deriving the whole ordering by hand.
function specificity(rule) {
  let score = 0;
  score += rule.resourceType === '*' ? 0 : 100;
  if (rule.resourceMatch === '*') score += 0;
  else if (rule.resourceMatch.endsWith('*')) score += 20;
  else score += 40;
  score += rule.action === '*' ? 0 : 10;
  if (rule.subjectType === 'user') score += 4;
  else if (rule.subjectType === 'role') score += 2;
  return score;
}

// Most specific wins. Equal specificity: deny wins over allow/limit (safety
// default when two rules are equally applicable), then higher priority,
// then most recently created as a last, arbitrary tie-break for determinism.
function pickWinningRule(candidates) {
  return [...candidates].sort((a, b) => {
    const sa = specificity(a), sb = specificity(b);
    if (sa !== sb) return sb - sa;
    const da = a.effect === 'deny' ? 1 : 0;
    const db = b.effect === 'deny' ? 1 : 0;
    if (da !== db) return db - da;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return new Date(b.createdAt) - new Date(a.createdAt);
  })[0];
}

function evaluateLimit(rule, user) {
  const cfg = rule.limitConfig || {};
  const key = `policy:${rule.id}:${user.id}`;

  // Checking (and, on success, incrementing) maxPerHour before maxPerDay
  // means a call that passes the hour window but fails the day window has
  // already incremented the hour counter - the same minor over-count that
  // checkRateLimit's own multi-tier check already accepts (see
  // rate-limiter.js). Kept consistent rather than adding asymmetric rigor
  // to just this one caller.
  if (cfg.maxPerHour) {
    const hourResult = checkSlidingWindow(`${key}:hour`, cfg.maxPerHour, 60 * 60 * 1000);
    if (!hourResult.allowed) return { allowed: false, reason: `Exceeded ${cfg.maxPerHour}/hour limit` };
  }
  if (cfg.maxPerDay) {
    const dayResult = checkSlidingWindow(`${key}:day`, cfg.maxPerDay, 24 * 60 * 60 * 1000);
    if (!dayResult.allowed) return { allowed: false, reason: `Exceeded ${cfg.maxPerDay}/day limit` };
  }
  return { allowed: true };
}

// Deterministic, deep key-sorted JSON so recomputing a record's hash during
// verification always reproduces the same bytes regardless of how the
// object was constructed in memory.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

function computeHash(previousHash, fields) {
  const canonical = JSON.stringify(canonicalize({ previousHash: previousHash || '', ...fields }));
  return crypto.createHmac('sha256', config.policySigningKey).update(canonical).digest('hex');
}

async function recordDecision(fields) {
  return sequelize.transaction(async (t) => {
    const [chainState] = await PolicyChainState.findOrCreate({
      where: { id: 1 },
      defaults: { lastHash: null },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    const previousHash = chainState.lastHash;
    const recordHash = computeHash(previousHash, fields);

    const record = await PolicyDecision.create(
      { ...fields, previousHash, recordHash },
      { transaction: t }
    );

    await chainState.update({ lastHash: recordHash }, { transaction: t });

    return record;
  });
}

// The single entry point every call site uses, regardless of resourceType.
// Defaults to 'allow' when no rule matches - this is the backward-
// compatibility hinge: adopting this on a new resourceType changes nothing
// until an admin actually writes a rule for it.
//
// Fails CLOSED (denies) if the check itself errors, including if the
// decision record can't be written - the point of this gate is "no call
// without a verifiable record," so silently allowing on infra failure would
// defeat that guarantee exactly when it matters most (mid-incident).
async function checkPolicy({ user, resourceType, resourceId, action, requestContext = {} }) {
  try {
    const candidates = await PolicyRule.findAll({
      where: {
        isActive: true,
        resourceType: { [Op.in]: [resourceType, '*'] },
        action: { [Op.in]: [action, '*'] }
      }
    });

    const matching = candidates.filter(r => matchesResource(r.resourceMatch, resourceId) && matchesSubject(r, user));

    let decision = 'allow';
    let matchedRuleId = null;
    let reason = 'No matching policy rule - default allow';

    if (matching.length > 0) {
      const winner = pickWinningRule(matching);
      matchedRuleId = winner.id;

      if (winner.effect === 'deny') {
        decision = 'deny';
        reason = winner.description || `Denied by rule ${winner.id}`;
      } else if (winner.effect === 'limit') {
        const limitResult = evaluateLimit(winner, user);
        decision = limitResult.allowed ? 'allow' : 'deny';
        reason = limitResult.allowed
          ? (winner.description || `Within limit for rule ${winner.id}`)
          : (limitResult.reason || `Rate limit exceeded for rule ${winner.id}`);
      } else {
        decision = 'allow';
        reason = winner.description || `Allowed by rule ${winner.id}`;
      }
    }

    const record = await recordDecision({
      userId: user.id,
      resourceType,
      resourceId,
      action,
      decision,
      matchedRuleId,
      reason,
      requestContext
    });

    return { decision, reason, matchedRuleId, decisionId: record.id };
  } catch (err) {
    logger.error({ err: err.message, resourceType, resourceId, action, userId: user?.id }, 'Policy check failed - failing closed');
    return { decision: 'deny', reason: 'Policy check failed', matchedRuleId: null, decisionId: null, error: true };
  }
}

module.exports = { checkPolicy, canonicalize, computeHash };
