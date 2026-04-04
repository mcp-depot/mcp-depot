# MCPConnect - Local Development Setup

## Overview
MCPConnect is a middleware platform that allows you to connect to any third-party API (GitHub, Jira, Bitbucket, etc.), create "Tools" from those integrations, and expose them for external consumers (Claude, OpenCode, IDEs) to consume via REST API.

## Prerequisites

- **Node.js** (v20+)
- **npm** (comes with Node.js)
- **Docker** and **Docker Compose** (for database)
- **Git** (optional, for cloning)

## Local Development Setup

### Option 1: Using Docker (Recommended)

This runs all services in containers with minimal setup:

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository-url>
   cd mcpconnect
   ```

2. **Copy environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start all services**:
   ```bash
   docker-compose up -d
   ```

4. **Wait for services to start** (about 30-60 seconds):
   - PostgreSQL database: `mcpconnect-postgres` on port 5432
   - Backend API: `mcpconnect-server` on port 3000
   - Frontend: `mcpconnect-client` on port 5173

5. **Verify services are running**:
   ```bash
   docker ps
   # You should see 3 containers: mcpconnect-postgres, mcpconnect-server, mcpconnect-client
   ```

6. **Access the application**:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - API Health Check: http://localhost:3000/api/mcp/hello

### Option 2: Manual Setup (For Development)

If you prefer to run services directly on your machine:

#### 1. Setup PostgreSQL
```bash
# Using Docker just for PostgreSQL (simplest)
docker run --name mcp-postgres -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=admin123 -e POSTGRES_DB=mcpconnect -p 5432:5432 -d postgres:15

# OR install PostgreSQL locally and create database:
# createdb mcpconnect
```

#### 2. Setup Backend
```bash
cd server
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env to set:
# DATABASE_URL=postgres://admin:admin123@localhost:5432/mcpconnect
# JWT_SECRET=your-secret-key
# ENCRYPTION_KEY=your-32-byte-key

# Start the server
npm run dev
# Server runs on http://localhost:3000
```

#### 3. Setup Frontend
```bash
cd ../client
npm install

# Configure API URL (points to backend)
# Already configured in vite.config.js to proxy to http://localhost:3000

# Start the frontend
npm run dev
# Frontend runs on http://localhost:5173
```

## Environment Variables

### Backend (.env)
```
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgres://admin:admin123@localhost:5432/mcpconnect

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Encryption (32 bytes base64 encoded)
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# CORS
CORS_ORIGIN=http://localhost:5173
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3000
```

## Database Schema

Run these migrations to create tables (if not using Docker which auto-creates):

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  must_reset_password BOOLEAN DEFAULT true,
  api_key VARCHAR(255) UNIQUE,
  api_key_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Integrations table
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL DEFAULT 'custom',
  name VARCHAR(255) NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tools table
CREATE TABLE tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  integration_id UUID REFERENCES integrations(id),
  name VARCHAR(500) NOT NULL,
  description TEXT,
  endpoint JSONB NOT NULL,
  input_schema JSONB DEFAULT '{}',
  output_schema JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  rate_limit INTEGER DEFAULT 0,
  cache_ttl INTEGER DEFAULT 0,
  transform_request JSONB DEFAULT '{}',
  transform_response JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## First-Time Setup

1. **Create Admin User**:
   ```bash
   # Using the registration endpoint
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"Admin@123","name":"Admin User"}'
   ```

2. **Login to Get Token**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"Admin@123"}'
   ```
   
   Save the accessToken from the response.

3. **Test API Access**:
   ```bash
   curl -H "Authorization: Bearer <your-access-token>" \
     http://localhost:3000/api/auth/me
   ```

## MCP Server (For Claude Code Integration)

MCPConnect includes an MCP-compatible server that translates MCP calls to REST API calls:

1. **Install the MCP wrapper**:
   ```bash
   cd mcp-connect-wrapper
   npm install -g .
   ```

2. **Start the MCP server**:
   ```bash
   mcp-connect --port 3001
   ```

3. **Configure Claude Code** to use:
   - Server URL: http://localhost:3001
   - No authentication needed (localhost only)

### Using Standard MCP Commands

Our MCP server implements the standard Model Context Protocol, so you can use standard MCP clients and commands:

#### **Available MCP Methods**:
- `tools/list` - List all available tools (API endpoints)
- `tools/call` - Execute a specific tool with arguments

#### **Using with Claude CLI** (if available):
If Claude CLI supports MCP server connections, you would typically use:
```bash
# Add MCPConnect as an MCP server
claude mcp add mcpconnect http://localhost:3001

# List available tools
claude mcp list

# Use a tool (example)
claude mcp call get-issue --args '{"repo":"owner/repo","issue_number":123}'
```

