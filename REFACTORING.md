# MCPConnect — Refactoring Log

> **Review process (updated 2026-04-06):**
> Past review rounds have been collapsed into the commit table below — the full back-and-forth is in git history.
> Going forward: push your commit, then tell the reviewer the hash. The reviewer will run `git diff <prev>..<new>` and write a focused comment block — no full-file re-reads, no token waste.
>
> **Before every commit — local checklist:**
> ```
> # 1. Install deps if changed
> cd server && npm install
> cd ../client && npm install
>
> # 2. Run tests
> cd ../server && npm test
>
> # 3. Start the app and do a quick smoke test
> docker-compose up -d        # or: npm run dev in server/ and client/
> # - Can you log in?
> # - Can you add an integration and a tool?
> # - Does the MCP endpoint respond? curl http://localhost:3000/health
>
> # 4. Check for lint errors (if eslint is configured)
> npm run lint
> ```
> A commit that breaks the app locally will break it for every user who clones the repo. CI catches tests but not runtime startup errors — only a local run catches those.
>
> **Developer action needed — two items before public release:**
> - ✅ stdio-mcp.js tech debt done
> - ✅ Lucide icons added
> - ✅ README.md written with quickstart
> 1. **🔴 Fix role escalation in `auth.js`** — anyone can self-assign admin via `POST /auth/register`. Remove `role` from register schema.
> 2. **Add `ALLOW_REGISTRATION` env flag** — lets admins disable open registration for public-facing deployments.
>
> After these two: ready for GitHub public release.

---

## Open Review — User Management Security (`auth.js`)

**Reviewer** *(2026-04-06)*: No UI for adding users is fine for v1 self-hosted. Two issues found in the existing registration flow that must be fixed before going public.

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🔴 Security | `auth.js` | `role` accepted in register body — anyone can self-assign admin ✅ FIXED |
| 2 | 🟡 Missing | `auth.js` | No way to disable open registration for public deployments ✅ FIXED |
| 3 | 🟢 Minor | `auth.js` | `console.error` on line 66 — should use pino logger ✅ FIXED |

All issues fixed in commit `5cf823a`.

---

## Open Review — commits `83b8da1` + `1b18a7f` + `2c0191b` + `3c79849` (stdio, icons, README, final fixes)

**Reviewer** *(2026-04-06)*: All issues from previous round are now fixed.

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🔴 Wrong | `README.md` | Hardcoded `Demo@123` password doesn't exist ✅ FIXED |
| 2 | 🟢 Incomplete | `Dashboard.jsx` | 3rd stat card and quick action icons ✅ FIXED |
| 3 | 🟢 Minor | `README.md` | `your-org` placeholder in clone URL ✅ FIXED |

All issues resolved in commit `3c79849`.

---

## Phase Status

**Reviewer** *(2026-04-06)*: Joi validation added across all routes — good coverage. Four issues found.

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🟡 Bug | `system.js` | Import loop reads `req.body` after validating into `value` ✅ FIXED |
| 2 | 🟡 Bug | `workflows.js` | `isActive` check removed from execute route — disabled workflows now run ✅ FIXED |
| 3 | 🟡 Logic | `workflows.js` | PUT uses full `workflowSchema` (all required) — partial updates rejected ✅ FIXED |
| 4 | 🟡 Logic | `mcp.js` | Neither `toolId` nor `toolName` required — missing both gives confusing downstream error ✅ FIXED |

All issues fixed in commit `57f090a`.

---

## Phase Status

| Phase | Items | Status | Last Commit |
|---|---|---|---|
| 0 — Pre-launch security | 0-A, 0-B, 0-C, 0-D | ✅ All done | `43fc79d` |
| 1 — Stabilize foundation | 1-A through 1-J (excl. 1-I) | ✅ Done / deferred noted | `5fe631a` |
| 1-G | Joi validation | ✅ Done | `5fe631a` |
| 2 — MCP Protocol | 2-A (native server), 2-B, 2-C, 2-D | ✅ Done | `d8f3a12` |
| 3 — Engineering grade | 3-B (logging), 3-D (security), 3-E (metrics) | ✅ Done | `da7d228` |
| 3-C | Test coverage | ✅ Done | `3bb1ced` |
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
| `4f685d1` | docs/connect/ integration guides | All major AI clients covered |
| `5fe631a` | Joi validation (1-G) | Consistent input validation on all routes |

