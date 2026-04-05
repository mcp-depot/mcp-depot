# Contributing to MCPConnect

Thank you for your interest in contributing!

## Quick Start

```bash
# Clone the repository
git clone https://github.com/mcpconnect/mcpconnect.git
cd mcpconnect

# Start the application
docker compose up -d

# Access the application
# Server: http://localhost:3000
# Client: http://localhost:5173
# Admin: admin@mcpconnect.io / Demo@123
```

## Development

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+

### Running Locally

```bash
# Server
cd server
npm install
npm run dev

# Client
cd client
npm install
npm run dev
```

## Branch Naming

- `feat/` - New features
- `fix/` - Bug fixes
- `chore/` - Maintenance tasks
- `docs/` - Documentation

## Commit Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add OpenAPI import support
fix: resolve encryption silent failure
chore: update dependencies
docs: add API documentation
```

## Pull Request Checklist

- [ ] Tests pass (if applicable)
- [ ] No `console.*` calls introduced (use logger)
- [ ] TypeScript compiles without errors (if adding .ts files)
- [ ] Documentation updated if relevant
- [ ] Related issue linked (closes #123)

## Code Style

- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused
- Use async/await over promises

## Testing

```bash
# Server tests
cd server
npm test

# Client tests
cd client
npm test
```

## Questions?

- Open an issue: https://github.com/mcpconnect/mcpconnect/issues
- Discussions: https://github.com/mcpconnect/mcpconnect/discussions
