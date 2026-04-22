const Tool = require('../models/Tool');
const Integration = require('../models/Integration');
const AdapterFactory = require('../adapters');
const secretStore = require('../services/secret-store');
const logger = require('./logger');
const encryption = require('./encryption');
const { pruneNulls } = require('./body-utils');

function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((current, key) => current?.[key], obj);
}

function resolveTemplate(template, context) {
  return String(template).replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], context);
    return value !== undefined ? value : `{{${path}}}`;
  });
}

function resolveInputs(inputMappings, inputs, stepResults) {
  const resolved = {};
  
  for (const [key, mapping] of Object.entries(inputMappings)) {
    switch (mapping.source) {
      case 'input':
        resolved[key] = inputs[mapping.key];
        break;
      case 'step':
        if (stepResults[mapping.stepId]) {
          resolved[key] = stepResults[mapping.stepId].extract[mapping.extractName];
        }
        break;
      case 'expression':
        resolved[key] = resolveTemplate(mapping.value, { inputs, steps: stepResults });
        break;
      case 'literal':
        resolved[key] = mapping.value;
        break;
      default:
        resolved[key] = undefined;
    }
  }
  
  return resolved;
}

function runExtractors(extractors, response, inputs, stepResults) {
  const extractions = {};
  
  if (!extractors || extractors.length === 0) {
    return extractions;
  }
  
  for (const extractor of extractors) {
    const context = { inputs, steps: stepResults };
    
    const arrayPath = resolveTemplate(extractor.arrayPath || '', context);
    let array = getPath(response, arrayPath);
    
    if (!Array.isArray(array)) {
      extractions[extractor.name] = null;
      continue;
    }
    
    const filterValue = resolveTemplate(extractor.filterValue || '', context);
    const matchedItem = array.find(item => {
      const fieldValue = getPath(item, extractor.filterField);
      return String(fieldValue).toLowerCase() === String(filterValue).toLowerCase();
    });
    
    if (matchedItem) {
      extractions[extractor.name] = getPath(matchedItem, extractor.selectField);
    } else {
      extractions[extractor.name] = null;
    }
  }
  
  return extractions;
}

async function executeSimpleTool(tool, inputs, userId) {
  const integration = await Integration.findByPk(tool.integrationId);
  
  if (!integration || !integration.isActive) {
    throw new Error('Integration is not active');
  }
  
  let config = { ...integration.config };
  
  if (userId) {
    const UserIntegrationCredentials = require('../models/UserIntegrationCredentials');
    const userCreds = await UserIntegrationCredentials.findOne({
      where: { userId, integrationId: integration.id, isActive: true }
    });
    
    if (userCreds?.credentials) {
      try {
        const decrypted = JSON.parse(encryption.decrypt(userCreds.credentials));
        config.auth = decrypted;
      } catch (e) {
        logger.warn({ err: e.message }, 'Failed to decrypt user credentials');
      }
    }
  }
  
  if (secretStore.isInitialized()) {
    const credentials = config.auth?.credentials;
    if (credentials) {
      for (const [key, value] of Object.entries(credentials)) {
        if (typeof value === 'string' && secretStore.isSecretRef(value)) {
          const resolved = await secretStore.resolveSecret(value);
          if (resolved) credentials[key] = resolved;
        }
      }
    }
  }
  
  const adapter = AdapterFactory.create(integration.type, {
    ...config,
    integrationId: integration.id
  }, { userId });
  
  let path = tool.endpoint.path;
  const queryParams = {};
  let bodyParams = tool.endpoint.body || {};
  const hasBodyTemplate = !!(tool.endpoint.body && Object.keys(tool.endpoint.body).length > 0);
  const bodyTemplateVars = new Set(
    (JSON.stringify(tool.endpoint.body || {}).match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1))
  );
  
  for (const [key, value] of Object.entries(inputs)) {
    if (value === null || value === undefined) continue;
    if (path.includes(`{${key}}`)) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    } else if (tool.endpoint.method !== 'GET') {
      if (!hasBodyTemplate && !bodyTemplateVars.has(key)) {
        bodyParams[key] = value;
      }
    } else {
      queryParams[key] = value;
    }
  }
  
  if (typeof bodyParams === 'object' && bodyParams !== null) {
    bodyParams = JSON.parse(JSON.stringify(bodyParams).replace(/"\{(\w+)\}"/g, (match, key) => {
      return inputs[key] !== undefined ? JSON.stringify(inputs[key]) : 'null';
    }));
    bodyParams = pruneNulls(bodyParams);
  }
  
  let result;
  switch (tool.endpoint.method) {
    case 'GET':
      result = await adapter.get(path, { params: queryParams });
      break;
    case 'POST':
      result = await adapter.post(path, bodyParams, { params: queryParams });
      break;
    case 'PUT':
      result = await adapter.put(path, bodyParams);
      break;
    case 'PATCH':
      result = await adapter.patch(path, bodyParams);
      break;
    case 'DELETE':
      result = await adapter.delete(path);
      break;
    default:
      throw new Error(`Unsupported method: ${tool.endpoint.method}`);
  }
  
  return result;
}

async function executeComposite(tool, inputs, userId) {
  if (!tool.steps || !Array.isArray(tool.steps)) {
    throw new Error('Composite tool has no steps defined');
  }
  
  const stepResults = {};
  const trace = [];
  
  for (const step of tool.steps) {
    const stepStartTime = Date.now();
    
    try {
      const simpleTool = await Tool.findByPk(step.toolId);
      
      if (!simpleTool) {
        throw new Error(`Step tool not found: ${step.toolId}`);
      }
      
      if (simpleTool.type === 'composite') {
        throw new Error('Cannot use a composite tool as a step');
      }
      
      const resolvedInputs = resolveInputs(step.inputMappings || {}, inputs, stepResults);
      const result = await executeSimpleTool(simpleTool, resolvedInputs, userId);
      const extractions = runExtractors(step.extractors || [], result, inputs, stepResults);
      
      stepResults[step.id] = { response: result, extract: extractions };
      
      trace.push({
        id: step.id,
        label: step.label,
        resolvedInputs,
        response: result,
        extractions,
        durationMs: Date.now() - stepStartTime,
        success: true
      });
    } catch (error) {
      trace.push({
        id: step.id,
        label: step.label,
        resolvedInputs: resolveInputs(step.inputMappings || {}, inputs, stepResults),
        error: error.message,
        durationMs: Date.now() - stepStartTime,
        success: false
      });
      
      return {
        error: `Composite tool failed at step "${step.label}": ${error.message}`,
        failedStep: step.id,
        failedStepLabel: step.label,
        completedSteps: trace.filter(s => s.success).map(s => s.id),
        trace
      };
    }
  }
  
  const lastStep = tool.steps[tool.steps.length - 1];
  const finalResult = stepResults[lastStep.id]?.response;
  
  return {
    result: finalResult,
    trace,
    totalDurationMs: trace.reduce((sum, s) => sum + s.durationMs, 0)
  };
}

async function executeCompositeTool(tool, inputs, userId) {
  if (tool.type !== 'composite') {
    return executeSimpleTool(tool, inputs, userId);
  }
  
  const execResult = await executeComposite(tool, inputs, userId);
  
  if (execResult.error) {
    throw new Error(execResult.error);
  }
  
  return execResult.result;
}

module.exports = {
  executeComposite,
  executeCompositeTool,
  resolveInputs,
  runExtractors,
  resolveTemplate,
  getPath
};
