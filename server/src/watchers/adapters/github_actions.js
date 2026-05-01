const axios = require('axios');

function getToken(credentials) {
  const creds = credentials?.auth?.credentials || {};
  const token = creds.token || creds.accessToken || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub integration missing token credential');
  return token;
}

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

module.exports = {
  name: 'github',
  defaults: {
    pollIntervalSeconds: 20,
    terminalStates: ['completed', 'cancelled']
  },

  async poll(trigger, credentials) {
    const token = getToken(credentials);
    const { repo, runId } = trigger;
    const apiUrl = `https://api.github.com/repos/${repo}/actions/runs/${runId}`;

    const res = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      timeout: 10000
    });

    const { status, conclusion } = res.data;

    if (status === 'in_progress' || status === 'queued' || status === 'waiting') {
      return { status: status.toUpperCase(), terminal: false };
    }

    const terminalStatus = conclusion || status;
    return { status: terminalStatus, terminal: true };
  },

  async collectResult(trigger, status, credentials) {
    const token = getToken(credentials);
    const { repo, runId } = trigger;
    const apiUrl = `https://api.github.com/repos/${repo}/actions/runs/${runId}`;

    const res = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      timeout: 10000
    });

    const run = res.data;
    const details = {
      duration: fmtDuration((new Date(run.updated_at) - new Date(run.created_at)) / 1000),
      runUrl: run.html_url,
      conclusion: run.conclusion
    };

    try {
      const jobsRes = await axios.get(`${apiUrl}/jobs`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        timeout: 10000
      });
      const failedJobs = (jobsRes.data.jobs || []).filter(j => j.conclusion === 'failure');
      if (failedJobs.length > 0) {
        details.failedJobs = failedJobs.map(j => j.name);
      }
    } catch {
      // Jobs API may not be available
    }

    const summary = `GitHub Actions run ${repo} #${runId} — ${status}`;
    return { summary, details };
  }
};
