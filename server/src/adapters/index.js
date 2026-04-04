const DynamicAdapter = require('./DynamicAdapter');

const ADAPTER_REGISTRY = {
  jira: DynamicAdapter,
  jenkins: DynamicAdapter,
  bitbucket: DynamicAdapter,
  github: DynamicAdapter,
  gitlab: DynamicAdapter,
  custom: DynamicAdapter
};

class AdapterFactory {
  static create(type, config) {
    const AdapterClass = ADAPTER_REGISTRY[type] || ADAPTER_REGISTRY.custom;
    return new AdapterClass(config);
  }

  static register(type, AdapterClass) {
    ADAPTER_REGISTRY[type] = AdapterClass;
  }

  static getSupportedTypes() {
    return Object.keys(ADAPTER_REGISTRY);
  }
}

module.exports = AdapterFactory;
