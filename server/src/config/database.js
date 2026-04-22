const { Sequelize } = require('sequelize');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const logger = require('../services/logger');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialect: 'postgres',
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const IS_DEV = process.env.NODE_ENV !== 'production';
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
  
  return { User, Integration, Tool, ToolCall, UserIntegrationCredentials, ExternalMcpServer, PromptLibrary, SystemSetting, SessionContext };
};

const generatePassword = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(12).toString('base64url');
};

const createDefaultUser = async () => {
  const User = require('../models/User');
  
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mcpconnect.io';
  const adminExists = await User.findOne({ where: { email: adminEmail } });
  
  if (!adminExists) {
    const defaultPassword = process.env.ADMIN_PASSWORD || generatePassword();
    
    await User.create({
      email: adminEmail,
      password: defaultPassword,
      name: 'Administrator',
      role: 'admin',
      mustResetPassword: !process.env.ADMIN_PASSWORD
    });
    
    logger.info('\n===========================================');
    logger.info('DEFAULT ADMIN USER CREATED');
    logger.info('===========================================');
    logger.info(`Email: ${adminEmail}`);
    logger.info(`Password: ${defaultPassword}`);
    logger.info('===========================================');
    if (!process.env.ADMIN_PASSWORD) {
      logger.info('IMPORTANT: Change this password after first login!');
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
  
  let mcpconnectIntegration = await Integration.findOne({
    where: { name: 'MCPConnect' }
  });
  
  let userId;
  
  if (!mcpconnectIntegration) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@mcpconnect.io';
    const adminUser = await User.findOne({ where: { email: adminEmail } });
    
    if (!adminUser) {
      logger.info('Admin user not created yet');
      return;
    }
    
    userId = adminUser.id;
    
    mcpconnectIntegration = await Integration.create({
      userId: adminUser.id,
      type: 'custom',
      name: 'MCPConnect',
      description: 'Built-in MCPConnect API',
      config: {
        baseUrl: 'http://localhost:3000',
        auth: { type: 'none' }
      },
      isActive: true
    });
    
    await Tool.create({
      userId: adminUser.id,
      integrationId: mcpconnectIntegration.id,
      name: 'hello',
      description: 'Returns a hello world message from MCPConnect',
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
      integrationId: mcpconnectIntegration.id,
      name: 'list-tools',
      description: 'List all available MCPConnect tools',
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
      integrationId: mcpconnectIntegration.id,
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
      integrationId: mcpconnectIntegration.id,
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
    
    logger.info('Default MCPConnect tools created!\n');
  } else {
    userId = mcpconnectIntegration.userId;
    
    await Tool.update(
      { name: 'list-skills', description: 'List all available skills that AI assistants can invoke' },
      { where: { name: 'list-prompts' } }
    );

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
      },
      {
        name: 'store-session-context',
        description: 'Save a named context to MCPConnect. Private by default — set shared=true to make it readable by any MCPConnect user. Pass ttlHours=0 to pin permanently. Default 168 hours (7 days).',
        endpoint: {
          path: '/api/mcp/session-contexts/store',
          method: 'POST',
          params: {
            name: { type: 'string', required: true, description: 'Unique human-readable key, e.g. "bitbucket-debug"' },
            content: { type: 'string', required: true, description: 'The context to store — markdown, JSON, bullet list, anything' },
            shared: { type: 'boolean', required: false, description: 'If true, any MCPConnect user can read this context. Default false.' },
            ttlHours: { type: 'number', required: false, description: 'Hours until this context expires. Default 168 (7 days). Pass 0 to pin permanently (never expires).' }
          },
          headers: {}
        }
      },
      {
        name: 'get-session-context',
        description: 'Retrieve a named context previously stored in MCPConnect and inject it into the current session.',
        endpoint: {
          path: '/api/mcp/session-contexts/get',
          method: 'GET',
          params: {
            name: { type: 'string', required: true, description: 'The name of the context to retrieve' }
          },
          headers: {}
        }
      },
      {
        name: 'list-session-contexts',
        description: 'List all named contexts stored in MCPConnect, with name, creator, and timestamps.',
        endpoint: {
          path: '/api/mcp/session-contexts/list',
          method: 'GET',
          params: {},
          headers: {}
        }
      },
      {
        name: 'delete-session-context',
        description: 'Delete a named context from MCPConnect.',
        endpoint: {
          path: '/api/mcp/session-contexts/delete',
          method: 'DELETE',
          params: {
            name: { type: 'string', required: true, description: 'The name of the context to delete' }
          },
          headers: {}
        }
      }
    ];

    for (const toolDef of toolsToCreate) {
      await Tool.findOrCreate({
        where: { name: toolDef.name },
        defaults: {
          userId,
          integrationId: mcpconnectIntegration.id,
          ...toolDef,
          isActive: true
        }
      });
    }

    logger.info('Additional MCPConnect tools added!\n');
  }
};

const connectDB = async (retries = 5, delay = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate();
      logger.info('PostgreSQL connected successfully');
      if (IS_DEV) {
        logger.warn('Development mode: running sequelize.sync({ alter: true })');
        await sequelize.sync({ alter: true });
        logger.info('Database synchronized');
      } else {
        logger.warn('Production mode: running sequelize.sync({ force: false }) to create missing tables');
        await sequelize.sync({ force: false });
        logger.info('Database synchronized');
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
