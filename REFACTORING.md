# MCPConnect — Refactoring Log

> **Review process (updated 2026-04-06):**
> Past review rounds have been collapsed into the commit table below — the full back-and-forth is in git history.
> Going forward: push your commit, then tell the reviewer the hash. The reviewer will run `git diff <prev>..<new>` and write a focused comment block — no full-file re-reads, no token waste.
>
> **Developer action needed:** All current issues are resolved. What are you working on next? (Suggested: `1-G` Joi validation, or `3-C` test coverage.) Share the commit hash when ready.

---

## Open Review — commit `5892aed`

All issues from `bf33c3b` are now fixed.

---

## Phase Status

| Phase | Items | Status | Last Commit |
|---|---|---|---|
| 0 — Pre-launch security | 0-A, 0-B, 0-C, 0-D | ✅ All done | `43fc79d` |
| 1 — Stabilize foundation | 1-A through 1-J (excl. 1-G, 1-I) | ✅ Done / deferred noted | `da7d228` |
| 2 — MCP Protocol | 2-A (native server), 2-B, 2-C, 2-D | ✅ Done | `d8f3a12` |
| 3 — Engineering grade | 3-B (logging), 3-D (security), 3-E (metrics) | ✅ Done | `da7d228` |
| 4 — Feature completeness | 4-A (OpenAPI import), 4-F (retry backoff) | ✅ Done | `da7d228` |
| 5 — Open-source launch | 5-A (AGPL-3.0), 5-B (CI, CONTRIBUTING) | ✅ Done | `da7d228` |
| Pre-launch cleanup | Artifacts, `.gitignore` | ✅ Done | `43fc79d` |

---

## Resolved Review Rounds

| Commit | What changed | Outcome |
|---|---|---|
| `32f0ade`–`da7d228` | Phases 0–5 initial implementation | 18 issues found across security, logging, metrics, MCP protocol |
| `43fc79d` | Security fixes, cleanup, prod secret validation | All critical issues closed |
| `85bf93b` | Native `McpServer` implementation | 8 issues found (2 crash, 1 bug, 3 missing, 2 minor) |
| `7d1b148` | SDK imports, HTTP transport, refresh hooks, CORS | 5 of 8 fixed; 2 new critical found, 3 minor found |
| `d8f3a12` | stdio import, server singleton, console.*, env rename, httpTransports | All 5 remaining issues closed |
| `bf33c3b` | Phase 2-A follow-up review fixes | 2 new crashes introduced (try block, httpTransports) |
| `5892aed` | Fix two crashes from review | All issues resolved |

---

## Open Items

### Technical debt (deferred — not blocking launch)

| ID | Area | Issue |
|---|---|---|
| 1-G | Input validation | Joi validation not applied consistently to all routes |
| 1-I | UX | `lastFetchError` display, `responseTime` surface in UI |
| 2-B-1 | `stdio-mcp.js` | `buildCommand` drops command for Python runtime — `safeJsonParse` on a plain string returns `[]` |
| 2-B-2 | `stdio-mcp.js` | Timed-out `proc.kill()` not registered with process-registry — SIGKILL fallback never fires |
| 2-B-3 | `stdio-mcp.js` | `validateJsonRpcResponse` falsy check fails for `id: 0` — change to `=== undefined \|\| === null` |
| 2-B-4 | `stdio-mcp.js` | `console.error` in `safeJsonParse` — should use pino logger |
| 3-C | Testing | No meaningful test coverage — placeholder only |
| rate-limiter | Cleanup | `setInterval` never cleared — use `.unref()` |
| metrics | Precision | `Date.now()` for histograms — use `process.hrtime.bigint()` |

### Deferred (future phases)

| ID | Item |
|---|---|
| 3-A | TypeScript migration + Prisma |
| 4-B | Workflow execution engine |
| 4-C | GraphQL support |
| 4-D | File upload / multipart |
| 4-E | Pagination helper |

### `mcp-connect-wrapper` — promote before open-source

The wrapper is a working stdio MCP bridge — it should be moved to `packages/mcp-client/` and published to npm, not deleted. Five issues to fix before promotion:

| # | Issue |
|---|---|
| 1 | SDK path resolution walks directory tree — fragile outside dev. Add proper `package.json` dep |
| 2 | API key stored plaintext in `config.json` — use OS keychain (`keytar`) or warn user |
| 3 | Tools fetched once at startup — no live updates when tools change in UI |
| 4 | All params typed as `string` — loses number/boolean type info from tool definition |
| 5 | `login()` uses `return` at top level — should be `process.exit(0)` |

---

## Next Steps (suggested order)

1. **`1-G`** — Joi validation: last input-safety gap before accepting community PRs
2. **`3-C`** — Real test coverage: a placeholder CI gate misleads contributors
3. **`2-B`** — Fix `stdio-mcp.js` tech debt (4 small issues, one batch commit)
4. **`mcp-client` package** — Promote wrapper, fix 5 issues, publish to npm
5. **`3-A`** — TypeScript + Prisma (large effort, own branch)
