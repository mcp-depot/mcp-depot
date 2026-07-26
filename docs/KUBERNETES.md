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
```

If deploying to a remote cluster, tag and push to your registry:

```bash
docker build -t your-registry/mcphub-server:latest ./server
docker build -t your-registry/mcphub-client:latest ./client
docker push your-registry/mcphub-server:latest
docker push your-registry/mcphub-client:latest
```

Then set `image.server.repository` and `image.client.repository` accordingly (see [Values reference](#values-reference)).

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

All three pods should reach `Running` status within ~30 seconds:

```
NAME                              READY   STATUS    RESTARTS   AGE
mcp-depot-client-xxx              1/1     Running   0          30s
mcp-depot-postgres-0              1/1     Running   0          30s
mcp-depot-server-xxx              1/1     Running   0          30s
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

---

## Values Reference

| Value | Default | Description |
|-------|---------|-------------|
| `image.server.repository` | `mcphub-server` | Server image name |
| `image.server.tag` | `latest` | Server image tag |
| `image.client.repository` | `mcphub-client` | Client image name |
| `image.client.tag` | `latest` | Client image tag |
| `replicaCount` | `1` | Number of server/client replicas |
| `postgres.enabled` | `true` | Deploy bundled PostgreSQL StatefulSet |
| `postgres.image.tag` | `15-alpine` | PostgreSQL image tag |
| `postgres.volume.size` | `1Gi` | PVC size for postgres data |
| `externalDatabase.url` | `""` | External DB connection string (used when `postgres.enabled=false`) |
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
