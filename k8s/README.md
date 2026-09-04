# Kubernetes manifests

Plain manifests parametrized with `envsubst` placeholders, no Helm. `k8s/base/` connects to a PostgreSQL instance provisioned elsewhere, matching the real deployment; `k8s/gateway-api/`, `k8s/pg-sim/` and `k8s/all-in-one/` are separate, not applied by the default command below.

- Only one cluster, no external PostgreSQL to point at? See [`k8s/all-in-one/README.md`](all-in-one/README.md), a casual-testing alternative bundling a throwaway PostgreSQL.
- Prefer native Kustomize generators/transformers over `${...}` placeholders? See [`k8s/kustomize/README.md`](kustomize/README.md): same two variants, this directory untouched by it.

## Required variables

| Variable | Used by | Example |
| --- | --- | --- |
| `IMAGE_REGISTRY` | `deployment.yaml`, `schema-job.yaml` | `ghcr.io/<your-user>` |
| `IMAGE_NAME` | `deployment.yaml`, `schema-job.yaml` | `pacman` |
| `IMAGE_TAG` | `deployment.yaml`, `schema-job.yaml` | output of `scripts/build-and-push.sh` |
| `DB_HOST` | `configmap.yaml` | LoadBalancer IP of the target PostgreSQL |
| `DB_PORT` | `configmap.yaml` | `5432` |
| `DB_DATABASE` | `configmap.yaml` | `pacman` |
| `DB_SSLMODE` | `configmap.yaml` | `disable` or `require` |
| `DB_USER` | `secret.yaml` | - |
| `DB_PASSWORD` | `secret.yaml` | - |

None have a default baked into the manifests: `envsubst` leaves an unset variable empty rather than failing loudly, export all of them before rendering. For a registry-free test image, see the `ttl.sh` walkthrough in [`k8s/all-in-one/README.md`](all-in-one/README.md).

## Render and apply

```bash
export IMAGE_REGISTRY=ghcr.io/<your-user>
export IMAGE_NAME=pacman
export IMAGE_TAG=$(git rev-parse --short HEAD)
export DB_HOST=...
export DB_PORT=5432
export DB_DATABASE=pacman
export DB_SSLMODE=disable
export DB_USER=...
export DB_PASSWORD=...

cat k8s/base/*.yaml | envsubst | kubectl apply -f -
```

- Every manifest starts with a `---` separator, so files can be concatenated like this. Without it, `kubectl apply -f -` only recognizes the last manifest in the stream and silently ignores the rest.
- `namespace.yaml` is named `00-namespace.yaml` so a `*.yaml` glob applies it first: `kubectl apply` doesn't reorder by resource kind, only by read order. Without the prefix, `configmap.yaml`/`deployment.yaml` would apply before the Namespace exists and fail.
- The rendered output is never written back to the repo; redirect it to a gitignored directory (e.g. `k8s/rendered/`) if you need it on disk.
- `schema-job.yaml` applies `schema.sql` against the target database (idempotent), using the same app image, no separate build needed.

## Gateway API (future)

See [`k8s/gateway-api/README.md`](gateway-api/README.md); not part of the command above.

## Deploying by pull instead of push (ArgoCD)

See [`k8s/argocd/README.md`](argocd/README.md): example ArgoCD `Application` manifests, an alternative to `kubectl apply`.

## Local test environment (`pg-sim`)

`k8s/pg-sim/` stands up a throwaway PostgreSQL for local testing, simulating an externally provisioned instance. Not applied by the command above.

Not to be confused with `k8s/all-in-one/`: `pg-sim` runs in a separate cluster reached over its `LoadBalancer` IP; `all-in-one` runs PostgreSQL in the same cluster as the app.