#### **Manual MCP Testing with curl**:
You can test the MCP server directly using curl or any HTTP client:

```bash
# List all available tools
curl -s -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq .

# Call a specific tool (get GitHub issues example)
curl -s -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "Get Github Issues",
      "arguments": {
        "owner": "microsoft",
        "repo": "vscode",
        "state": "open"
      }
    }
  }' | jq .

# Call a tool with no arguments
curl -s -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "Get Github Repo Info",
      "arguments": {
        "owner": "microsoft",
        "repo": "vscode"
      }
    }
  }'
```

#### **Using with Other MCP Clients**:
Any MCP-compatible client can connect to our server at `http://localhost:3001`:
1. The client will automatically call `tools/list` to discover available tools
2. When you select a tool, the client will call `tools/call` with the tool name and arguments
3. Our server translates these to the appropriate REST API calls to your configured integrations

### Example Workflow:

1. **Setup an integration** (e.g., GitHub) via the web UI at http://localhost:5173
2. **Create a tool** (e.g., "Get Github Issues" with GET /repos/{owner}/{repo}/issues)
3. **Start MCP server**: `mcp-connect --port 3001`
4. **Use with Claude CLI**: `claude mcp call "Get Github Issues" --args '{"owner":"yourname","repo":"yourproject"}'`
5. **Result**: You'll get the GitHub issues returned through the MCP connection

### Response Format:
All MCP responses follow the JSON-RPC 2.0 format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    // Tool execution result here
  }
}
```

Error responses follow the same format with an `error` field instead of `result`.

## Development Workflow

### Making Changes

1. **Backend Changes**:
   - Edit files in `server/`
   - Restart: `npm run dev` (in server directory)
   - API docs available at: http://localhost:3000/api-docs

2. **Frontend Changes**:
   - Edit files in `client/`
   - Restart: `npm run dev` (in client directory)
   - Hot module replacement enabled

3. **Database Changes**:
   - Update models in `server/src/models/`
   - Run migrations manually or recreate tables
   - With Docker: `docker-compose down -v && docker-compose up -d`

## Testing

### API Testing
```bash
# Test backend health
curl http://localhost:3000/api/mcp/hello

# Test integrations endpoint (requires auth)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/integrations
```

### Frontend Testing
- Visit http://localhost:5173
- Register/login with test credentials:
  - Email: demo@mcpconnect.io
  - Password: Demo@123

## Troubleshooting

### Common Issues

1. **Database Connection Failed**:
   - Check PostgreSQL is running: `docker ps | grep postgres`
   - Verify DATABASE_URL in backend .env
   - Ensure network allows connection to localhost:5432

2. **Port Already in Use**:
   - Check what's using the port: `lsof -i :3000`
   - Kill process or change PORT in .env

3. **CORS Errors**:
   - Ensure frontend and backend origins match
   - Check CORS_ORIGIN setting in backend .env

4. **Encryption Errors**:
   - Verify ENCRYPTION_KEY is 32 bytes
   - Ensure same key used for encryption and decryption

### Logs
```bash
# Backend logs
docker-compose logs -f server

# Frontend logs  
docker-compose logs -f client

# Database logs
docker-compose logs -f postgres
```

## Production Considerations

When moving to production:

1. **Environment**:
   - Set NODE_ENV=production
   - Use strong, random secrets
   - Enable HTTPS

2. **Database**:
   - Use managed PostgreSQL service
   - Configure backups
   - Set connection limits

3. **Security**:
   - Rate limit API endpoints
   - Enable request logging
   - Regular dependency updates: `npm audit`

4. **Monitoring**:
   - Add health check endpoints
   - Monitor response times
   - Set up error alerting

## Directory Structure

```
mcpconnect/
├── .env                  # Environment variables
├ .env.example           # Template
├── docker-compose.yml   # Docker services
├── SPEC.md              # Technical specification
├── mcp-connect-wrapper/ # MCP server wrapper
│   ├── mcp-wrapper.cjs  # MCP server implementation
│   └── package.json     # Dependencies and bin
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API services
│   │   └── App.jsx      # Root component
│   ├── package.json
│   └── vite.config.js   # Vite configuration
└── server/              # Node.js backend
    ├── src/
    │   ├── config/      # Database and environment
    │   ├── middleware/  # Auth, validation
    │   ├── models/      # Database models
    │   ├── routes/      # API endpoints
    │   ├── services/    # Business logic
    │   ├── adapters/    # API adapters
    │   └── index.js     # Entry point
    ├── package.json
    └── Dockerfile
```

## Getting Help

- Check the logs: `docker-compose logs -f [service]`
- Review SPEC.md for technical details
- Test endpoints directly with curl or Postman
- Browser DevTools for frontend debugging

Happy coding! 🚀