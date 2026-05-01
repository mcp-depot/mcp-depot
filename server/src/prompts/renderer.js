'use strict';

function renderTemplate(template, args) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key in args) return String(args[key]);
    return `{{${key}}}`;
  });
}

function applyDefaults(inputs, callerArgs) {
  const defaults = {};
  for (const input of inputs) {
    if (input.default != null) {
      defaults[input.name] = input.default;
    }
  }
  return { ...defaults, ...(callerArgs || {}) };
}

function validateRequired(inputs, args) {
  const missing = [];
  for (const input of inputs) {
    if (input.required && args[input.name] == null) {
      missing.push(input.name);
    }
  }
  return missing;
}

module.exports = { renderTemplate, applyDefaults, validateRequired };
