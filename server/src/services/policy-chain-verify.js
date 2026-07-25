const { computeHash } = require('./policy');
const PolicyDecision = require('../models/PolicyDecision');

// Walks every PolicyDecision in insertion order and recomputes each record's
// hash from its stored fields, confirming it matches both the stored
// recordHash and the previous record's hash - the concrete mechanism behind
// "an auditor can verify this wasn't tampered with." Used by the
// /policy/decisions/verify-chain endpoint and available for a standalone
// CLI script later.
async function verifyPolicyChain() {
  const records = await PolicyDecision.findAll({ order: [['createdAt', 'ASC']] });

  let expectedPrevious = null;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (record.previousHash !== expectedPrevious) {
      return {
        valid: false,
        checked: i,
        total: records.length,
        brokenAtId: record.id,
        reason: 'previousHash does not match the prior record\'s hash - chain is forked or reordered'
      };
    }

    const recomputed = computeHash(record.previousHash, {
      userId: record.userId,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      action: record.action,
      decision: record.decision,
      matchedRuleId: record.matchedRuleId,
      reason: record.reason,
      requestContext: record.requestContext
    });

    if (recomputed !== record.recordHash) {
      return {
        valid: false,
        checked: i,
        total: records.length,
        brokenAtId: record.id,
        reason: 'recordHash does not match the recomputed hash - record contents changed after being written'
      };
    }

    expectedPrevious = record.recordHash;
  }

  return { valid: true, checked: records.length, total: records.length };
}

module.exports = { verifyPolicyChain };
