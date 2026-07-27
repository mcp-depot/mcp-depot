const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const logger = require('../services/logger');
const { runMigrations } = require('../migrations/runner');

let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    logging: false,
    dialect: 'postgres',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  const os = require('os');
  const storagePath = process.env.SQLITE_PATH
    || path.join(os.homedir(), '.mcp-depot', 'data.db');

  const dataDir = path.dirname(storagePath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false
  });
}

const IS_DEV = process.env.NODE_ENV === 'development';
let associationsDefined = false;

const loadModels = () => {
  const User = require('../models/User');
  const Integration = require('../models/Integration');
  const Tool = require('../models/Tool');
  const ToolCall = require('../models/ToolCall');
  const UserIntegrationCredentials = require('../models/UserIntegrationCredentials');
  const ExternalMcpServer = require('../models/ExternalMcpServer');
  const ExternalMcpTool = require('../models/ExternalMcpTool');
  const PromptLibrary = require('../models/PromptLibrary')(sequelize);
  const SystemSetting = require('../models/SystemSetting');
  const SessionContext = require('../models/SessionContext')(sequelize);
  const SessionChannel = require('../models/SessionChannel')(sequelize);
  const Agent = require('../models/Agent')(sequelize);
  const PolicyRule = require('../models/PolicyRule');
  const PolicyDecision = require('../models/PolicyDecision');
  const PolicyChainState = require('../models/PolicyChainState');
  const Group = require('../models/Group');
  const GroupMembership = require('../models/GroupMembership');

  if (!associationsDefined) {
    User.hasMany(Integration, { foreignKey: 'userId', as: 'integrations' });
    User.hasMany(Tool, { foreignKey: 'userId', as: 'tools' });
    User.hasMany(ExternalMcpServer, { foreignKey: 'userId', as: 'externalServers' });
    
    Integration.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    Integration.hasMany(Tool, { foreignKey: 'integrationId', as: 'tools' });
    
    Tool.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    Tool.belongsTo(Integration, { foreignKey: 'integrationId', as: 'integration' });
    
    ToolCall.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    ToolCall.belongsTo(Tool, { foreignKey: 'toolId', as: 'tool' });
    ToolCall.belongsTo(Integration, { foreignKey: 'integrationId', as: 'integration' });
    
    ExternalMcpServer.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    
    SessionContext.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
    
    Agent.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

    PolicyRule.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
    PolicyDecision.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    // constraints: false - the association is for the /policy/decisions
    // include (join) only. No DB-level FK: see PolicyDecision.js's
    // matchedRuleId comment for why this must stay a soft reference.
    PolicyDecision.belongsTo(PolicyRule, { foreignKey: 'matchedRuleId', as: 'matchedRule', constraints: false });

    Group.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
    Group.hasMany(GroupMembership, { foreignKey: 'groupId', as: 'members' });
    GroupMembership.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
    GroupMembership.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    GroupMembership.belongsTo(User, { foreignKey: 'addedBy', as: 'addedByUser' });

    associationsDefined = true;
  }

  return { User, Integration, Tool, ToolCall, UserIntegrationCredentials, ExternalMcpServer, ExternalMcpTool, PromptLibrary, SystemSetting, SessionContext, SessionChannel, Agent, PolicyRule, PolicyDecision, PolicyChainState, Group, GroupMembership };
};

const generatePassword = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(12).toString('base64url');
};

const createDefaultUser = async () => {
  const User = require('../models/User');
  
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mcp-depot.com';
  const adminExists = await User.findOne({ where: { email: adminEmail } });
  
  if (!adminExists) {
    const defaultPassword = process.env.ADMIN_PASSWORD || generatePassword();
    
    const adminUser = await User.create({
      email: adminEmail,
      password: defaultPassword,
      name: 'Administrator',
      role: 'admin',
      mustResetPassword: !process.env.ADMIN_PASSWORD
    });
    
    const apiKey = adminUser.generateApiKey();
    adminUser.apiKeyEnabled = true;
    await adminUser.save();
    
    logger.info('\n===========================================');
    logger.info('DEFAULT ADMIN USER CREATED');
    logger.info('===========================================');
    logger.info(`Email:    ${adminEmail}`);
    logger.info(`Password: ${defaultPassword}`);
    logger.info(`API Key:  ${apiKey}`);
    logger.info('===========================================');
    if (!process.env.ADMIN_PASSWORD) {
      logger.info('IMPORTANT: Change this password after first login!');
      logger.info('Use the API Key above for MCP client config or mcp-depot --login.');
      logger.info('===========================================\n');
    }
    
    return defaultPassword;
  }
  
  return null;
};

