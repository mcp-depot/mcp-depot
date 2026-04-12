# MCPConnect — Market Analysis

## Competing Platforms

### Composio (2026)
- **Integrations**: 850+ managed toolkits
- **OAuth**: Built-in with auto-refresh
- **Tool Router**: Single MCP endpoint that dynamically discovers tools
- **Governance**: RBAC per action, SOC 2 Type 2, ISO certified
- **Pricing**: $29-228/month (per task volume)

### Zapier MCP (2026)
- **Integrations**: 8,000+ apps, 30,000+ actions
- **OAuth**: Built-in
- **Tool Router**: None
- **Governance**: Basic
- **Pricing**: Per-task billing (2 tasks/call)

### MCPConnect (ours)
- **Integrations**: User-defined from OpenAPI (custom)
- **OAuth**: Manual token entry (no auto-refresh)
- **Tool Router**: None
- **Governance**: Basic auth
- **Pricing**: Self-host (infrastructure cost only)

---

## Comparison Table

| Feature | Composio | Zapier MCP | MCPConnect |
|---------|----------|-----------|------------|
| Pre-built tool packs | 850+ | 8,000+ | User creates |
| OAuth Manager | ✅ | ✅ | ❌ |
| Auto-refresh tokens | ✅ | ✅ | ❌ |
| Tool Router | ✅ | ❌ | ❌ |
| Multi-tenant SaaS | ✅ | ✅ | ❌ |
| RBAC per action | ✅ | Basic | ❌ |
| Audit logs | ✅ Full | ✅ | ✅ |
| Self-hosted option | ❌ | ❌ | ✅ |
| Per-task cost | $29+/mo | Usage-based | Infra only |

---

## Our Unique Value Proposition

**Position**: Self-hosted integration platform for teams who want:

1. **Data privacy** - Data stays on your infrastructure
2. **Full control** - Custom integrations, not limited to pre-built tools
3. **No per-task billing** - Fixed infrastructure cost
4. **Custom workflows** - Build exactly what you need

**Different from Composio/Zapier**:
- They = "consume pre-built" (SaaS)
- We = "build your own" (self-hosted)

**Gaps to Address (based on competition)**

| Gap | Priority | Notes |
|----|----------|-------|
| OAuth Manager | High | Auth is where 90% of integrations die |
| Pre-built Tool Marketplace | High | Network effect - nobody has this for MCP |
| Tool Router | Medium | Single endpoint dynamic discovery |
| RBAC per action | Low | For team/enterprise use |

---

## Market Positioning

**Target**: Teams who want:
- Self-hosted MCP (data control)
- Custom integrations (not limited to vendor's catalog)
- No per-task costs at scale

**Elevator pitch**:
> "MCPConnect lets you build custom MCP tools from any REST API — self-hosted, full control, no per-task fees."

**Competitors serve**:
- Zapier → Teams who want pre-built, no-code
- Composio → Teams who want pre-built + some customization
- MCPConnect → Teams who want full control + custom tools

---

## Features for Review Discussion

1. **OAuth Manager** - Worth implementing? Or stick to manual tokens?
2. **Tool Marketplace** - Pre-built packs vs marketplace from community?
3. **Tool Router** - Needed for large tool catalogs?
4. **Multi-tenant** - Self-hosted multi-user support?
5. **RBAC** - Per-action permissions for teams?