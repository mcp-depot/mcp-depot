const registry = new Set();

export const track = (proc) => {
  registry.add(proc);
  proc.on('exit', () => registry.delete(proc));
};

export const killAll = async () => {
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

export const getActiveCount = () => registry.size;