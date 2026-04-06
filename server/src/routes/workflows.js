const express = require('express');
const Joi = require('joi');
const { auth } = require('../middleware/auth');
const Workflow = require('../models/Workflow');
const Integration = require('../models/Integration');
const AdapterFactory = require('../adapters');
const audit = require('../services/audit');

const router = express.Router();

const workflowSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('', null),
  trigger: Joi.object({
    type: Joi.string().valid('manual', 'webhook', 'schedule').required(),
    config: Joi.object().default({})
  }).required(),
  actions: Joi.array().items(Joi.object({
    type: Joi.string().required(),
    config: Joi.object().required()
  })).min(1).required(),
  isActive: Joi.boolean().default(true)
});

const workflowExecutionSchema = Joi.object({
  inputs: Joi.object().default({})
});

const templateExecutionSchema = Joi.object({
  templateId: Joi.string().required(),
  name: Joi.string(),
  description: Joi.string().allow('', null)
});

const JENKINS_POLL_INTERVAL = 5000;
const JENKINS_MAX_WAIT = 300000;

async function waitForJenkinsBuild(adapter, buildUrl, maxWait = JENKINS_MAX_WAIT) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    try {
      const response = await adapter.get(buildUrl);
      const result = response.data?.result;
      const building = response.data?.building;
      
      if (!building && result) {
        return {
          complete: true,
          result: result,
          number: response.data?.number,
          url: buildUrl
        };
      }
    } catch (e) {
      console.error('Polling error:', e.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, JENKINS_POLL_INTERVAL));
  }
  
  return { complete: false, result: 'TIMEOUT', error: 'Build wait timed out' };
}

router.get('/templates', auth, async (req, res) => {
  const templates = [
    {
      id: 'dev-cycle',
      name: 'Development Cycle',
      description: 'JIRA → Confluence → Code → Git → Jenkins → JIRA (auto-retry on failure)',
      trigger: { type: 'manual', inputs: [
        { name: 'jiraTicket', label: 'JIRA Ticket', type: 'string', required: true, placeholder: 'e.g., PROJ-123' },
        { name: 'confluencePage', label: 'Confluence Page URL', type: 'string', required: false, placeholder: 'Optional: link from JIRA' }
      ]},
      actions: [
        { type: 'jira', action: 'fetchTicket', name: 'Fetch JIRA Ticket', inputMapping: { jiraTicket: '$.inputs.jiraTicket' } },
        { type: 'jira', action: 'transition', name: 'Start Progress', inputMapping: { jiraTicket: '$.inputs.jiraTicket', status: 'In Progress' } },
        { type: 'condition', name: 'Has Confluence Link', condition: '$.inputs.confluencePage',
          onSuccess: [
            { type: 'confluence', action: 'getPage', name: 'Read Confluence Page', inputMapping: { url: '$.inputs.confluencePage' } },
            { type: 'jira', action: 'addComment', name: 'Post Confluence Info', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: 'Implementation details fetched from Confluence' } }
          ],
          onFailure: [
            { type: 'jira', action: 'addComment', name: 'Post Note', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: 'No Confluence page provided - proceeding with JIRA description' } }
          ]
        },
        { type: 'loop', name: 'Build Retry Loop', maxIterations: 5, loopIndex: 5,
          actions: [
            { type: 'jira', action: 'addComment', name: 'Notify Build Attempt', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: '🔄 Attempting build...' } },
            { type: 'jenkins', action: 'triggerBuild', name: 'Trigger Jenkins Build', inputMapping: { jobName: 'PR-build' } },
            { type: 'wait', name: 'Wait for Build', config: { duration: 30000 } },
            { type: 'jenkins', action: 'getBuildStatus', name: 'Check Build Status' },
            { type: 'condition', name: 'Check Build Result', condition: '$.lastResult.result === "SUCCESS"',
              onSuccess: [
                { type: 'jira', action: 'addComment', name: 'Post Success', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: '✅ Build successful! Implementation complete.' } },
                { type: 'jira', action: 'transition', name: 'Mark Done', inputMapping: { jiraTicket: '$.inputs.jiraTicket', status: 'Done' } },
                { type: 'control', action: 'break', name: 'Exit Loop' }
              ],
              onFailure: [
                { type: 'jenkins', action: 'getConsole', name: 'Get Build Logs' },
                { type: 'jira', action: 'addComment', name: 'Post Failure', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: '❌ Build failed. Fix and push again to retry.' } }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'jira-github-sync',
      name: 'JIRA-GitHub Sync',
      description: 'Link GitHub PR to JIRA, update status on PR merge',
      trigger: { type: 'manual', inputs: [{ name: 'jiraTicket', label: 'JIRA Ticket', type: 'string', required: true }] },
      actions: [
        { type: 'jira', action: 'fetchTicket', name: 'Fetch Issue' },
        { type: 'github', action: 'createPR', name: 'Create PR' },
        { type: 'jira', action: 'addComment', name: 'Link PR' }
      ]
    }
  ];
  
  res.json(templates);
});

