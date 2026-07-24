const logger = require('./logger');

const FAILURE_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10) || 5;
const COOLDOWN_MS = parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS, 10) || 30000;

// Per-integration breaker state. Adapter instances are created fresh per call,
// so this has to live at module scope to actually accumulate failures across calls.
const state = new Map();

function isOpen(integrationId) {
  if (!integrationId) return false;
  const entry = state.get(integrationId);
  if (!entry || !entry.openUntil) return false;
  if (Date.now() < entry.openUntil) return true;
  // Cooldown elapsed - let one trial request through (half-open).
  entry.openUntil = null;
  entry.failures = 0;
  return false;
}

function recordSuccess(integrationId) {
  if (!integrationId) return;
  state.delete(integrationId);
}

function recordFailure(integrationId) {
  if (!integrationId) return;
  const entry = state.get(integrationId) || { failures: 0, openUntil: null };
  entry.failures++;
  if (entry.failures >= FAILURE_THRESHOLD && !entry.openUntil) {
    entry.openUntil = Date.now() + COOLDOWN_MS;
    logger.warn({ integrationId, failures: entry.failures, cooldownMs: COOLDOWN_MS }, 'Circuit breaker opened for integration');
  }
  state.set(integrationId, entry);
}

function getStatus() {
  const now = Date.now();
  return [...state.entries()].map(([integrationId, entry]) => ({
    integrationId,
    failures: entry.failures,
    open: !!(entry.openUntil && now < entry.openUntil),
    reopensInSeconds: entry.openUntil ? Math.max(0, Math.ceil((entry.openUntil - now) / 1000)) : 0
  }));
}

module.exports = { isOpen, recordSuccess, recordFailure, getStatus };
