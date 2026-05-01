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
      max: 5,
      min: 0,
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
  const PromptLibrary = require('../models/PromptLibrary')(sequelize);
  const SystemSetting = require('../models/SystemSetting');
  const SessionContext = require('../models/SessionContext')(sequelize);
  const SessionChannel = require('../models/SessionChannel')(sequelize);
  
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
    
    associationsDefined = true;
  }
  
  return { User, Integration, Tool, ToolCall, UserIntegrationCredentials, ExternalMcpServer, PromptLibrary, SystemSetting, SessionContext, SessionChannel };
};

const generatePassword = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(12).toString('base64url');
};

const createDefaultUser = async () => {
  const User = require('../models/User');
  
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mcp-depot.io';
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
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@mcp-depot.io';
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
      }
    ];

    for (const toolDef of sessionTools) {
      await Tool.findOrCreate({
        where: { name: toolDef.name },
        defaults: { userId: adminUser.id, integrationId: sessionsIntegration.id, ...toolDef, isActive: true }
      });
    }

    logger.info('MCP Depot Sessions tools created!\n');
  } else {
    userId = mcpDepotIntegration.userId;
    
    await Tool.update(
      { name: 'list-skills', description: 'List all available skills that AI assistants can invoke' },
      { where: { name: 'list-prompts' } }
    );

    // Find or create MCP Depot Sessions integration
    let sessionsIntegration = await Integration.findOne({
      where: { name: 'MCP Depot Sessions' }
    });

    if (!sessionsIntegration) {
      sessionsIntegration = await Integration.create({
        userId,
        type: 'custom',
        name: 'MCP Depot Sessions',
        description: 'Session persistence tools — Contexts and Channels. Disable this integration to hide these tools from Claude.',
        config: { baseUrl: `http://localhost:${process.env.PORT || 3000}`, auth: { type: 'none' } },
        isActive: true
      });
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
      'list-channels', 'clear-channel'
    ];
    await Tool.update(
      { integrationId: sessionsIntegration.id },
      { where: { name: sessionToolNames, integrationId: mcpDepotIntegration.id } }
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
        description: 'Get the full content of a skill by name so it can be installed locally. Works with any AI assistant. Returns the file content and exact install path.',
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
    // Create tool_calls table if it doesn't exist
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tool_calls (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "toolId" UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
          "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "integrationId" UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
          "callerId" VARCHAR(255),
          "callerType" VARCHAR(20) DEFAULT 'unknown',
          method VARCHAR(10) NOT NULL,
          path VARCHAR(1000) NOT NULL,
          "requestHeaders" JSONB DEFAULT '{}',
          "requestBody" JSONB DEFAULT '{}',
          "queryParams" JSONB DEFAULT '{}',
          "responseStatus" INTEGER,
          "responseBody" JSONB DEFAULT '{}',
          "responseTime" INTEGER,
          "errorMessage" TEXT,
          success BOOLEAN DEFAULT true,
          "ipAddress" VARCHAR(45),
          "userAgent" VARCHAR(500),
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_toolId" ON tool_calls("toolId");
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_userId" ON tool_calls("userId");
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_integrationId" ON tool_calls("integrationId");
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_createdAt" ON tool_calls("createdAt");
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_success" ON tool_calls(success);
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_callerType" ON tool_calls("callerType");
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_userId_createdAt" ON tool_calls("userId", "createdAt");
        CREATE INDEX IF NOT EXISTS "idx_tool_calls_integrationId_success" ON tool_calls("integrationId", success);
      `);
      logger.info('Tool calls table ready');
    } catch (e) {
      logger.warn('Tool calls table may already exist or error:', e.message);
    }

    // Create user_integration_credentials table
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS user_integration_credentials (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "integrationId" UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
          credentials JSONB NOT NULL,
          "isActive" BOOLEAN DEFAULT true,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW(),
          UNIQUE("userId", "integrationId")
        );
        CREATE INDEX IF NOT EXISTS "idx_uic_userId" ON user_integration_credentials("userId");
        CREATE INDEX IF NOT EXISTS "idx_uic_integrationId" ON user_integration_credentials("integrationId");
      `);
      logger.info('User credentials table ready');
    } catch (e) {
      logger.warn('User credentials table may already exist or error:', e.message);
    }

    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS external_mcp_servers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          runtime VARCHAR(20) DEFAULT 'node',
          "transportType" VARCHAR(20) DEFAULT 'http',
          url VARCHAR(500),
          command VARCHAR(500),
          args VARCHAR(1000),
          env VARCHAR(2000),
          "authType" VARCHAR(20) DEFAULT 'none',
          "authToken" VARCHAR(1000),
          "authHeader" VARCHAR(100),
          "isActive" BOOLEAN DEFAULT true,
          "lastFetchedAt" TIMESTAMP,
          "lastFetchError" VARCHAR(500),
          metadata JSONB DEFAULT '{}',
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_ems_userId" ON external_mcp_servers("userId");
        CREATE INDEX IF NOT EXISTS "idx_ems_isActive" ON external_mcp_servers("isActive");
        CREATE INDEX IF NOT EXISTS "idx_ems_userId_isActive" ON external_mcp_servers("userId", "isActive");
      `);
      logger.info('External MCP servers table ready');
    } catch (e) {
      logger.warn('External MCP servers table may already exist or error:', e.message);
    }

    // Create prompt_library table if it doesn't exist
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS prompt_library (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          inputs JSONB DEFAULT '[]',
          prompt TEXT NOT NULL,
          "isDefault" BOOLEAN DEFAULT false,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_pl_userId" ON prompt_library("userId");
      `);
      logger.info('Prompt library table ready');
    } catch (e) {
      logger.warn('Prompt library table may already exist or error:', e.message);
    }
    
    // Create system_settings table if it doesn't exist
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB DEFAULT '{}',
          description VARCHAR(500)
        );
      `);
      logger.info('System settings table ready');
    } catch (e) {
      logger.warn('System settings table may already exist or error:', e.message);
    }

    // Migration: remap auth.type from 'infisical' to 'bearer' for existing integrations
    try {
      await sequelize.query(`
        UPDATE integrations
        SET config = jsonb_set(config, '{auth,type}', '"bearer"')
        WHERE config->'auth'->>'type' = 'infisical'
      `);
      logger.info('Migration: remapped infisical auth type to bearer');
    } catch (e) {
      logger.warn('Migration may have already run:', e.message);
    }
    
    await createDefaultUser();
    await createDefaultTool();
  } catch (error) {
    logger.fatal({ err: error.message }, 'Database setup error');
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB, loadModels };
