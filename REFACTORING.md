# Toolshed - Engineering Log

> All resolved review rounds are in git history. This file tracks only active items.

---

## Pre-Commit Checklist

Before every commit:
```
cd server && npm install       # if deps changed
npm test                       # run tests
docker-compose up -d           # smoke test
# - Can you log in?
# - Can you add an integration and a tool?
# - Does curl http://localhost:3000/health respond?
npm run lint                   # if eslint configured
```

> NEVER run `docker-compose down -v` — the `-v` flag permanently destroys all data volumes.
> To restart: `docker-compose restart`
> To wipe safely: back up first:
> `docker exec toolshed-postgres pg_dump -U admin toolshed > toolshed_backup.sql`

---

## Phase Summary (all completed)

| Phase | Description | Status | Key Commit |
|-------|-------------|--------|------------|
| 0 | Pre-launch security (role escalation, secrets, registration guard) | Done | `43fc79d` |
| 1 | Foundation (DB sync, retry, Joi validation, mustResetPassword) | Done | `5fe631a` |
| 2 | MCP protocol (native server, stdio, HTTP transport) | Done | `5892aed` |
| 3 | Engineering grade (pino logging, metrics, test coverage) | Done | `8a4f152` |
| 4 | Feature completeness (OpenAPI import, body templates, mock mode) | Done | `f35cd8a` |
| 5 | Open-source prep (LICENSE, CONTRIBUTING, README, docs/connect) | Done | `1b18a7f` |

---

## Open Technical Debt

These are deferred - not blocking launch but worth picking up.

| ID | File | Issue |
|----|------|-------|
| TD-1 | `services/rate-limiter.js` | `setInterval` never cleared - call `.unref()` so it does not keep the process alive |
| TD-2 | `services/metrics.js` | `Date.now()` used for histograms - switch to `process.hrtime.bigint()` for sub-millisecond precision |
| TD-3 | `routes/integrations.js` | `lastFetchError` captured in model but never surfaced in UI |
| TD-4 | `models/` | TypeScript migration + Prisma (large effort, own branch when ready) |
| TD-5 | `mcp/server.js` | Issue 16 (MCP tool calls not logged) - fixed for REST path in `d5e62c1`, verify MCP path also logs correctly |

---

## mcp-connect-wrapper - Fix Before npm Publish

The wrapper at `mcp-connect-wrapper/` is a working stdio bridge. Five issues to fix before promoting to `packages/mcp-client/` and publishing to npm:

| # | Issue |
|---|-------|
| 1 | SDK path walks directory tree to find `node_modules` - fragile outside dev; add proper `package.json` dependency |
| 2 | API key stored plaintext in `config.json` - use OS keychain (`keytar`) or at minimum warn the user |
| 3 | Tools fetched once at startup - no live refresh when tools change in the UI |
| 4 | All params typed as `string` - loses number/boolean type info from the tool definition |
| 5 | `login()` uses bare `return` at top level - should be `process.exit(0)` |

---

## Deferred Features (future phases)

| Item | Notes |
|------|-------|
| TypeScript + Prisma migration | Large effort - own branch |
| Workflow execution engine | Depends on composite tools design (Feature 6 in BACKLOG) |
| GraphQL support | Low demand currently |
| File upload / multipart | Needed for some API integrations |
| Pagination helper | Needed once tool lists get large |
| `ALLOW_REGISTRATION` env flag | Lets admins disable open registration for public-facing deployments |
