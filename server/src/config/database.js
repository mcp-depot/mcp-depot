const { Sequelize } = require('sequelize');
require('dotenv').config();
const bcrypt = require('bcryptjs');

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

const loadModels = () => {
  const User = require('../models/User');
  const Integration = require('../models/Integration');
  const Tool = require('../models/Tool');
  const ToolCall = require('../models/ToolCall');
  const UserIntegrationCredentials = require('../models/UserIntegrationCredentials');
  const ExternalMcpServer = require('../models/ExternalMcpServer');
  const PromptLibrary = require('../models/PromptLibrary')(sequelize);
  const SystemSetting = require('../models/SystemSetting');
  return { User, Integration, Tool, ToolCall, UserIntegrationCredentials, ExternalMcpServer, PromptLibrary, SystemSetting };
};

const generatePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const createDefaultUser = async () => {
  const User = require('../models/User');
  
  const adminExists = await User.findOne({ where: { email: 'admin@mcpconnect.io' } });
  
  if (!adminExists) {
    const defaultPassword = generatePassword();
    
    await User.create({
      email: 'admin@mcpconnect.io',
      password: defaultPassword,
      name: 'Administrator',
      role: 'admin',
      mustResetPassword: true
    });
    
    console.log('\n===========================================');
    console.log('DEFAULT ADMIN USER CREATED');
    console.log('===========================================');
    console.log('Email: admin@mcpconnect.io');
    console.log('Password:', defaultPassword);
    console.log('===========================================');
    console.log('IMPORTANT: Change this password after first login!');
    console.log('===========================================\n');
    
    return defaultPassword;
  }
  
  return null;
};

const createDefaultTool = async () => {
  const User = require('../models/User');
  const Integration = require('../models/Integration');
  const Tool = require('../models/Tool');
  
  const demoUser = await User.findOne({ where: { email: 'demo@mcpconnect.io' } });
  
  if (!demoUser) {
    console.log('Demo user not created yet');
    return;
  }
  
  const mcpconnectIntegration = await Integration.findOne({
    where: {
      userId: demoUser.id,
      name: 'MCPConnect'
    }
  });
  
  if (!mcpconnectIntegration) {
    const integration = await Integration.create({
      userId: demoUser.id,
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
      userId: demoUser.id,
      integrationId: integration.id,
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
      userId: demoUser.id,
      integrationId: integration.id,
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
      userId: demoUser.id,
      integrationId: integration.id,
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
      userId: demoUser.id,
      integrationId: integration.id,
      name: 'list-prompts',
      description: 'List all available prompt templates from Prompt Library',
      endpoint: {
        path: '/api/prompt-library',
        method: 'GET',
        params: {},
        headers: {}
      },
      isActive: true
    });
    
    console.log('Default MCPConnect tools created for demo user!\n');
  } else {
    const existingTool = await Tool.findOne({
      where: {
        integrationId: mcpconnectIntegration.id,
        name: 'fetch-url'
      }
    });
    
    if (!existingTool) {
      await Tool.create({
        userId: demoUser.id,
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
        userId: demoUser.id,
        integrationId: mcpconnectIntegration.id,
        name: 'list-prompts',
        description: 'List all available prompt templates from Prompt Library',
        endpoint: {
          path: '/api/prompt-library',
          method: 'GET',
          params: {},
          headers: {}
        },
        isActive: true
      });
      
      console.log('Additional MCPConnect tools added!\n');
    }
  }
};

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL connected successfully');
    
    if (IS_DEV) {
      console.log('⚠️  Development mode: running sequelize.sync({ alter: true })');
      await sequelize.sync({ alter: true });
      console.log('Database synchronized');
    } else {
      console.log('⚠️  Production mode: NOT running sequelize.sync() - use migrations!');
    }
    
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
      `);
      console.log('Tool calls table ready');
    } catch (e) {
      console.log('Tool calls table may already exist or error:', e.message);
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
      console.log('User credentials table ready');
    } catch (e) {
      console.log('User credentials table may already exist or error:', e.message);
    }

    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS external_mcp_servers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          url VARCHAR(500) NOT NULL,
          "authType" VARCHAR(20) DEFAULT 'none',
          "authToken" VARCHAR(1000),
          "authHeader" VARCHAR(100),
          "isActive" BOOLEAN DEFAULT true,
          metadata JSONB DEFAULT '{}',
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_ems_userId" ON external_mcp_servers("userId");
        CREATE INDEX IF NOT EXISTS "idx_ems_isActive" ON external_mcp_servers("isActive");
      `);
      console.log('External MCP servers table ready');
    } catch (e) {
      console.log('External MCP servers table may already exist or error:', e.message);
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
      console.log('Prompt library table ready');
    } catch (e) {
      console.log('Prompt library table may already exist or error:', e.message);
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
      console.log('System settings table ready');
      
      // Set default MCP auth mode
      await sequelize.query(`
        INSERT INTO system_settings (key, value, description) 
        VALUES ('mcp', '{"authMode": "optional"}', 'MCP server authentication settings')
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (e) {
      console.log('System settings table may already exist or error:', e.message);
    }
    
    await createDefaultUser();
    await createDefaultTool();
  } catch (error) {
    console.error('Database connection error:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB, loadModels };
