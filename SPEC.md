# MCPConnect Server Specification

## 1. Project Overview

**Project Name:** MCPConnect (Model Context Protocol Connect)
**Project Type:** Node.js/Express Backend + React Frontend
**Core Functionality:** A middleware server where users configure integrations with ANY third-party API, create "Tools" (named API endpoints), and external consumers (Claude, Opencode, IDEs) consume those tools via unified REST API
**Target Users:** Developers, DevOps engineers, AI assistants

---

## 2. Architecture

```
External Consumers (Claude, Opencode, IDEs)
           │
           ▼
┌─────────────────────────────────────────┐
│            MCP Server                   │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │   Express   │  │   JWT Auth      │  │
│  │   REST API  │  │   Middleware    │  │
│  └─────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────┐│
│  │       Integration Adapters          ││
│  │  Jira | Jenkins | Bitbucket | GitHub││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │     Configuration Manager           ││
│  └─────────────────────────────────────┘│
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│           MongoDB Database              │
│  Users | Integrations | Workflows | Logs│
└─────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcrypt |
| Encryption | AES-256 (crypto-js) |
| Frontend | React + Vite |
| API Docs | Swagger/OpenAPI |

---

## 4. Generic Integration Architecture

The MCP Server uses a **Dynamic Adapter** pattern that supports ANY third-party API:

### 4.1 Supported Authentication Types
- **None**: No authentication
- **Basic**: Username + Password
- **Bearer**: OAuth2 / JWT tokens
- **API Key**: Custom header or query param
- **OAuth2**: Full OAuth2 flow

### 4.2 How It Works
1. User adds integration with their API endpoint
2. Selects auth type and provides credentials (encrypted)
3. Creates custom "Tools" by defining endpoints
4. External consumers call these tools via unified API

This allows integration with ANY REST API:
- Jira, GitHub, GitLab, Bitbucket
- Notion, Slack, Discord
- AWS, Azure, GCP
- Custom internal APIs
- And more!

### 4.1 User
```javascript
{
  _id: ObjectId,
  email: String (unique),
  password: String (hashed),
  name: String,
  role: String (admin/user),
  createdAt: Date,
  updatedAt: Date
}
```

### 4.2 Integration
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  type: String (jira/jenkins/bitbucket/github),
  name: String,
  config: {
    baseUrl: String,
    credentials: {
      apiKey: String (encrypted),
      token: String (encrypted),
      oauth: Object (encrypted)
    }
  },
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.3 Workflow
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  name: String,
  trigger: {
    type: String (manual/webhook/scheduled),
    source: String,
    event: String
  },
  actions: [{
    integrationId: ObjectId,
    action: String,
    params: Object
  }],
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.4 AuditLog
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  action: String,
  integrationType: String,
  details: Object,
  status: String,
  timestamp: Date
}
```

---

## 5. API Endpoints

### 5.1 Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login (get JWT) |
| GET | /api/auth/me | Get current user |
| POST | /api/auth/refresh | Refresh token |

### 5.2 Integrations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/integrations | List integrations |
| POST | /api/integrations | Create integration |
| GET | /api/integrations/:id | Get details |
| PUT | /api/integrations/:id | Update |
| DELETE | /api/integrations/:id | Delete |
| POST | /api/integrations/:id/test | Test connection |

### 5.3 Jira API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/jira/create-issue | Create issue |
| GET | /api/jira/issues | List issues |
| GET | /api/jira/issues/:key | Get issue |
| PUT | /api/jira/issues/:key | Update issue |
| POST | /api/jira/issues/:key/comment | Add comment |
| GET | /api/jira/projects | List projects |

### 5.4 Jenkins API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/jenkins/trigger-build | Trigger build |
| GET | /api/jenkins/jobs | List jobs |
| GET | /api/jenkins/jobs/:name | Get job |
| GET | /api/jenkins/jobs/:name/builds | Build history |

### 5.5 Bitbucket API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/bitbucket/create-repo | Create repo |
| GET | /api/bitbucket/repos | List repos |
| GET | /api/bitbucket/repos/:slug | Get repo |
| POST | /api/bitbucket/repos/:slug/commits | Create commit |

### 5.6 Consumer API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/consume/trigger | Trigger action |
| GET | /api/consume/integrations | List integrations |

### 5.7 Workflows
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/workflows | List workflows |
| POST | /api/workflows | Create workflow |
| POST | /api/workflows/:id/execute | Execute |
| DELETE | /api/workflows/:id | Delete |

---

## 6. Integration Adapters

### 6.1 Adapter Interface
```javascript
class BaseAdapter {
  constructor(config) {}
  async testConnection() {}
  async createIssue(data) {}
  async getIssues(filters) {}
  async triggerBuild(job, params) {}
  async createRepo(data) {}
}
```

### 6.2 Supported Adapters
- **JiraAdapter**: Jira REST API v3
- **JenkinsAdapter**: Jenkins REST API
- **BitbucketAdapter**: Bitbucket Cloud API v2
- **GitHubAdapter**: GitHub REST API v3

---

## 7. Security

### 7.1 Authentication Flow
1. User registers/logins → receives JWT access token
2. Access token in Authorization header
3. Token expiry: 15 min access, 7 day refresh

### 7.2 Encryption
- AES-256-GCM for stored credentials
- Key from environment variable
- PBKDF2 key derivation

### 7.3 API Security
- Rate limiting: 100 req/min
- CORS enabled
- Request validation

---

## 8. Frontend Pages
1. **Login/Register** - Auth forms
2. **Dashboard** - Overview & activity
3. **Integrations** - CRUD platform connections
4. **Workflows** - Automation rules
5. **Settings** - User preferences

---

## 9. File Structure

```
mcp-server/
├── server/
│   ├── src/
│   │   ├── config/database.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Integration.js
│   │   │   ├── Workflow.js
│   │   │   └── AuditLog.js
│   │   ├── adapters/
│   │   │   ├── BaseAdapter.js
│   │   │   ├── JiraAdapter.js
│   │   │   ├── JenkinsAdapter.js
│   │   │   ├── BitbucketAdapter.js
│   │   │   └── GitHubAdapter.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── integrations.js
│   │   │   ├── jira.js
│   │   │   ├── jenkins.js
│   │   │   ├── bitbucket.js
│   │   │   ├── workflows.js
│   │   │   └── consume.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── validation.js
│   │   ├── services/
│   │   │   ├── encryption.js
│   │   │   └── audit.js
│   │   └── index.js
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.jsx
│   └── package.json
└── README.md
```

---

## 10. Environment Variables

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/mcp-server
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
ENCRYPTION_KEY=your-32-byte-encryption-key
```

---

## 11. Docker Deployment

### docker-compose.yml

```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin123

  server:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://admin:admin123@mongodb:27017/mcpconnect

  client:
    build: ./client
    ports:
      - "5173:5173"
```

### Run with Docker

```bash
# Copy environment variables
cp .env.example .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## 11. Acceptance Criteria

### Phase 1
- [x] Express server runs on port 3000
- [x] User register/login with JWT
- [x] Integrations CRUD with encrypted credentials
- [x] /api/jira/create-issue works
- [x] /api/jenkins/trigger-build works
- [x] /api/bitbucket/create-repo works

### Phase 2
- [x] React frontend loads
- [x] Integration management UI
- [x] Workflow creation UI
- [x] Real-time feedback