const createDefaultTool = async () => {
  const User = require('../models/User');
  const Integration = require('../models/Integration');
  const Tool = require('../models/Tool');
  
  let mcpDepotIntegration = await Integration.findOne({
    where: { name: 'MCP Depot' }
  });
  
  let userId;
  
  if (!mcpDepotIntegration) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@mcp-depot.com';
    const adminUser = await User.findOne({ where: { email: adminEmail } });
    
    if (!adminUser) {
      logger.info('Admin user not created yet');
      return;
    }
    
    userId = adminUser.id;
    
    mcpDepotIntegration = await Integration.create({
      userId: adminUser.id,
      type: 'custom',
      name: 'MCP Depot',
      visibility: 'shared',
      description: 'Built-in MCP Depot API',
      config: {
        baseUrl: `http://localhost:${process.env.PORT || 3000}`,
        auth: { type: 'none' }
      },
      isActive: true
    });
    
    await Tool.create({
      userId: adminUser.id,
      integrationId: mcpDepotIntegration.id,
      name: 'hello',
      description: 'Returns a hello world message from MCP Depot',
      endpoint: {
        path: '/api/mcp/hello',
        method: 'GET',
        params: {},
        headers: {}
      },
      isActive: true
    });
    
    await Tool.create({
      userId: adminUser.id,
      integrationId: mcpDepotIntegration.id,
      name: 'list-tools',
      description: 'List all available MCP Depot tools',
      endpoint: {
        path: '/api/mcp/tools',
        method: 'GET',
        params: {},
        headers: {}
      },
      isActive: true
    });
    
    await Tool.create({
      userId: adminUser.id,
      integrationId: mcpDepotIntegration.id,
      name: 'fetch-url',
      description: 'Fetch content from any URL and return as text. Supports HTML, JSON, XML, plain text. Use for: reading docs, fetching APIs, scraping web pages.',
      endpoint: {
        path: '/api/mcp/fetch-url',
        method: 'GET',
        params: {
          url: {
            type: 'string',
            required: true,
            description: 'URL to fetch (http or https)'
          },
          timeout: {
            type: 'number',
            required: false,
            description: 'Request timeout in milliseconds (default: 30000)'
          },
          maxSize: {
            type: 'number',
            required: false,
            description: 'Max response size in bytes (default: 5242880)'
          }
        },
        headers: {}
      },
      isActive: true
    });

    await Tool.create({
      userId: adminUser.id,
      integrationId: mcpDepotIntegration.id,
      name: 'list-skills',
      description: 'List all available skills that AI assistants can invoke',
      endpoint: {
        path: '/api/mcp/skills',
        method: 'GET',
        params: {},
        headers: {}
      },
      isActive: true
    });
    
    logger.info('Default MCP Depot tools created!\n');

    // Create MCP Depot Sessions integration (for session context + channel tools)
    let sessionsIntegration = await Integration.findOne({
      where: { name: 'MCP Depot Sessions' }
    });

    if (!sessionsIntegration) {
      sessionsIntegration = await Integration.create({
        userId: adminUser.id,
        type: 'custom',
        name: 'MCP Depot Sessions',
        visibility: 'shared',
        description: 'Session persistence tools — Contexts and Channels. Disable this integration to hide these tools from Claude.',
        config: {
          baseUrl: `http://localhost:${process.env.PORT || 3000}`,
          auth: { type: 'none' }
        },
        isActive: true
      });
    }

    // Seed session tools under MCP Depot Sessions
    const sessionTools = [
      {
        name: 'store-session-context',
        description: 'Save a named context to MCP Depot. Private by default — set shared=true to make it readable by any MCP Depot user. Pass ttlHours=0 to pin permanently. Default 168 hours (7 days).',
        endpoint: { path: '/api/mcp/session-contexts/store', method: 'POST', params: { name: { type: 'string', required: true, description: 'Unique human-readable key' }, content: { type: 'string', required: true, description: 'The context to store' }, shared: { type: 'boolean', required: false, description: 'If true, any MCP Depot user can read' }, ttlHours: { type: 'number', required: false, description: 'Hours until expiry. Default 168. Pass 0 to pin.' } }, headers: {} },
        inputSchema: {
          type: 'object',
          properties: {
            name:     { type: 'string',  description: 'Unique human-readable key, e.g. "bitbucket-debug"' },
            content:  { type: 'string',  description: 'The context to store — markdown, JSON, bullet list, anything' },
            shared:   { type: 'boolean', description: 'If true, any MCP Depot user can read this context. Default false.' },
            ttlHours: { type: 'number',  description: 'Hours until expiry. Default 168 (7 days). Pass 0 to pin permanently with no expiry.' }
          },
          required: ['name', 'content']
        }
      },
      {
        name: 'get-session-context',
        description: 'Retrieve a named context previously stored in MCP Depot.',
        endpoint: { path: '/api/mcp/session-contexts/get', method: 'GET', params: { name: { type: 'string', required: true, description: 'The context name' } }, headers: {} }
      },
      {
        name: 'list-session-contexts',
        description: 'List all named contexts stored in MCP Depot.',
        endpoint: { path: '/api/mcp/session-contexts/list', method: 'GET', params: {}, headers: {} }
      },
      {
        name: 'delete-session-context',
        description: 'Delete a named context from MCP Depot.',
        endpoint: { path: '/api/mcp/session-contexts/delete', method: 'DELETE', params: { name: { type: 'string', required: true, description: 'The context name' } }, headers: {} }
      },
      {
        name: 'append-to-channel',
        description: 'Post a message to a named session channel.',
        endpoint: { path: '/api/mcp/session-channels', method: 'POST', params: { channel: { type: 'string', required: true, description: 'Channel name' }, message: { type: 'string', required: true, description: 'The message' } }, headers: {} }
      },
      {
        name: 'read-channel',
        description: 'Read messages from a session channel.',
        endpoint: { path: '/api/mcp/session-channels/read', method: 'GET', params: { channel: { type: 'string', required: true, description: 'Channel name' }, since: { type: 'string', required: false, description: 'ISO timestamp for incremental reads' } }, headers: {} }
      },
      {
        name: 'list-channels',
        description: 'List all active session channels.',
        endpoint: { path: '/api/mcp/session-channels', method: 'GET', params: {}, headers: {} }
      },
      {
        name: 'clear-channel',
        description: 'Delete all messages in a session channel.',
        endpoint: { path: '/api/mcp/session-channels/clear', method: 'DELETE', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} }
      },
      {
        name: 'watch_channel',
        description: 'Long-poll a session channel until a new message arrives. Returns the message and metadata. Useful for waiting for a collaborator reply.',
        endpoint: { path: '/api/mcp/session-channels/{channel}/watch', method: 'GET', params: { channel: { type: 'string', required: true, description: 'Channel name' }, timeout: { type: 'number', required: false, description: 'Max wait time in seconds' } }, headers: {} }
      },
      {
        name: 'subscribe_channel',
        description: 'Subscribe to push notifications for a channel. After subscribing, new messages arrive as MCP notifications/message events — no polling needed.',
        endpoint: { path: '/api/mcp/session-channels/{channel}/subscribe', method: 'POST', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} }
      },
      {
        name: 'unsubscribe_channel',
        description: 'Unsubscribe from push notifications for a channel.',
        endpoint: { path: '/api/mcp/session-channels/{channel}/subscribe', method: 'DELETE', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} }
      }
    ];

    for (const toolDef of sessionTools) {
      await Tool.findOrCreate({
        where: { name: toolDef.name },
        defaults: { userId: adminUser.id, integrationId: sessionsIntegration.id, ...toolDef, isActive: true }
      });
    }

    logger.info('MCP Depot Sessions tools created!\n');

    // Create MCP Depot Agents integration
    let agentsIntegration = await Integration.findOne({
      where: { name: 'MCP Depot Agents' }
    });

    if (!agentsIntegration) {
      agentsIntegration = await Integration.create({
        userId: adminUser.id,
        type: 'custom',
        name: 'MCP Depot Agents',
        visibility: 'shared',
        description: 'Agent registry — create, manage and install AI agents across clients. Disable this integration to hide agent tools from Claude.',
        config: {
          baseUrl: `http://localhost:${process.env.PORT || 3000}`,
          auth: { type: 'none' }
        },
        isActive: true
      });
    }

    // Seed agent tools under MCP Depot Agents
    const agentTools = [
      {
        name: 'list-agents',
        description: 'List all agents available to the current user (own + shared).',
        endpoint: { path: '/api/mcp/agents', method: 'GET', params: {}, headers: {} }
      },
      {
        name: 'get-agent',
        description: 'Get a specific agent by name. Returns a vendor-neutral agent definition (systemPrompt, tools, model) - translate it into your own client\'s local agent-file format yourself if your client supports installing agents locally.',
        endpoint: { path: '/api/mcp/agents/{name}', method: 'GET', params: { name: { type: 'string', required: true, description: 'Agent name' } }, headers: {} }
      },
      {
        name: 'create-agent',
        description: 'Create a new agent with a name, description, role (short label), system prompt, optional tool constraints, optional model preference, and sharing flag.',
        endpoint: { path: '/api/mcp/agents', method: 'POST', params: { name: { type: 'string', required: true, description: 'Unique agent name (slug-style, e.g. security-reviewer)' }, description: { type: 'string', required: false, description: 'Short description' }, role: { type: 'string', required: true, description: 'Short display label, e.g. Security Reviewer' }, systemPrompt: { type: 'string', required: true, description: 'The system prompt / personality for this agent' }, tools: { type: 'string', required: false, description: 'Comma-separated allowed tool names, e.g. read, grep, bash' }, model: { type: 'string', required: false, description: 'Preferred model ID, e.g. claude-opus-4-7' }, isShared: { type: 'boolean', required: false, description: 'Make this agent visible to all users' } }, headers: { 'Content-Type': 'application/json' } }
      },
      {
        name: 'update-agent',
        description: 'Update an existing agent by name. Only provided fields are changed.',
        endpoint: { path: '/api/mcp/agents/{name}', method: 'PUT', params: { name: { type: 'string', required: true, description: 'Agent name to update' }, description: { type: 'string', required: false, description: 'Updated description' }, role: { type: 'string', required: false, description: 'Updated display label' }, systemPrompt: { type: 'string', required: false, description: 'Updated system prompt' }, tools: { type: 'string', required: false, description: 'Updated tool constraints' }, model: { type: 'string', required: false, description: 'Updated model preference' }, isShared: { type: 'boolean', required: false, description: 'Updated sharing flag' } }, headers: { 'Content-Type': 'application/json' } }
      },
      {
        name: 'delete-agent',
        description: 'Delete an agent by name. Only the owner or an admin can delete an agent.',
        endpoint: { path: '/api/mcp/agents/{name}', method: 'DELETE', params: { name: { type: 'string', required: true, description: 'Agent name to delete' } }, headers: {} }
      }
    ];

    for (const toolDef of agentTools) {
      await Tool.findOrCreate({
        where: { name: toolDef.name },
        defaults: { userId: adminUser.id, integrationId: agentsIntegration.id, ...toolDef, isActive: true }
      });
    }

    logger.info('MCP Depot Agents tools created!\n');
  } else {
    userId = mcpDepotIntegration.userId;
    
    await Tool.update(
      { name: 'list-skills', description: 'List all available skills that AI assistants can invoke' },
      { where: { name: 'list-prompts' } }
    );

    // Ensure built-in integrations are visible to all users
    if (mcpDepotIntegration.visibility !== 'shared') {
      await mcpDepotIntegration.update({ visibility: 'shared' });
    }

    // Find or create MCP Depot Sessions integration
    let sessionsIntegration = await Integration.findOne({
      where: { name: 'MCP Depot Sessions' }
    });

    if (!sessionsIntegration) {
      sessionsIntegration = await Integration.create({
        userId,
        type: 'custom',
        name: 'MCP Depot Sessions',
        visibility: 'shared',
        description: 'Session persistence tools — Contexts and Channels. Disable this integration to hide these tools from Claude.',
        config: { baseUrl: `http://localhost:${process.env.PORT || 3000}`, auth: { type: 'none' } },
        isActive: true
      });
    } else if (sessionsIntegration.visibility !== 'shared') {
      await sessionsIntegration.update({ visibility: 'shared' });
    }

    // Migration: update baseUrl for MCP Depot integration if port has changed
    const actualBaseUrl = `http://localhost:${process.env.PORT || 3000}`;
    if (mcpDepotIntegration.config?.baseUrl !== actualBaseUrl) {
      await mcpDepotIntegration.update({
        config: { ...mcpDepotIntegration.config, baseUrl: actualBaseUrl }
      });
      logger.info(`Updated MCP Depot integration baseUrl to ${actualBaseUrl}`);
    }

    // Migration: update baseUrl for MCP Depot Sessions integration if port has changed
    if (sessionsIntegration.config?.baseUrl !== actualBaseUrl) {
      await sessionsIntegration.update({
        config: { ...sessionsIntegration.config, baseUrl: actualBaseUrl }
      });
      logger.info(`Updated MCP Depot Sessions integration baseUrl to ${actualBaseUrl}`);
    }

    // Migration: move existing session tools from MCP Depot to MCP Depot Sessions
    const sessionToolNames = [
      'store-session-context', 'get-session-context',
      'list-session-contexts', 'delete-session-context',
      'append-to-channel', 'read-channel',
      'list-channels', 'clear-channel', 'watch_channel',
      'subscribe_channel', 'unsubscribe_channel'
    ];
    await Tool.update(
      { integrationId: sessionsIntegration.id },
      { where: { name: sessionToolNames, integrationId: mcpDepotIntegration.id } }
    );

    // Migration: update subscribe/unsubscribe channel tool endpoints to include channel param
    await Tool.update(
      { endpoint: { path: '/api/mcp/session-channels/{channel}/subscribe', method: 'POST', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} } },
      { where: { name: 'subscribe_channel' } }
    );
    await Tool.update(
      { endpoint: { path: '/api/mcp/session-channels/{channel}/subscribe', method: 'DELETE', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} } },
      { where: { name: 'unsubscribe_channel' } }
    );

    // Seed session tools under MCP Depot Sessions
    const sessionToolsToCreate = [
      {
        name: 'store-session-context',
        description: 'Save a named context to MCP Depot. Private by default — set shared=true to make it readable by any MCP Depot user. Pass ttlHours=0 to pin permanently. Default 168 hours (7 days).',
        endpoint: { path: '/api/mcp/session-contexts/store', method: 'POST', params: { name: { type: 'string', required: true, description: 'Unique human-readable key' }, content: { type: 'string', required: true, description: 'The context to store' }, shared: { type: 'boolean', required: false, description: 'If true, any user can read' }, ttlHours: { type: 'number', required: false, description: 'Hours until expiry. Pass 0 to pin.' } }, headers: {} },
        inputSchema: {
          type: 'object',
          properties: {
            name:     { type: 'string',  description: 'Unique human-readable key, e.g. "bitbucket-debug"' },
            content:  { type: 'string',  description: 'The context to store — markdown, JSON, bullet list, anything' },
            shared:   { type: 'boolean', description: 'If true, any MCP Depot user can read this context. Default false.' },
            ttlHours: { type: 'number',  description: 'Hours until expiry. Default 168 (7 days). Pass 0 to pin permanently with no expiry.' }
          },
          required: ['name', 'content']
        }
      },
      {
        name: 'get-session-context',
        description: 'Retrieve a named context previously stored in MCP Depot.',
        endpoint: { path: '/api/mcp/session-contexts/get', method: 'GET', params: { name: { type: 'string', required: true, description: 'The context name' } }, headers: {} }
      },
      {
        name: 'list-session-contexts',
        description: 'List all named contexts stored in MCP Depot.',
        endpoint: { path: '/api/mcp/session-contexts/list', method: 'GET', params: {}, headers: {} }
      },
      {
        name: 'delete-session-context',
        description: 'Delete a named context from MCP Depot.',
        endpoint: { path: '/api/mcp/session-contexts/delete', method: 'DELETE', params: { name: { type: 'string', required: true, description: 'The context name' } }, headers: {} }
      },
      {
        name: 'append-to-channel',
        description: 'Post a message to a named session channel.',
        endpoint: { path: '/api/mcp/session-channels', method: 'POST', params: { channel: { type: 'string', required: true, description: 'Channel name' }, message: { type: 'string', required: true, description: 'The message' } }, headers: {} }
      },
      {
        name: 'read-channel',
        description: 'Read messages from a session channel.',
        endpoint: { path: '/api/mcp/session-channels/read', method: 'GET', params: { channel: { type: 'string', required: true, description: 'Channel name' }, since: { type: 'string', required: false, description: 'ISO timestamp' } }, headers: {} }
      },
      {
        name: 'list-channels',
        description: 'List all active session channels.',
        endpoint: { path: '/api/mcp/session-channels', method: 'GET', params: {}, headers: {} }
      },
      {
        name: 'clear-channel',
        description: 'Delete all messages in a session channel.',
        endpoint: { path: '/api/mcp/session-channels/clear', method: 'DELETE', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} }
      },
      {
        name: 'watch_channel',
        description: 'Long-poll a session channel until a new message arrives. Returns the message and metadata. Useful for waiting for a collaborator reply.',
        endpoint: { path: '/api/mcp/session-channels/{channel}/watch', method: 'GET', params: { channel: { type: 'string', required: true, description: 'Channel name' }, timeout: { type: 'number', required: false, description: 'Max wait time in seconds' } }, headers: {} }
      },
      {
        name: 'subscribe_channel',
        description: 'Subscribe to push notifications for a channel. After subscribing, new messages arrive as MCP notifications/message events — no polling needed.',
        endpoint: { path: '/api/mcp/session-channels/{channel}/subscribe', method: 'POST', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} }
      },
      {
        name: 'unsubscribe_channel',
        description: 'Unsubscribe from push notifications for a channel.',
        endpoint: { path: '/api/mcp/session-channels/{channel}/subscribe', method: 'DELETE', params: { channel: { type: 'string', required: true, description: 'Channel name' } }, headers: {} }
      }
    ];

    for (const toolDef of sessionToolsToCreate) {
      await Tool.findOrCreate({
        where: { name: toolDef.name },
        defaults: { userId, integrationId: sessionsIntegration.id, ...toolDef, isActive: true }
      });
    }

    for (const toolDef of sessionToolsToCreate) {
      if (toolDef.inputSchema) {
        await Tool.update(
          { inputSchema: toolDef.inputSchema, description: toolDef.description },
          { where: { name: toolDef.name } }
        );
      }
    }

    const toolsToCreate = [
      {
        name: 'fetch-url',
        description: 'Fetch content from any URL and return as text. Supports HTML, JSON, XML, plain text. Use for: reading docs, fetching APIs, scraping web pages.',
        endpoint: {
          path: '/api/mcp/fetch-url',
          method: 'GET',
          params: {
            url: {
              type: 'string',
              required: true,
              description: 'URL to fetch (http or https)'
            },
            timeout: {
              type: 'number',
              required: false,
              description: 'Request timeout in milliseconds (default: 30000)'
            },
            maxSize: {
              type: 'number',
              required: false,
              description: 'Max response size in bytes (default: 5242880)'
            }
          },
          headers: {}
        }
      },
      {
        name: 'list-skills',
        description: 'List all available skills that AI assistants can invoke',
        endpoint: {
          path: '/api/mcp/skills',
          method: 'GET',
          params: {},
          headers: {}
        }
      },
      {
        name: 'get-skill',
        description: 'Get the full content of a skill by name. The skill is already callable as an MCP tool (no installation needed) for any AI client; the response also includes the prompt content in case your client separately supports installing local skill files by its own convention.',
        endpoint: {
          path: '/api/mcp/skills/{name}',
          method: 'GET',
          params: {},
          headers: {}
        }
      }
    ];

    for (const toolDef of toolsToCreate) {
      await Tool.findOrCreate({
        where: { name: toolDef.name },
        defaults: {
          userId,
          integrationId: mcpDepotIntegration.id,
          ...toolDef,
          isActive: true
        }
      });
    }

    logger.info('Additional MCP Depot tools added!\n');

    // Find or create MCP Depot Agents integration
    let agentsIntegration = await Integration.findOne({
      where: { name: 'MCP Depot Agents' }
    });

    if (!agentsIntegration) {
      agentsIntegration = await Integration.create({
        userId,
        type: 'custom',
        name: 'MCP Depot Agents',
        visibility: 'shared',
        description: 'Agent registry — create, manage and install AI agents across clients. Disable this integration to hide agent tools from Claude.',
        config: { baseUrl: actualBaseUrl, auth: { type: 'none' } },
        isActive: true
      });
    } else if (agentsIntegration.config?.baseUrl !== actualBaseUrl) {
      await agentsIntegration.update({
        config: { ...agentsIntegration.config, baseUrl: actualBaseUrl }
      });
    }

    // Seed agent tools under MCP Depot Agents
    const agentTools = [
      {
        name: 'list-agents',
        description: 'List all agents available to the current user (own + shared).',
        endpoint: { path: '/api/mcp/agents', method: 'GET', params: {}, headers: {} }
      },
      {
        name: 'get-agent',
        description: 'Get a specific agent by name. Returns a vendor-neutral agent definition (systemPrompt, tools, model) - translate it into your own client\'s local agent-file format yourself if your client supports installing agents locally.',
        endpoint: { path: '/api/mcp/agents/{name}', method: 'GET', params: { name: { type: 'string', required: true, description: 'Agent name' } }, headers: {} }
      },
      {
        name: 'create-agent',
        description: 'Create a new agent with a name, description, role (short label), system prompt, optional tool constraints, optional model preference, and sharing flag.',
        endpoint: { path: '/api/mcp/agents', method: 'POST', params: { name: { type: 'string', required: true, description: 'Unique agent name (slug-style, e.g. security-reviewer)' }, description: { type: 'string', required: false, description: 'Short description' }, role: { type: 'string', required: true, description: 'Short display label, e.g. Security Reviewer' }, systemPrompt: { type: 'string', required: true, description: 'The system prompt / personality for this agent' }, tools: { type: 'string', required: false, description: 'Comma-separated allowed tool names, e.g. read, grep, bash' }, model: { type: 'string', required: false, description: 'Preferred model ID, e.g. claude-opus-4-7' }, isShared: { type: 'boolean', required: false, description: 'Make this agent visible to all users' } }, headers: { 'Content-Type': 'application/json' } }
      },
      {
        name: 'update-agent',
        description: 'Update an existing agent by name. Only provided fields are changed.',
        endpoint: { path: '/api/mcp/agents/{name}', method: 'PUT', params: { name: { type: 'string', required: true, description: 'Agent name to update' }, description: { type: 'string', required: false, description: 'Updated description' }, role: { type: 'string', required: false, description: 'Updated display label' }, systemPrompt: { type: 'string', required: false, description: 'Updated system prompt' }, tools: { type: 'string', required: false, description: 'Updated tool constraints' }, model: { type: 'string', required: false, description: 'Updated model preference' }, isShared: { type: 'boolean', required: false, description: 'Updated sharing flag' } }, headers: { 'Content-Type': 'application/json' } }
      },
      {
        name: 'delete-agent',
        description: 'Delete an agent by name. Only the owner or an admin can delete an agent.',
        endpoint: { path: '/api/mcp/agents/{name}', method: 'DELETE', params: { name: { type: 'string', required: true, description: 'Agent name to delete' } }, headers: {} }
      }
    ];

    for (const toolDef of agentTools) {
      const [tool, created] = await Tool.findOrCreate({
        where: { name: toolDef.name },
        defaults: { userId, integrationId: agentsIntegration.id, ...toolDef, isActive: true }
      });
      if (!created) {
        await tool.update({ description: toolDef.description, endpoint: toolDef.endpoint });
      }
    }

    logger.info('MCP Depot Agents tools seeded!\n');
  }

  // Create MCP Depot - AI Tools integration (meta-tools for AI-driven integration builder)
  let aiToolsIntegration = await Integration.findOne({
    where: { name: 'MCP Depot - AI Tools' }
  });
  const actualBaseUrl = `http://localhost:${process.env.PORT || 3000}`;
  if (!aiToolsIntegration) {
    aiToolsIntegration = await Integration.create({
      userId,
      type: 'custom',
      name: 'MCP Depot - AI Tools',
      description: 'AI-driven integration builder — meta-tools for creating and managing integrations from chat. Disable to hide meta-tools.',
      config: { baseUrl: actualBaseUrl, auth: { type: 'none' } },
      isActive: true,
    });
    logger.info('MCP Depot - AI Tools integration created (enable/disable via the UI card to toggle meta-tools)');
  } else if (aiToolsIntegration.config?.auth?.type === 'apikey') {
    await aiToolsIntegration.update({
      config: { baseUrl: actualBaseUrl, auth: { type: 'none' } }
    });
    logger.info('MCP Depot - AI Tools integration migrated to auth: none');
  } else if (aiToolsIntegration.config?.baseUrl !== actualBaseUrl) {
    await aiToolsIntegration.update({
      config: { ...aiToolsIntegration.config, baseUrl: actualBaseUrl }
    });
  }

  // Seed meta-tool records so they appear in the UI (actual handlers are on McpServer, not HTTP endpoints)
  const metaToolDefs = [
    {
      name: 'mcp_list_integrations',
      description: 'List all registered integrations with their tool counts and metadata.',
      endpoint: { path: '/api/mcp/list-integrations', method: 'GET', params: {}, headers: {} }
    },
    {
      name: 'mcp_register_integration',
      description: 'Create a new integration by name, base URL, and type. Credentials must be configured in the UI.',
      endpoint: { path: '/api/mcp/register-integration', method: 'POST', params: {}, headers: { 'Content-Type': 'application/json' }, body: { name: '{name}', baseUrl: '{baseUrl}', type: '{type}', description: '{description}', shared: '{shared}' } },
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Integration name' }, baseUrl: { type: 'string', description: 'Base URL of the API' }, type: { type: 'string', description: 'Integration type (default: custom)' }, description: { type: 'string', description: 'Description' }, shared: { type: 'boolean', description: 'Whether shared with all users' } }, required: ['name', 'baseUrl'] }
    },
    {
      name: 'mcp_register_tool',
      description: 'Add a tool to an existing integration, mapping an HTTP endpoint to a named MCP tool.',
      endpoint: { path: '/api/mcp/register-tool', method: 'POST', params: {}, headers: { 'Content-Type': 'application/json' }, body: { integration: '{integration}', name: '{name}', description: '{description}', path: '{path}', method: '{method}', params: '{params}', responseFields: '{responseFields}' } },
      inputSchema: { type: 'object', properties: { integration: { type: 'string', description: 'Integration name to add tool to' }, name: { type: 'string', description: 'Tool name' }, description: { type: 'string', description: 'Tool description' }, path: { type: 'string', description: 'HTTP path (e.g. /get)' }, method: { type: 'string', description: 'HTTP method (default: GET)' }, params: { type: 'string', description: 'JSON-encoded params object' }, responseFields: { type: 'string', description: 'JSON-encoded response fields' } }, required: ['integration', 'name', 'description', 'path'] }
    },
    {
      name: 'mcp_describe_tool',
      description: 'Get the full schema and details for a named tool.',
      endpoint: { path: '/api/mcp/describe-tool', method: 'GET', params: { name: { type: 'string', required: true, description: 'Tool name' } }, headers: {} }
    },
    {
      name: 'mcp_remove_tool',
      description: 'Remove a tool from an integration. Requires confirm: true.',
      endpoint: { path: '/api/mcp/remove-tool', method: 'DELETE', params: {}, headers: { 'Content-Type': 'application/json' }, body: { integration: '{integration}', name: '{name}', confirm: '{confirm}' } },
      inputSchema: { type: 'object', properties: { integration: { type: 'string', description: 'Integration name' }, name: { type: 'string', description: 'Tool name to remove' }, confirm: { type: 'boolean', description: 'Must be true to confirm deletion' } }, required: ['integration', 'name', 'confirm'] }
    }
  ];

  for (const mt of metaToolDefs) {
    const [tool, created] = await Tool.findOrCreate({
      where: { name: mt.name },
      defaults: {
        userId,
        integrationId: aiToolsIntegration.id,
        type: 'meta',
        name: mt.name,
        description: mt.description,
        endpoint: mt.endpoint,
        inputSchema: mt.inputSchema || {},
        isActive: true
      }
    });
    if (!created) {
      await tool.update({ endpoint: mt.endpoint, inputSchema: mt.inputSchema || {} });
    }
  }

  // Seed create-skill and update-skill tools
  const skillToolDefs = [
    {
      name: 'create-skill',
      description: 'Create or update a skill in MCP Depot by name. If a skill with the given name already exists it will be updated.',
      endpoint: { path: '/api/mcp/skills', method: 'POST', params: {}, headers: { 'Content-Type': 'application/json' }, body: { name: '{name}', prompt: '{prompt}', description: '{description}', inputs: '{inputs}', outputFormat: '{outputFormat}', isShared: '{isShared}', tags: '{tags}' } },
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Unique skill key, e.g. "code-reviewer"' }, prompt: { type: 'string', description: 'Full skill prompt (supports {{variable}} placeholders)' }, description: { type: 'string', description: 'Short description' }, inputs: { type: 'array', description: 'Input variable definitions' }, outputFormat: { type: 'string', description: 'text, json, or markdown (default: text)' }, isShared: { type: 'boolean', description: 'Visible to all team members' }, tags: { type: 'array', description: 'Tags for categorization' } }, required: ['name', 'prompt'] }
    },
    {
      name: 'update-skill',
      description: 'Update specific fields of an existing skill in MCP Depot by name.',
      endpoint: { path: '/api/mcp/skills/{name}', method: 'PUT', params: {}, headers: { 'Content-Type': 'application/json' }, body: { name: '{name}', prompt: '{prompt}', description: '{description}', inputs: '{inputs}', outputFormat: '{outputFormat}', isShared: '{isShared}', tags: '{tags}' } },
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Name of the skill to update (used in URL path)' }, prompt: { type: 'string', description: 'Updated skill prompt' }, description: { type: 'string', description: 'Updated description' }, inputs: { type: 'array', description: 'Updated input definitions' }, outputFormat: { type: 'string', description: 'text, json, or markdown' }, isShared: { type: 'boolean', description: 'Visibility setting' }, tags: { type: 'array', description: 'Updated tags' } }, required: ['name'] }
    }
  ];

  for (const toolDef of skillToolDefs) {
    const [tool, created] = await Tool.findOrCreate({
      where: { name: toolDef.name },
      defaults: { userId, integrationId: mcpDepotIntegration.id, name: toolDef.name, description: toolDef.description, endpoint: toolDef.endpoint, inputSchema: toolDef.inputSchema, isActive: true }
    });
    if (!created) {
      await tool.update({ inputSchema: toolDef.inputSchema, endpoint: toolDef.endpoint });
    }
  }
};

