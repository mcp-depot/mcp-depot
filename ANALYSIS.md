# Toolshed - Market Analysis

> Last updated: April 2026. Review quarterly - the MCP ecosystem is moving fast.

---

## Competing Platforms

### Composio (2026)
- **Integrations**: 850+ managed toolkits
- **OAuth**: Built-in with auto-refresh
- **Tool Router**: Single MCP endpoint that dynamically discovers tools
- **Governance**: RBAC per action, SOC 2 Type 2, ISO certified
- **Pricing**: $29-228/month (per task volume)
- **Self-hosted**: No

### Zapier MCP (2026)
- **Integrations**: 8,000+ apps, 30,000+ actions
- **OAuth**: Built-in
- **Tool Router**: None
- **Governance**: Basic
- **Pricing**: Per-task billing (2 tasks/call)
- **Self-hosted**: No

### Smithery (2026)
- **What it is**: Registry/marketplace for community MCP servers (not a gateway)
- **Model**: Browse and install pre-built MCP servers; does not help you connect your own APIs
- **Pricing**: Free registry; hosted option emerging
- **Self-hosted**: N/A (it is a directory, not a server)
- **Relevance**: Toolshed's Tool Marketplace (Feature 1) would compete here - but Toolshed goes further by letting you build custom tools, not just install pre-built ones

### n8n (2026)
- **What it is**: Self-hosted workflow automation (like Zapier, open-source)
- **MCP angle**: Adding MCP support; can expose workflows as MCP tools
- **Strength**: 400+ integrations, visual builder, large community
- **Weakness**: Workflow-first, not tool-first; MCP is a bolt-on, not core
- **Relevance**: Overlapping audience (self-hosted, dev-friendly). Toolshed wins on simplicity for pure MCP use cases; n8n wins on complex multi-step workflows

### Glama.ai (2026)
- **What it is**: MCP gateway and tool router, cloud-hosted
- **Model**: Connects multiple MCP servers behind one endpoint
- **Pricing**: SaaS, usage-based
- **Self-hosted**: No
- **Relevance**: Closest architectural competitor to Toolshed - same "one MCP endpoint" concept but cloud-only

---

## Comparison Table

| Feature | Composio | Zapier MCP | Smithery | n8n | Glama | **Toolshed** |
|---------|----------|------------|----------|-----|-------|------------|
| Pre-built tool packs | 850+ | 8,000+ | Community | 400+ | Growing | Marketplace (planned) |
| Custom API tools | Limited | No | No | Yes (complex) | No | Yes - core feature |
| OAuth Manager | Yes | Yes | N/A | Yes | Yes | In progress |
| Auto-refresh tokens | Yes | Yes | N/A | Yes | Yes | In progress |
| Self-hosted | No | No | N/A | Yes | No | Yes |
| Per-user credentials | No | No | N/A | No | No | Planned (Feature 11) |
| Multi-user / teams | Yes | Yes | N/A | Yes | Yes | Yes |
| Audit logs | Full | Yes | No | Yes | Partial | Yes |
| Secret store (Infisical) | No | No | No | No | No | Yes |
| Mock mode | No | No | No | No | No | Yes |
| OpenAPI import | No | No | No | No | No | Yes |
| Skills / prompt library | No | No | No | No | No | Yes (planned) |
| Per-task cost | $29+/mo | Usage-based | Free | Self-host | Usage-based | Infra only |
| Open source | No | No | Yes (registry) | Yes | No | Yes |

---

## Our Unique Value Proposition

**Position**: The self-hosted, open-source MCP gateway for teams who want control.

**Three things nobody else offers together:**

1. **Build your own tools from any REST API** - not limited to a vendor catalog. Paste an OpenAPI spec, import 20 tools in seconds. Write a custom endpoint, it is an MCP tool in minutes.

2. **Data and credentials never leave your infrastructure** - Composio and Zapier hold your API tokens. Toolshed encrypts them in your own database, or references them from your own Infisical/Vault instance. The AI never sees credentials.

3. **No per-task billing at scale** - Composio charges per task. At 10,000 tool calls/day that is real money. Toolshed costs whatever your server costs.

