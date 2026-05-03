# MCP Depot — Developer Roadmap

> Sequenced work order based on scope review (May 2026).
> Core identity: **the best lightweight, self-hosted connector between AI assistants and developer toolchains** (Jira, Jenkins, GitHub, Bitbucket, Confluence).
> Features 20 (marketplace), 23 (OIDC), 33 (federation) are explicitly deferred — they belong to a different product category.

---

## Phase 0 — Security hardening (do before shipping to any real user)

These are not enhancements — they are pre-conditions. Do not invite external users until all three are done.

| # | What | Reference |
|---|------|-----------|
| 0.1 | Hash `User.apiKey` with SHA-256; show plaintext once at creation | Issue 105 |
| 0.2 | Encrypt `Integration.config.auth.credentials` at rest using existing `encryption.js` | Issue 106 |
| 0.3 | Add `isShared: true` filter to `prompts/get` MCP handler | Issue 107 |

---

## Phase 1 — Correctness fixes (complete the features already shipped)

Features 26-30 were implemented but have gaps that will produce wrong results in production.

| # | What | Reference |
|---|------|-----------|
| 1.1 | Remove mis-applied binary detection on non-`binaryOpt` path in `mcp/server.js` | Issue 110 |
| 1.2 | Fix `fieldFilter.js` intermediate array paths silently returning empty | Issue 111 |
| 1.3 | Verify `checkRateLimit` is wired into MCP tool execution; add missing hourly window | Issue 112 |
| 1.4 | Add unique index on `PromptLibrary(name, userId)` + migration | Issue 108 |
| 1.5 | Fix `PUT /:id` prompt update — replace `||` with `!== undefined` checks | Issue 109 |
| 1.6 | Change `DataTypes.JSONB` → `DataTypes.JSON` on `inputs` field | Issue 113 |
| 1.7 | Guard `registerTool` against duplicate SDK registrations on `refreshTools()` | Issue 114 |
| 1.8 | Capture MCP `clientInfo` from `initialize`; replace hardcoded `callerType: 'mcp'` | Issue 115 |

---

## Phase 2 — Core connector: make tools work excellently

These directly improve the day-to-day experience of connecting AI to developer APIs.

| # | What | Why now | Reference |
|---|------|---------|-----------|
| ~~2.1~~ | ~~**Complete rate limiting** — hourly window + sliding window + integration-level limits~~ | ✅ **Implemented** | Feature 31 |
| ~~2.2~~ | ~~**Async watcher: `watch_until_done`** — wait for Jenkins, GitHub Actions, Bitbucket Pipelines~~ | ✅ **Implemented** | Feature 34 |
| ~~2.3~~ | ~~**MCP client identity + connected clients panel** — capture `clientInfo` from `initialize`, surface in analytics and a live connected-clients dashboard widget~~ | ✅ **Implemented** | Feature 35 + 36, Issue 115 |

---

## Phase 3 — Developer experience

Make MCPHUB easier to manage and extend.

| # | What | Why now | Reference |
|---|------|---------|-----------|
| ~~3.1~~ | ~~Integration health dashboard~~ | ✅ **Implemented** (`44c28ec`) | Feature 18 |
| 3.2 | **Tool usage analytics UI** — calls per tool, error rates, avg latency | The `ToolCall` data already exists; this just surfaces it. Payoff for the Phase 1 `callerType` work. | Feature 19 |
| ~~3.3~~ | ~~CLI management tool~~ | ✅ **Implemented** (`8ba2712`) | Feature 21 |

---

## Phase 4 — MCP protocol completeness

Fill gaps and improve the tools that are already built.

| # | What | Why now | Reference |
|---|------|---------|-----------|
| 4.1 | **Consolidate Skills + Prompts into Prompt Templates** | Both use `prompt_library` table already; two UI tabs for the same thing is confusing. Merge into one "Prompt Templates" concept with an "expose as tool / expose as slash command / both" toggle. | Code review observation |
| 4.2 | **Composite tool builder UI** — visual drag-and-drop step chain | `compositeExecutor.js` already works; this makes it accessible without writing JSON by hand | Feature 22 |
| 4.3 | **Webhook-triggered tools** — inbound Jenkins/GitHub webhooks populate an event queue the AI can consume | Complements the async watcher: watcher is pull (AI asks), webhook is push (event arrives). Together they cover the full CI feedback loop. | Feature 25 |
| 4.4 | **AI self-registration** — `mcp_register_tool` meta-tool (opt-in via `META_TOOLS_ENABLED=true`) | Only after the core is solid. The opt-in flag is essential. | Feature 16 |

---

## Deferred — revisit only if user base justifies

These were inspired by enterprise tools (IBM ContextForge, MetaMCP) but conflict with the lightweight developer-toolchain identity.

| Feature | Why deferred |
|---------|-------------|
| Feature 24 — Per-tool response caching | Risk of misleading AI responses — cached results remain stale when underlying data changes (e.g. Jira issue updated but cache returns old state). Revisit only with a reliable invalidation strategy. |
| Feature 20 — MCP marketplace browser | Different product. Adds a network dependency and ongoing maintenance against an evolving external registry. |
| Feature 23 — OIDC/SSO | Enterprise governance feature. ContextForge already does this well. Adds significant complexity for a user base that is mostly single-developer or small teams. |
| Feature 32 — OpenTelemetry | Worthwhile eventually but the `ToolCall` SQLite log covers the near-term observability need. Revisit when someone actually asks for it. |
| Feature 33 — Multi-instance federation | Enterprise orchestration. Meaningful only at a scale MCPHUB hasn't reached yet. |

---

## Quick reference: feature status

| Feature | Status | Phase |
|---------|--------|-------|
| 01–13 (original set) | Implemented | - |
| 14 (CSM integration) | Proposed | - |
| 15 (Helm chart) | Proposed | - |
| 16 (AI self-registration) | Proposed | 4.4 |
| 17 (field filtering) | Implemented | - |
| 18 (health dashboard) | ✅ Implemented | - |
| 19 (analytics UI) | Proposed | 3.2 |
| 20 (marketplace) | Deferred | - |
| 21 (CLI) | ✅ Implemented | - |
| 22 (composite UI) | Proposed | 4.2 |
| 23 (OIDC/SSO) | Deferred | - |
| 24 (caching) | Deferred | - |
| 25 (webhooks) | Proposed | 4.3 |
| 26 (annotations) | Implemented | - |
| 27 (tag filtering) | Implemented | - |
| 28 (binary responses) | Implemented | - |
| 29 (transformers) | Implemented | - |
| 30 (prompts registry) | Implemented | - |
| 31 (rate limiting) | ✅ Implemented | - |
| 32 (OTEL) | Deferred | - |
| 33 (federation) | Deferred | - |
| 34 (async watcher) | ✅ Implemented | - |
| 35 (client identity) | ✅ Implemented | 2.3 |
| 36 (connected clients panel) | ✅ Implemented | 2.3 |
| 37 (channel notifications) | ✅ Implemented | - |
