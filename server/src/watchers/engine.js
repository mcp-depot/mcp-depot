const logger = require('../services/logger');

const activeWatches = new Map();

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Watch cancelled'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Watch cancelled'));
    });
  });
}

async function runWatcher({ watchId, adapter, trigger, credentials, meta, onProgress, signal }) {
  const { pollIntervalSeconds, terminalStates } = adapter.defaults;
  const interval = meta?.pollIntervalSeconds ?? pollIntervalSeconds;
  const timeoutMs = (meta?.timeoutSeconds ?? 3600) * 1000;
  const deadline = Date.now() + timeoutMs;
  let elapsed = 0;

  activeWatches.set(watchId, {
    source: adapter.name,
    trigger,
    status: 'RUNNING',
    elapsed: 0,
    startedAt: Date.now()
  });

  try {
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error('Watch cancelled');

      const { status, terminal, progress } = await adapter.poll(trigger, credentials);
      elapsed += interval;

      const watch = activeWatches.get(watchId);
      if (watch) {
        watch.status = status;
        watch.elapsed = elapsed;
        watch.progress = progress;
      }

      onProgress({ status, progress, elapsed });

      if (terminal || terminalStates.includes(status)) {
        const result = await adapter.collectResult(trigger, status, credentials);
        watch.status = status;
        watch.completedAt = Date.now();
        watch.duration = elapsed;
        return { source: adapter.name, status, duration: fmtDuration(elapsed), ...result };
      }

      await sleep(interval * 1000, signal);
    }

    throw new Error(`Watch timed out after ${meta?.timeoutSeconds ?? 3600}s`);
  } finally {
    activeWatches.delete(watchId);
  }
}

function getActiveWatches() {
  const result = [];
  for (const [id, watch] of activeWatches.entries()) {
    result.push({ id, ...watch });
  }
  return result;
}

function cancelWatch(watchId) {
  const watch = activeWatches.get(watchId);
  if (watch) {
    watch.status = 'CANCELLED';
    watch.completedAt = Date.now();
    activeWatches.delete(watchId);
    return true;
  }
  return false;
}

module.exports = { runWatcher, getActiveWatches, cancelWatch, activeWatches };
