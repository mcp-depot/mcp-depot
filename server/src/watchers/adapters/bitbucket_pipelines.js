const axios = require('axios');

function getAuth(credentials) {
  const creds = credentials?.auth?.credentials || {};
  const user = creds.username || creds.user || process.env.BITBUCKET_USER;
  const token = creds.token || creds.appToken || creds.password || process.env.BITBUCKET_APP_TOKEN;
  if (!user || !token) throw new Error('Bitbucket integration missing credentials (username + app token)');
  return { auth: { username: user, password: token } };
}

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

module.exports = {
  name: 'bitbucket',
  defaults: {
    pollIntervalSeconds: 20,
    terminalStates: ['SUCCESSFUL', 'FAILED', 'STOPPED', 'COMPLETED', 'EXPIRED']
  },

  async poll(trigger, credentials) {
    const { workspace, repoSlug, pipelineUuid } = trigger;
    const apiUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/pipelines/${pipelineUuid}`;

    const res = await axios.get(apiUrl, { ...getAuth(credentials), timeout: 10000 });
    const { state } = res.data;
    const status = state.name;
    const terminal = ['SUCCESSFUL', 'FAILED', 'STOPPED', 'COMPLETED', 'EXPIRED'].includes(status);

    return { status, terminal };
  },

  async collectResult(trigger, status, credentials) {
    const { workspace, repoSlug, pipelineUuid } = trigger;
    const apiUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/pipelines/${pipelineUuid}`;

    const res = await axios.get(apiUrl, { ...getAuth(credentials), timeout: 10000 });
    const pipeline = res.data;
    const details = {
      duration: pipeline.build_seconds ? fmtDuration(pipeline.build_seconds) : 'unknown',
      pipelineUrl: pipeline.links?.html?.href || `${apiUrl}`,
      state: pipeline.state
    };

    if (status === 'FAILED') {
      try {
        const stepsRes = await axios.get(`${apiUrl}/steps/`, { ...getAuth(credentials), timeout: 10000 });
        const failedSteps = (stepsRes.data.values || []).filter(s => s.state?.name === 'FAILED');
        if (failedSteps.length > 0) {
          details.failedSteps = failedSteps.map(s => s.name);
        }
      } catch {
        // Steps may not be available
      }
    }

    const summary = `Bitbucket Pipeline ${workspace}/${repoSlug} #${pipelineUuid.slice(0, 8)} — ${status}`;
    return { summary, details };
  }
};
