// Same shape as server/src/services/process-registry.js. Unlike that copy
// (whose track() is never actually called from anywhere in server.js today -
// a pre-existing, separate issue, not fixed here), this one's track() is
// called from every spawn in spawn-bridge.js, so killAll() on shutdown
// actually terminates every process this sidecar has spawned.
const registry = new Set();

const track = (proc) => {
  registry.add(proc);
  proc.on('exit', () => registry.delete(proc));
};

const killAll = async () => {
  for (const proc of registry) {
    try {
      proc.kill('SIGTERM');
    } catch (e) {
      // ignore
    }
  }

  await new Promise(r => setTimeout(r, 2000));

  for (const proc of registry) {
    try {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch (e) {
      // ignore
    }
  }

  registry.clear();
};

const getActiveCount = () => registry.size;

module.exports = { track, killAll, getActiveCount };