router.get('/', auth, async (req, res) => {
  try {
    const workflows = await Workflow.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    res.json(workflows);
  } catch (error) {
    console.error('List workflows error:', error);
    res.status(500).json({ error: 'Failed to list workflows' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const workflow = await Workflow.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = workflowSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, description, trigger, actions, isActive } = value;

    const workflow = await Workflow.create({
      userId: req.user.id,
      name,
      description,
      trigger: trigger || { type: 'manual' },
      actions,
      isActive: isActive !== false
    });

    res.status(201).json(workflow);
  } catch (error) {
    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { error, value } = workflowSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const workflow = await Workflow.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const { name, description, trigger, actions, isActive } = value;

    if (name) workflow.name = name;
    if (description !== undefined) workflow.description = description;
    if (trigger) workflow.trigger = trigger;
    if (actions) workflow.actions = actions;
    if (isActive !== undefined) workflow.isActive = isActive;

    await workflow.save();

    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const workflow = await Workflow.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await workflow.destroy();

    res.json({ message: 'Workflow deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

router.post('/:id/execute', auth, async (req, res) => {
  try {
    const { error, value } = workflowExecutionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const workflow = await Workflow.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const { inputs } = value;
    const results = [];
    const errors = [];

    let userIntegrations = {};
    if (req.user) {
      const allIntegrations = await Integration.findAll({
        where: { userId: req.user.id, isActive: true }
      });
      allIntegrations.forEach(int => {
        userIntegrations[int.type] = int;
      });
    }

    function evaluateCondition(condition, context) {
      if (!condition) return false;
      try {
        if (condition.includes('$.lastResult')) {
          const result = context?.data?.result || context?.result || context;
          return eval(condition.replace(/\$\.lastResult/g, JSON.stringify(result)));
        }
        if (condition.includes('$.inputs.')) {
          return eval(condition.replace(/\$\.inputs\.(\w+)/g, 'inputs.$1'));
        }
        return eval(condition);
      } catch (e) {
        return false;
      }
    }

    async function executeAction(action, userIntegrations, inputs) {
      if (action.type === 'wait') {
        const duration = action.config?.duration || 5000;
        await new Promise(resolve => setTimeout(resolve, duration));
        return `Waited for ${duration}ms`;
      }

      if (action.type === 'control') {
        return { action: action.action };
      }

      let integration = null;
      
      if (action.integrationId) {
        integration = await Integration.findByPk(action.integrationId);
      } else if (action.type && userIntegrations[action.type]) {
        integration = userIntegrations[action.type];
      }
      
      if (!integration || !integration.isActive) {
        throw new Error(`Integration not found or inactive (type: ${action.type || action.integrationId})`);
      }

      const adapter = AdapterFactory.create(integration.type, integration.config);

      let result;
      const method = action.method || 'GET';
      const body = action.body || {};

      const resolvedParams = {};
      if (action.params) {
        Object.entries(action.params).forEach(([key, value]) => {
          if (typeof value === 'string' && value.includes('$.inputs.')) {
            const inputKey = value.replace('$.inputs.', '');
            resolvedParams[key] = inputs[inputKey] || value;
          } else {
            resolvedParams[key] = value;
          }
        });
      }

      const resolvedBody = {};
      if (action.inputMapping) {
        Object.entries(action.inputMapping).forEach(([key, value]) => {
          if (typeof value === 'string' && value.includes('$.inputs.')) {
            const inputKey = value.replace('$.inputs.', '');
            resolvedBody[key] = inputs[inputKey] || value;
          } else {
            resolvedBody[key] = value;
          }
        });
      }

      switch (method) {
        case 'GET':
          result = await adapter.get(action.endpoint, { params: resolvedParams });
          break;
        case 'POST':
          result = await adapter.post(action.endpoint, Object.keys(resolvedBody).length ? resolvedBody : body, { params: resolvedParams });
          break;
        case 'PUT':
          result = await adapter.put(action.endpoint, body, { params: resolvedParams });
          break;
        case 'PATCH':
          result = await adapter.patch(action.endpoint, body, { params: resolvedParams });
          break;
        case 'DELETE':
          result = await adapter.delete(action.endpoint, { params: resolvedParams });
          break;
      }

      return result;
    }

    for (let i = 0; i < workflow.actions.length; i++) {
      const action = workflow.actions[i];
      
      if (action.type === 'loop') {
        const maxIterations = action.maxIterations || 3;
        const loopActions = action.actions || [];
        
        for (let iter = 1; iter <= maxIterations; iter++) {
          results.push({ actionIndex: i, actionName: action.name, result: `Starting iteration ${iter}/${maxIterations}`, success: true, iteration: iter });
          
          for (let j = 0; j < loopActions.length; j++) {
            const loopAction = loopActions[j];
            
            if (loopAction.type === 'control' && loopAction.action === 'break') {
              results.push({ actionIndex: i, actionName: loopAction.name, result: 'Exiting loop (build successful)', success: true, iteration: iter });
              break;
            }
            
            try {
              const loopResult = await executeAction(loopAction, userIntegrations, inputs);
              results.push({ actionIndex: i, actionName: loopAction.name, result: loopResult, success: true, iteration: iter });
              
              if (loopAction.condition) {
                const conditionMet = evaluateCondition(loopAction.condition, loopResult);
                const branchActions = conditionMet ? loopAction.onSuccess : loopAction.onFailure;
                
                if (branchActions) {
                  for (const branchAction of branchActions) {
                    if (branchAction.type === 'control' && branchAction.action === 'break') {
                      results.push({ actionIndex: i, actionName: branchAction.name, result: 'Exiting loop', success: true, iteration: iter });
                      break;
                    }
                    
                    const branchResult = await executeAction(branchAction, userIntegrations, inputs);
                    results.push({ actionIndex: i, actionName: branchAction.name, result: branchResult, success: true, iteration: iter });
                  }
                }
              }
            } catch (error) {
              errors.push({ actionIndex: i, actionName: loopAction.name, error: error.message, iteration: iter });
              results.push({ actionIndex: i, actionName: loopAction.name, error: error.message, success: false, iteration: iter });
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        continue;
      }
      
      if (action.type === 'condition') {
        const lastResult = results[results.length - 1]?.result;
        const conditionMet = evaluateCondition(action.condition, lastResult);
        const branchActions = conditionMet ? action.onSuccess : action.onFailure;
        
        if (branchActions) {
          for (const branchAction of branchActions) {
            if (branchAction.type === 'control' && branchAction.action === 'break') continue;
            
            try {
              const branchResult = await executeAction(branchAction, userIntegrations, inputs);
              results.push({ actionIndex: i, actionName: branchAction.name, result: branchResult, success: true });
            } catch (error) {
              errors.push({ actionIndex: i, actionName: branchAction.name, error: error.message });
              results.push({ actionIndex: i, actionName: branchAction.name, error: error.message, success: false });
            }
          }
        }
        continue;
      }
      
      try {
        const result = await executeAction(action, userIntegrations, inputs);
        results.push({ actionIndex: i, actionName: action.name, result, success: true });
      } catch (error) {
        errors.push({ actionIndex: i, actionName: action.name, error: error.message });
        results.push({ actionIndex: i, actionName: action.name, error: error.message, success: false });
      }
    }

    workflow.lastExecutedAt = new Date();
    await workflow.save();

    await audit.log({
      userId: req.user.id,
      action: 'execute_workflow',
      details: { workflowId: workflow.id, workflowName: workflow.name, results },
      status: errors.length > 0 ? 'failure' : 'success'
    });

    res.json({
      workflowName: workflow.name,
      executedAt: workflow.lastExecutedAt,
      results,
      errors
    });
  } catch (error) {
    console.error('Execute workflow error:', error);
    res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

router.post('/from-template', auth, async (req, res) => {
  try {
    const { error, value } = templateExecutionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { templateId, name, description } = value;
    
    const templates = [
      {
        id: 'dev-cycle',
        name: 'Development Cycle',
        description: 'JIRA → Confluence → Code → Git → Jenkins → JIRA (auto-retry)',
        trigger: { type: 'manual', inputs: [
          { name: 'jiraTicket', label: 'JIRA Ticket', type: 'string', required: true, placeholder: 'e.g., PROJ-123' },
          { name: 'confluencePage', label: 'Confluence Page URL', type: 'string', required: false, placeholder: 'Optional' }
        ]},
        actions: [
          { type: 'jira', action: 'fetchTicket', name: 'Fetch JIRA Ticket', inputMapping: { jiraTicket: '$.inputs.jiraTicket' } },
          { type: 'jira', action: 'transition', name: 'Start Progress', inputMapping: { jiraTicket: '$.inputs.jiraTicket', status: 'In Progress' } },
          { type: 'condition', name: 'Has Confluence Link', condition: '$.inputs.confluencePage',
            onSuccess: [
              { type: 'confluence', action: 'getPage', name: 'Read Confluence Page', inputMapping: { url: '$.inputs.confluencePage' } },
              { type: 'jira', action: 'addComment', name: 'Post Confluence Info', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: 'Implementation details fetched from Confluence' } }
            ],
            onFailure: [
              { type: 'jira', action: 'addComment', name: 'Post Note', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: 'No Confluence page provided' } }
            ]
          },
          { type: 'loop', name: 'Build Retry Cycle (max 5 attempts)', maxIterations: 5,
            actions: [
              { type: 'jira', action: 'addComment', name: 'Request Code Push', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: '🔄 Ready for code. Push changes to trigger build.' } },
              { type: 'wait', name: 'Wait for Code Push', config: { duration: 10000 } },
              { type: 'jenkins', action: 'triggerBuild', name: 'Trigger Jenkins Build', inputMapping: { jobName: 'PR-build' } },
              { type: 'wait', name: 'Wait for Build', config: { duration: 30000 } },
              { type: 'jenkins', action: 'getBuildStatus', name: 'Check Build Status' },
              { type: 'condition', name: 'Check Build Result', condition: '$.lastResult.result === "SUCCESS"',
                onSuccess: [
                  { type: 'jira', action: 'addComment', name: 'Post Success', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: '✅ Build successful!' } },
                  { type: 'jira', action: 'transition', name: 'Mark Done', inputMapping: { jiraTicket: '$.inputs.jiraTicket', status: 'Done' } },
                  { type: 'control', action: 'break', name: 'Exit Loop' }
                ],
                onFailure: [
                  { type: 'jenkins', action: 'getConsole', name: 'Get Build Logs' },
                  { type: 'jira', action: 'addComment', name: 'Post Failure', inputMapping: { jiraTicket: '$.inputs.jiraTicket', comment: '❌ Build failed. Fix and push again.' } }
                ]
              }
            ]
          }
        ]
      }
    ];
    
    const template = templates.find(t => t.id === templateId);
    if (!template) {
      return res.status(400).json({ error: 'Template not found' });
    }
    
    const workflow = await Workflow.create({
      userId: req.user.id,
      name: name || template.name,
      description: description || template.description,
      trigger: template.trigger,
      actions: template.actions,
      isActive: true
    });
    
    res.status(201).json(workflow);
  } catch (error) {
    console.error('Create workflow from template error:', error);
    res.status(500).json({ error: 'Failed to create workflow from template' });
  }
});

module.exports = router;