---

## Open Items

### Technical debt (deferred — not blocking launch)

| ID | Area | Issue |
|---|---|---|
| 1-G | Input validation | ✅ DONE - Joi validation applied to all routes |
| 1-I | UX | `lastFetchError` display, `responseTime` surface in UI |
| 2-B-1 | `stdio-mcp.js` | ✅ DONE - buildCommand takes args, handles runtime |
| 2-B-2 | `stdio-mcp.js` | ✅ DONE - proc.kill() now uses SIGKILL |
| 2-B-3 | `stdio-mcp.js` | ✅ DONE - validateJsonRpcResponse checks undefined/null |
| 2-B-4 | `stdio-mcp.js` | ✅ DONE - console.error replaced with pino |
| 3-C | Testing | ✅ DONE - Added encryption, validation, logger, rate-limiter tests |
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

## Next Steps (pre-launch)

1. ✅ **1-G** — Joi validation done
2. ✅ **docs/connect/** — Integration guides done
3. ✅ **3-C** — Test coverage done
4. ✅ **2-B** — stdio-mcp.js tech debt done
5. **UI: Lucide icons** — Replace text placeholders with icons
6. **README.md** — Write proper README with quickstart
7. **`mcp-client` package** — Promote wrapper, fix 5 issues, publish to npm
8. **`3-A`** — TypeScript + Prisma (large effort, own branch)

---

## Docs Request — Client Integration Guides

**Reviewer** *(2026-04-06)*: Before open-source launch, MCPConnect needs a clear `docs/connect/` section showing users how to wire it up with the AI tools they already use. This is what drives adoption — if someone can't add it to Claude Code in 2 minutes, they won't try.

Suggested structure:
```
docs/
  connect/
    README.md          ← overview + compatibility table
    claude-code.md
    cursor.md
    windsurf.md
    open-webui.md      ← covers Ollama + Open WebUI
    zed.md
    generic-mcp.md     ← for any MCP-compatible client
```

**Each guide should cover two transport modes:**

**HTTP (recommended — no local process needed):**
```json
// ~/.claude.json  (Claude Code example)
{
  "mcpServers": {
    "mcpconnect": {
      "type": "http",
      "url": "http://your-server:3000/mcp",
      "headers": { "x-api-key": "your-api-key" }
    }
  }
}
```

**stdio (via `mcp-client` wrapper — for clients that only support stdio):**
```bash
npx mcpconnect-mcp --url http://your-server:3000 --login
```
Then add to the client's MCP config:
```json
{
  "mcpServers": {
    "mcpconnect": {
      "command": "npx",
      "args": ["mcpconnect-mcp", "--url", "http://your-server:3000"]
    }
  }
}
```

**Compatibility table for the README.md:**

| Client | HTTP transport | stdio transport | Notes |
|---|---|---|---|
| Claude Code | ✅ | ✅ | HTTP preferred; use `/mcp add` |
| Cursor | ✅ | ✅ | Add via Settings → MCP |
| Windsurf | ✅ | ✅ | Add via `~/.codeium/windsurf/mcp_config.json` |
| Open WebUI + Ollama | ✅ | ❌ | HTTP only; add via Admin → Tools |
| Zed | ❌ | ✅ | stdio only currently |
| VS Code (Copilot) | ✅ | ✅ | Via `.vscode/mcp.json` |

**Developer note:** The HTTP transport (`/mcp`) is already live as of commit `5892aed`. The stdio wrapper needs the 5 fixes in the `mcp-client` section above before the stdio guide can be published accurately.
