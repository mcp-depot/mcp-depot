# Kubernetes Deployment (Helm)

MCP Depot ships a Helm chart for Kubernetes deployments. The chart deploys the server, client (nginx), and a bundled PostgreSQL StatefulSet — all configurable via `values.yaml`.

---

## Prerequisites

- `kubectl` and `helm` installed
- A running Kubernetes cluster (Rancher Desktop, minikube, k3s, EKS, GKE, AKS, etc.)
- Docker images built locally or pushed to a registry accessible by the cluster

---

## Quick Start

### 1. Build images

```bash
docker build -t mcphub-server ./server
docker build -t mcphub-client ./client
docker build -t mcphub-mcp-runner ./mcp-runner
```

If deploying to a remote cluster, tag and push to your registry:

```bash
docker build -t your-registry/mcphub-server:latest ./server
docker build -t your-registry/mcphub-client:latest ./client
docker build -t your-registry/mcphub-mcp-runner:latest ./mcp-runner
docker push your-registry/mcphub-server:latest
docker push your-registry/mcphub-client:latest
docker push your-registry/mcphub-mcp-runner:latest
```

Then set `image.server.repository`, `image.client.repository`, and `image.mcpRunner.repository` accordingly (see [Values reference](#values-reference)).

### 2. Install

```bash
helm install mcp-depot ./helm/mcp-depot \
  --namespace mcp-depot \
  --create-namespace
```

### 3. Check pods

```bash
kubectl get pods -n mcp-depot
```

All three pods should reach `Running` status within ~30 seconds (`server` shows `2/2` - it runs the [mcp-runner sidecar](#the-mcp-runner-sidecar) alongside the main container):

```
NAME                              READY   STATUS    RESTARTS   AGE
mcp-depot-client-xxx              1/1     Running   0          30s
mcp-depot-postgres-0              1/1     Running   0          30s
mcp-depot-server-xxx              2/2     Running   0          30s
```

---

## Accessing the UI

### Port-forward (no ingress controller needed)

```bash
kubectl port-forward -n mcp-depot svc/mcp-depot-client 8080:80
```

Open **http://localhost:8080** in your browser.

### Ingress (persistent access)

Requires an ingress controller installed in your cluster (Traefik, NGINX, etc.).

```bash
helm upgrade mcp-depot ./helm/mcp-depot \
  --namespace mcp-depot \
  --set ingress.enabled=true \
  --set ingress.className=traefik \
  --set ingress.host=mcp-depot.local
```

Add the following entry to your `/etc/hosts` (or `C:\Windows\System32\drivers\etc\hosts` on Windows):

```
127.0.0.1   mcp-depot.local
```

Then open **http://mcp-depot.local**.

---

## Production Setup

### Set secrets explicitly

By default, secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, etc.) are auto-generated on first install and preserved across upgrades. For production, set them explicitly so you have full control:

```bash
helm install mcp-depot ./helm/mcp-depot \
  --namespace mcp-depot \
  --create-namespace \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set secrets.sessionSecret="$(openssl rand -hex 32)" \
  --set secrets.encryptionKey="$(openssl rand -hex 32)"
```

Or create a `values-prod.yaml` file:

```yaml
secrets:
  jwtSecret: "your-jwt-secret"
  sessionSecret: "your-session-secret"
  encryptionKey: "your-encryption-key"

env:
  ALLOW_REGISTRATION: "false"
  NODE_ENV: production

ingress:
  enabled: true
  className: nginx
  host: mcp-depot.example.com
  tls:
    enabled: true
    secretName: mcp-depot-tls
```

Then install with:

```bash
helm install mcp-depot ./helm/mcp-depot \
  --namespace mcp-depot \
  --create-namespace \
  -f values-prod.yaml
```

### Use an external database

The bundled PostgreSQL is suitable for development and small teams. For production, use a managed database (AWS RDS, Cloud SQL, etc.):

```yaml
postgres:
  enabled: false

externalDatabase:
  url: "postgres://user:password@your-db-host:5432/mcpconnect"
```

### Scaling beyond one replica

`replicaCount > 1` and `autoscaling.enabled: true` require `redis.enabled: true` first - rate limiting, the circuit breaker, and Session Channel/MCP session notifications are only correct per-pod without it. See [docs/HA-SCALING.md](./HA-SCALING.md) for the full picture (why, the trade-offs, and the equivalent Docker Compose setup). The chart fails the render with a clear error if you skip this.

Separately, note that all server replicas share a **single** `mcp-packages` PVC (unlike postgres, which gets one PVC per replica via `volumeClaimTemplates`). The default `mcpPackages.accessMode: ReadWriteOnce` only supports one pod reliably, so scaling past one replica requires `ReadWriteMany`:

```yaml
replicaCount: 3

mcpPackages:
  accessMode: ReadWriteMany
  storageClassName: efs-sc   # or your cluster's RWX-capable class
```

`helm install`/`upgrade` fails immediately with a clear error if `replicaCount`/`autoscaling.maxReplicas` allow more than one pod while `accessMode` is still `ReadWriteOnce`, rather than leaving a pod stuck in `Pending`.

If you don't have an RWX-capable StorageClass available and don't need External MCP Server package installs to persist, set `mcpPackages.enabled: false` (falls back to `emptyDir`, safe at any replica count) instead of forcing `ReadWriteOnce` with multiple replicas.

### The mcp-runner sidecar

Stdio-based External MCP Servers involve spawning arbitrary local processes and installing their packages (npm -g / pip --target). By default this runs in a second container, `mcp-runner`, in the same pod as `server` - not the server container itself, which holds `DATABASE_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY`. The two containers only ever talk to each other over `localhost` within the pod's shared network namespace, so no extra Service is created for it.

This is on by default (`mcpRunner.enabled: true`) and requires no configuration - a shared token (`MCP_RUNNER_TOKEN`) is auto-generated into the same Secret as the other credentials, following the same pattern as `JWT_SECRET`/`ENCRYPTION_KEY`. To disable it and fall back to spawning directly in the server container instead (not recommended - only useful for local debugging):

```yaml
mcpRunner:
  enabled: false
```

---

## Values Reference

| Value | Default | Description |
|-------|---------|-------------|
| `image.server.repository` | `mcphub-server` | Server image name |
| `image.server.tag` | `latest` | Server image tag |
| `image.client.repository` | `mcphub-client` | Client image name |
| `image.client.tag` | `latest` | Client image tag |
| `image.mcpRunner.repository` | `mcphub-mcp-runner` | mcp-runner sidecar image name |
| `image.mcpRunner.tag` | `latest` | mcp-runner sidecar image tag |
| `replicaCount` | `1` | Number of server/client replicas |
| `mcpRunner.enabled` | `true` | Run stdio External MCP Servers in an isolated sidecar container instead of the server container. `false` falls back to spawning directly in the server container (local debugging only) |
| `mcpRunner.port` | `9500` | Port the sidecar listens on inside the pod (server reaches it at `http://localhost:<port>`) |
| `secrets.mcpRunnerToken` | auto-generated | Shared token the server uses to authenticate to the mcp-runner sidecar |
| `redis.enabled` | `false` | Required for `replicaCount > 1` / `autoscaling.enabled` - shares rate limits, circuit breaker state, and session notifications across replicas. See [docs/HA-SCALING.md](./HA-SCALING.md) |
| `redis.bundled` | `true` | Deploy a chart-managed single-pod Redis. `false` to use `redis.externalUrl` instead - recommended for a real production HA deployment, since the bundled Redis is itself a single point of failure |
| `redis.externalUrl` | `""` | External Redis connection string (used when `redis.bundled=false`) |
| `postgres.enabled` | `true` | Deploy bundled PostgreSQL StatefulSet |
| `postgres.image.tag` | `15-alpine` | PostgreSQL image tag |
| `postgres.volume.size` | `1Gi` | PVC size for postgres data |
| `externalDatabase.url` | `""` | External DB connection string (used when `postgres.enabled=false`) |
| `mcpPackages.enabled` | `true` | Persist External MCP Server package installs (npm -g / pip --target) in a PVC across restarts and upgrades. `false` falls back to an `emptyDir` (installs lost on every pod reschedule) |
| `mcpPackages.size` | `1Gi` | PVC size for installed MCP packages |
| `mcpPackages.storageClassName` | `""` | StorageClass for the PVC (`""` = cluster default) |
| `mcpPackages.accessMode` | `ReadWriteOnce` | **Must be `ReadWriteMany`** (with an RWX-capable StorageClass - e.g. EFS, Filestore, Azure Files, NFS) if `replicaCount > 1` or `autoscaling.enabled: true` - every server replica mounts the same PVC. `helm template`/`install` fails fast with a clear error if this is misconfigured |
| `mcpPackages.existingClaim` | `""` | Use a PVC you've already created instead of one created by this chart |
| `secrets.jwtSecret` | auto-generated | JWT signing secret |
| `secrets.sessionSecret` | auto-generated | Refresh token secret |
| `secrets.encryptionKey` | auto-generated | Encryption key for credentials at rest |
| `secrets.existingSecret` | `""` | Use an existing Kubernetes Secret instead |
| `env.ALLOW_REGISTRATION` | `"false"` | Allow public user registration |
| `env.JWT_EXPIRE` | `15m` | Access token expiry |
| `env.JWT_REFRESH_EXPIRE` | `7d` | Refresh token expiry |
| `env.NODE_ENV` | `production` | Node environment |
| `ingress.enabled` | `false` | Create an Ingress resource |
| `ingress.className` | `""` | Ingress class name (e.g. `traefik`, `nginx`) |
| `ingress.host` | `mcp-depot.local` | Hostname for the ingress rule |
| `ingress.tls.enabled` | `false` | Enable TLS on the ingress |
| `ingress.tls.secretName` | `""` | TLS secret name (auto-named if blank) |
| `autoscaling.enabled` | `false` | Enable Horizontal Pod Autoscaler |
| `autoscaling.minReplicas` | `1` | HPA minimum replicas |
| `autoscaling.maxReplicas` | `3` | HPA maximum replicas |
| `autoscaling.targetCPUUtilizationPercentage` | `70` | HPA CPU target |
| `resources.server.requests.cpu` | `250m` | Server CPU request |
| `resources.server.requests.memory` | `256Mi` | Server memory request |
| `resources.server.limits.cpu` | `1000m` | Server CPU limit |
| `resources.server.limits.memory` | `512Mi` | Server memory limit |

---

## Upgrading

```bash
helm upgrade mcp-depot ./helm/mcp-depot --namespace mcp-depot
```

Secret values are preserved across upgrades — existing JWT secrets and the postgres password are read from the current secret and reused, so no sessions are invalidated and the database connection remains intact.

**Upgrading a release created before the mcp-runner sidecar or the `mcpPackages` PVC existed:** Kubernetes rejects an in-place strategy change from `RollingUpdate` (with `rollingUpdate` parameters already set) to `Recreate` via a patch - `helm upgrade` fails with `spec.strategy.rollingUpdate: Forbidden: may not be specified when strategy type is 'Recreate'`. If you hit this, delete just the Deployment object first (this does not touch the Postgres StatefulSet, its PVC, or the `mcp-packages` PVC) and let `helm upgrade` recreate it:

```bash
kubectl delete deployment mcp-depot-server --namespace mcp-depot
helm upgrade mcp-depot ./helm/mcp-depot --namespace mcp-depot
```

---

## Uninstalling

```bash
helm uninstall mcp-depot --namespace mcp-depot
kubectl delete namespace mcp-depot
```

> **Note:** Persistent Volume Claims (PVCs) for the postgres data are not deleted automatically by `helm uninstall`. Delete them manually if you want to remove all data:
>
> ```bash
> kubectl delete pvc -n mcp-depot --all
> ```
