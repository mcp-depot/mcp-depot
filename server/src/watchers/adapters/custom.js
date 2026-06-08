const axios = require('axios');

function resolveTemplate(str, vars) {
  if (!str) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{{${key}}}`);
}

module.exports = {
  name: 'custom',
  defaults: {
    pollIntervalSeconds: 30,
    terminalStates: ['done', 'completed', 'success', 'failure', 'error', 'cancelled']
  },

  async poll(trigger, credentials) {
    const { pollUrl, statusField, terminalStates } = trigger;
    if (!pollUrl || !statusField) {
      throw new Error('Custom watcher requires trigger.pollUrl and trigger.statusField');
    }

    const resolvedUrl = resolveTemplate(pollUrl, trigger);
    const headers = credentials?.headers || {};
    const res = await axios.get(resolvedUrl, { headers, timeout: 10000 });
    const data = res.data;

    const status = statusField.split('.').reduce((obj, key) => obj?.[key], data);
    const terminals = terminalStates || this.defaults.terminalStates;
    const terminal = terminals.map(s => s.toLowerCase()).includes(String(status).toLowerCase());

    return { status: String(status), terminal };
  },

  async collectResult(trigger, status, credentials) {
    const { pollUrl, resultField } = trigger;
    const resolvedUrl = resolveTemplate(pollUrl, trigger);
    const headers = credentials?.headers || {};
    const res = await axios.get(resolvedUrl, { headers, timeout: 10000 });
    const data = res.data;

    const details = {
      finalResponse: resultField
        ? resultField.split('.').reduce((obj, key) => obj?.[key], data)
        : data
    };

    const summary = `Custom watcher ${resolvedUrl} — ${status}`;
    return { summary, details };
  }
};