// Seeds the default rules for every resourceType/action pair whose route
// used to hardcode a `role === 'admin'` comparison for something other than
// find-scoping (find-scoping ones - e.g. "list only my own integrations" -
// stay as plain JS; there's no single resourceId to hang a rule on). Runs on
// every boot (findOrCreate is idempotent per resourceType/action/subjectType/
// subjectId), same as createDefaultUser/createDefaultTool - this is what
// makes the admin-only behavior editable/auditable through the Policy UI
// instead of a hardcoded JS comparison, while preserving the exact prior
// behavior on the first boot after upgrade: nobody except role=admin gets
// through, until an admin edits or adds to these seeded rules.
const createDefaultPolicyRules = async () => {
  const PolicyRule = require('../models/PolicyRule');

  const seeds = [
    {
      resourceType: 'session_context', action: 'manage_others', subjectType: '*', subjectId: null, effect: 'deny',
      description: "Only admins may modify or delete another user's session context by default (seeded rule)"
    },
    {
      resourceType: 'session_context', action: 'manage_others', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins bypass session context ownership (seeded rule)'
    },
    {
      resourceType: 'session_channel', action: 'manage_others', subjectType: '*', subjectId: null, effect: 'deny',
      description: "Only admins may clear another user's session channel by default (seeded rule)"
    },
    {
      resourceType: 'session_channel', action: 'manage_others', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins bypass session channel ownership (seeded rule)'
    },
    {
      resourceType: 'integration', action: 'share', subjectType: '*', subjectId: null, effect: 'deny',
      description: 'Only admins may share an integration company-wide by default (seeded rule)'
    },
    {
      resourceType: 'integration', action: 'share', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins may share integrations company-wide (seeded rule)'
    },
    {
      resourceType: 'integration', action: 'manage_others', subjectType: '*', subjectId: null, effect: 'deny',
      description: "Only admins may manage another user's integration credentials by default (seeded rule)"
    },
    {
      resourceType: 'integration', action: 'manage_others', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins bypass integration credential ownership (seeded rule)'
    },
    {
      resourceType: 'integration', action: 'view_users', subjectType: '*', subjectId: null, effect: 'deny',
      description: 'Only admins may view which users are connected to an integration by default (seeded rule)'
    },
    {
      resourceType: 'integration', action: 'view_users', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins may view integration connection lists (seeded rule)'
    },
    {
      resourceType: 'group', action: 'manage_others', subjectType: '*', subjectId: null, effect: 'deny',
      description: 'Only admins may manage a group they are not a group-admin of by default (seeded rule)'
    },
    {
      resourceType: 'group', action: 'manage_others', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins may manage any group regardless of membership (seeded rule)'
    },
    {
      resourceType: 'external_mcp_server', action: 'configure_stdio', subjectType: '*', subjectId: null, effect: 'deny',
      description: 'Only admins may register or reconfigure stdio-based external MCP servers by default (seeded rule) - stdio runs an arbitrary local command, equivalent to code execution'
    },
    {
      resourceType: 'external_mcp_server', action: 'configure_stdio', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins may register or reconfigure stdio-based external MCP servers (seeded rule)'
    },
    {
      resourceType: 'external_mcp_server', action: 'install_package', subjectType: '*', subjectId: null, effect: 'deny',
      description: 'Only admins may install packages for external MCP servers by default (seeded rule)'
    },
    {
      resourceType: 'external_mcp_server', action: 'install_package', subjectType: 'role', subjectId: 'admin', effect: 'allow',
      description: 'Admins may install packages for external MCP servers (seeded rule)'
    }
  ];

  for (const seed of seeds) {
    await PolicyRule.findOrCreate({
      where: {
        resourceType: seed.resourceType,
        action: seed.action,
        subjectType: seed.subjectType,
        subjectId: seed.subjectId
      },
      defaults: {
        resourceMatch: '*',
        effect: seed.effect,
        isActive: true,
        priority: 0,
        description: seed.description
      }
    });
  }
};

