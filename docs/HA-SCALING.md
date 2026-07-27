# Horizontal Scaling (High Availability)

By default, MCP Depot runs as a single instance. This document covers what
running more than one replica actually requires, in both Docker Compose and
Kubernetes, and the trade-offs and caveats that come with it.

---

## Why a single instance can't just be scaled up

Three subsystems keep state in-process, in memory, with no shared backing
store:

- **Rate limiting** - a sliding-window counter per tool/user/integration.
- **Circuit breaker** - per-integration failure counts and open/close state.
- **Session notifications** - Session Channel `/watch` and `/stream`
  subscribers, and MCP protocol sessions connected directly to the server.

Without a shared store, every replica has its own independent counters and
never sees another replica's events - rate limits and circuit breakers
under-enforce (each replica allows its own share of traffic through
independently), and a message posted to a Session Channel while your
request lands on replica A never reaches a client whose persistent
connection happens to be on replica B.

**Redis (or Valkey) fixes all three** - it's optional and off by default;
turning it on is what makes more than one replica actually correct, not
just possible.

---

## Docker Compose

A separate overlay file, `docker-compose-ha.yml`, adds Redis, two extra
server replicas, and an nginx load balancer - it does not change
`docker compose up -d`'s default (single-instance) behavior at all.

```bash
docker compose -f docker-compose.yml -f docker-compose-ha.yml up -d
```

This brings up 3 server replicas (`server`, `server-2`, `server-3`), a
`redis-ha` service, and an `lb` (nginx) service publishing port 3000 -
the same port the single-instance setup uses, so nothing else about how
you reach MCP Depot changes.

### Why 3 fixed replicas instead of `--scale`

Compose's `--scale server=N` names each replica
`<project>-<service>-<index>`, which depends on the project name (the
directory name, by default) - not portable enough for a static nginx
config committed to this repo. `docker-compose-ha.yml` declares 3 replicas
explicitly instead, each with a fixed network alias (`server-1`,
`server-2`, `server-3`) that nginx's config references directly.

To add more replicas: copy the `server-3` block in `docker-compose-ha.yml`
under a new name with its own alias, then add a matching
`server server-N:3000 ...;` line to `docker/nginx-ha.conf`.

### Sticky sessions use `ip_hash`, not cookies

Persistent MCP sessions (Streamable HTTP, stdio-bridge connections) and
Session Channel `/watch`/`/stream` clients need to keep hitting the same
replica. Stock/open-source nginx has no cookie-based stickiness without a
third-party module or nginx-plus, so `docker/nginx-ha.conf` uses nginx's
built-in `ip_hash` instead.

**Caveat:** clients sharing one NAT'd or proxied IP (e.g. many users behind
one corporate egress IP) collapse onto a single replica. This is a known,
accepted trade-off, not a bug - the alternative (no stickiness at all)
would break persistent sessions far more often.

### Operational note: restart `lb` after recreating server replicas

nginx resolves `server-1`/`server-2`/`server-3` once, at its own startup.
If you recreate the server replicas (new image, rolling update), their
container IPs change and nginx keeps routing to the old ones until it's
restarted:

```bash
docker compose -f docker-compose.yml -f docker-compose-ha.yml restart lb
```

---

## Kubernetes (Helm)

Redis is a values toggle, off by default (`redis.enabled: false` -
identical behavior to today). Turn it on before scaling past one replica:

```yaml
replicaCount: 2

redis:
  enabled: true
  bundled: true   # chart-managed single-pod Redis; see SPOF note below
```

```bash
helm upgrade mcp-depot ./helm/mcp-depot --namespace mcp-depot -f values.yaml
```

If `replicaCount` (or `autoscaling.maxReplicas`) would allow more than one
pod while `redis.enabled` is still `false`, the chart **fails the render**
with an explanation, rather than silently deploying a broken multi-replica
setup - same pattern as the existing `mcpPackages.accessMode` guard.

### Bundled Redis is a new single point of failure

`redis.bundled: true` deploys a single-pod Redis with no HA of its own. It
only holds a coordination cache (rate-limit counters, breaker state,
pub/sub for notifications) - not source-of-truth data, so losing it resets
counters and drops any in-flight notification, not real data. But if this
deployment needs to survive a Redis pod restart without that blip, point
`redis.bundled: false` and `redis.externalUrl` at a managed Redis (e.g.
ElastiCache, Memorystore) instead.

### Session affinity

The Service gets `sessionAffinity: ClientIP` automatically whenever
`replicaCount > 1` - same NAT-collapsing trade-off as Compose's `ip_hash`
above, since Kubernetes Services can't do cookie affinity themselves. If
`ingress.enabled: true`, prefer your Ingress controller's own
cookie-affinity annotation instead (e.g. nginx-ingress's
`nginx.ingress.kubernetes.io/affinity: cookie`), which doesn't have the
NAT-collapsing weakness.

### Careful with `mcpPackages.enabled` while working on this

Toggling `mcpPackages.enabled` off and back on makes Helm delete and
recreate that PVC - anything installed there is lost. This isn't a
Redis/HA-specific concern, but it's easy to hit while testing storage
constraints alongside a replica count change (e.g. working around a
storage class that doesn't support `ReadWriteMany`), so it's called out
here explicitly.

---

## What's intentionally out of scope

- **The external MCP connection pool** (`mcp-connection-pool.js`) is not
  shared via Redis - it holds live, non-serializable connections (SDK
  client/transport objects). Each replica keeps its own independent pool;
  a stateless-mode tool call reconnects every call regardless, and a
  stateful-mode server just gets reconnected if a request lands on a
  replica that doesn't have it warm yet. Slightly less efficient across
  replicas, not incorrect.
- **The circuit breaker's half-open transition** has a wider race window
  across replicas than in a single process - two replicas can both observe
  "cooldown elapsed" at the same instant and both let a trial request
  through. This is standard, accepted looseness for a distributed circuit
  breaker, not something this implementation tries to make perfectly
  atomic.
- **The Monitoring dashboard's session list is per-replica** - a dashboard
  SSE client only ever sees the sessions connected to the replica it's
  connected to, not a cluster-wide view. Unifying this is a separate,
  more invasive product decision than the fan-out this document covers.
