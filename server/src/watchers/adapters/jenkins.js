const axios = require('axios');

function getBaseUrl(credentials) {
  const baseUrl = credentials?.baseUrl || credentials?.config?.baseUrl;
  if (!baseUrl) throw new Error('Jenkins integration missing baseUrl');
  return baseUrl.replace(/\/+$/, '');
}

function getAuth(credentials) {
  const creds = credentials?.auth?.credentials || {};
  const user = creds.username || creds.user || process.env.JENKINS_USER;
  const token = creds.token || creds.password || process.env.JENKINS_TOKEN;
  if (!user || !token) throw new Error('Jenkins integration missing credentials (username + token/password)');
  return { auth: { username: user, password: token } };
}

function fmtDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

module.exports = {
  name: 'jenkins',
  defaults: {
    pollIntervalSeconds: 15,
    terminalStates: ['SUCCESS', 'FAILURE', 'ABORTED', 'UNSTABLE']
  },

  async poll(trigger, credentials) {
    const baseUrl = getBaseUrl(credentials);
    const { job, build } = trigger;
    const jobPath = job.includes('/') ? job.replace(/\//g, '/job/') : job;
    const apiUrl = `${baseUrl}/job/${jobPath}/${build}/api/json`;

    const res = await axios.get(apiUrl, { ...getAuth(credentials), timeout: 10000 });
    const { result, building } = res.data;

    if (building) {
      const progress = res.data.executor ? res.data.executor.progress : -1;
      const progressStr = progress >= 0 ? `${progress}% complete` : 'in progress';
      return { status: 'RUNNING', terminal: false, progress: progressStr };
    }

    return { status: result, terminal: true };
  },

  async collectResult(trigger, status, credentials) {
    const baseUrl = getBaseUrl(credentials);
    const { job, build } = trigger;
    const jobPath = job.includes('/') ? job.replace(/\//g, '/job/') : job;
    const base = `${baseUrl}/job/${jobPath}/${build}`;

    const details = {};

    if (status === 'FAILURE') {
      try {
        const wfapiRes = await axios.get(`${base}/wfapi/describe`, { ...getAuth(credentials), timeout: 10000 });
        const stages = wfapiRes.data.stages || [];
        const failedStage = stages.find(s => s.status === 'FAILED');
        if (failedStage) {
          details.failedStage = failedStage.name;
          details.failedStageError = failedStage.error?.message || null;
        }
      } catch {
        details.failedStage = 'unknown (wfapi unavailable)';
      }

      try {
        const consoleRes = await axios.get(`${base}/consoleText`, { ...getAuth(credentials), timeout: 10000 });
        const lines = consoleRes.data.split('\n');
        const lastLines = lines.slice(-40).join('\n');
        details.consoleExcerpt = lastLines;
      } catch {
        details.consoleExcerpt = 'Console output unavailable';
      }
    }

    try {
      const buildRes = await axios.get(`${base}/api/json`, { ...getAuth(credentials), timeout: 10000 });
      const bd = buildRes.data;
      details.duration = fmtDuration(bd.duration || 0);
      details.buildUrl = bd.url || `${base}/`;
      details.artifactUrls = (bd.artifacts || []).map(a => `${base}/artifact/${a.relativePath}`);
    } catch {
      details.buildUrl = `${base}/`;
    }

    const summary = `Jenkins build ${job} #${build} — ${status}${details.failedStage ? ` (failed stage: ${details.failedStage})` : ''}`;

    return { summary, details };
  }
};