// Seeds a per-installation, ID-specific 'delete' deny rule for each actual
// built-in integration found - dynamic (unlike the seeds above, which use
// resourceMatch '*') because these ids are assigned at creation time by
// createDefaultTool(), not known ahead of time. Must run after that
// function has already created them. isSystemManaged so an admin can see
// this in the Policy UI as documentation of the protection, but can't
// delete the rule itself as a step toward bypassing the unconditional,
// code-level block in routes/integrations.js - this rule is a second,
// defense-in-depth layer, not the only thing enforcing this.
const protectBuiltInIntegrations = async () => {
  const PolicyRule = require('../models/PolicyRule');
  const Integration = require('../models/Integration');
  const { BUILT_IN_INTEGRATION_NAMES } = require('../utils/builtInIntegrations');

  const builtIns = await Integration.findAll({ where: { name: BUILT_IN_INTEGRATION_NAMES } });

  for (const integration of builtIns) {
    await PolicyRule.findOrCreate({
      where: {
        resourceType: 'integration',
        resourceMatch: integration.id,
        action: 'delete',
        subjectType: '*',
        subjectId: null
      },
      defaults: {
        effect: 'deny',
        isActive: true,
        priority: 0,
        isSystemManaged: true,
        description: `Built-in integration "${integration.name}" cannot be deleted (seeded, system-managed)`
      }
    });
  }
};

const connectDB = async (retries = 5, delay = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate();
      logger.info(`${sequelize.getDialect().toUpperCase()} connected successfully`);

      loadModels();

      if (IS_DEV) {
        logger.warn('Development mode: running sequelize.sync({ alter: true })');
        await sequelize.sync({ alter: true });
        logger.info('Database synchronized');
      } else {
        logger.warn('Production mode: running sequelize.sync({ force: false }) to create missing tables');
        await sequelize.sync({ force: false });
        logger.info('Database synchronized');

        await runMigrations(sequelize);
      }
      
      break;
    } catch (error) {
      if (attempt === retries) {
        logger.fatal({ err: error.message }, 'Database connection failed after retries');
        process.exit(1);
      }
      logger.warn(`Database connection attempt ${attempt}/${retries} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  try {
    await createDefaultUser();
    await createDefaultTool();
    await createDefaultPolicyRules();
    await protectBuiltInIntegrations();
  } catch (error) {
    logger.fatal({ err: error.message }, 'Database setup error');
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB, loadModels, createDefaultPolicyRules, protectBuiltInIntegrations };
