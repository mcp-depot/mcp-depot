const path = require('path');

const TYPE_TO_ADAPTER = {
  jenkins: 'jenkins',
  github: 'github_actions',
  bitbucket: 'bitbucket_pipelines'
};

const KNOWN = Object.keys(TYPE_TO_ADAPTER);

async function loadAdapter(integrationType) {
  const adapterFile = TYPE_TO_ADAPTER[integrationType];
  if (!adapterFile) {
    throw new Error(`Unknown watcher source: ${integrationType}. Known sources: ${KNOWN.join(', ')}`);
  }
  const mod = require(path.join(__dirname, `${adapterFile}.js`));
  return mod.default || mod;
}

module.exports = { loadAdapter, KNOWN };