**The "bring your own key" model (unique):**
Admin defines integration structure once (base URL, tools, endpoints). Each team member connects their own API token. One Jira integration definition, 20 engineers each using their own credentials. Neither Composio nor Zapier nor n8n offer this.

**Different from every competitor:**
- Composio/Zapier: consume pre-built (SaaS, you trust them with keys)
- n8n: workflow-first, MCP is secondary
- Smithery: directory, not a gateway
- Glama: cloud-only gateway, no customization
- Toolshed: build your own (self-hosted, open-source, your keys, your rules)

---

## Target Audience

**Primary:** Developer teams (5-50 people) using Claude Code, Cursor, or Windsurf who:
- Have internal APIs (Jira, Jenkins, internal services) not covered by Composio
- Work in regulated industries where data leaving the org is a concern
- Are already self-hosting other infrastructure (Gitea, Grafana, n8n)
- Want to avoid per-task billing at moderate-to-high tool call volumes

**Secondary:** Individual power users / hobbyists who:
- Want a personal MCP hub for their own APIs
- Are building AI workflows and need a controlled tool server
- Contribute to or build on top of open-source projects

**Not our audience (for now):**
- Teams who want 8,000 pre-built integrations with no setup - use Zapier MCP
- Teams who need SOC 2 / ISO compliance out of the box - use Composio
- Teams with no technical staff to self-host - use any SaaS option

---

## Go-to-Market Strategy

**Phase 1 - Community launch (before public release):**
- Fix Phase 0 blockers (all done) and OAuth refresh bugs (Issues 15-18)
- Rename to Toolshed, clean README, record a 2-min demo GIF
- Post to: Hacker News (Show HN), r/selfhosted, r/ClaudeAI, r/LocalLLaMA
- Target: 100 GitHub stars in first week

**Phase 2 - Grow through the MCP ecosystem:**
- Submit to Smithery registry (even as a self-hosted option)
- Write integration guides: "Replace Composio with Toolshed for Jira"
- Blog post: "Why we built a self-hosted MCP gateway instead of using Composio"
- Target: contributor PRs, issue reports, community tool packs

**Phase 3 - Network effect via Marketplace (Feature 1):**
- Community submits tool packs (Jira Pack, GitHub Pack, Jenkins Pack)
- Toolshed becomes the place to share MCP tool definitions
- Every pack install = potential new Toolshed deployment

---

## Elevator Pitches

**One sentence:**
Toolshed is a self-hosted MCP gateway that turns any REST API into an AI tool - your credentials, your infrastructure, no per-task fees.

**Show HN title:**
Show HN: Toolshed - self-hosted MCP gateway, turn any API into an AI tool

**Twitter/X:**
Tired of paying per-task for AI integrations? Toolshed is a self-hosted MCP gateway. Connect your APIs once, use them from Claude Code, Cursor, Windsurf. Open source, your keys, your server.

**For developers:**
One Docker Compose command. Import your OpenAPI spec. Your entire API surface becomes an MCP tool. Works with any AI client that speaks MCP.

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Composio adds self-hosted option | Medium | OSS moat - community, forks, integrations; they would need to open-source |
| MCP protocol changes significantly | Low | Protocol is Anthropic-backed and stabilising; adapter pattern isolates changes |
| n8n launches MCP-first mode | Medium | Focus on simplicity - Toolshed is easier to set up for pure MCP use cases |
| Low contributor engagement | Medium | Good docs, small well-scoped issues, active Discord/GitHub Discussions |
| OAuth complexity puts off users | High (now) | Fix Issues 15-18 before launch; OAuth must work on first try |

---

## Open Questions for Next Review

1. **Licensing** - AGPL-3.0 forces contributions back; ELv2 blocks third-party SaaS hosting. Decision needed before public release.
2. **Hosted option** - Should Toolshed.dev offer a managed tier? Creates revenue but competes with self-hosted positioning.
3. **Tool Marketplace hosting** - GitHub repo (free, low friction) vs hosted registry (more features, more work). Start with GitHub.
4. **Discord vs GitHub Discussions** - Where does the community live? Discord is more active but GitHub Discussions keeps context with issues/PRs.
