# Kubernetes manifests

Plain manifests parametrized with `envsubst` placeholders, no Kustomize/Helm, matching the reference example style used across the rest of this workspace. `k8s/base/` is the deployment itself, connecting to a PostgreSQL instance provisioned elsewhere, the way it works in the real deployment; `k8s/gateway-api/`, `k8s/pg-sim/` and `k8s/all-in-one/` are separate, not applied by the default command below.

If you only have one Kubernetes cluster available and don't want to provision or point to an external PostgreSQL, see [`k8s/all-in-one/README.md`](all-in-one/README.md) instead: a casual-testing alternative that bundles a throwaway PostgreSQL in the same cluster.

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

None of these have a default baked into the manifests: `envsubst` leaves any unset variable empty rather than failing loudly, so export all of them before rendering.

`IMAGE_REGISTRY` above shows the persistent, authenticated option (matches what the real deployment would use); for a registry-free way to build and push a test image against any Kubernetes cluster, not just kind, see the `ttl.sh` walkthrough in [`k8s/all-in-one/README.md`](all-in-one/README.md), it applies here too.

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

Every manifest under `k8s/` starts with a `---` document separator on purpose, so files can be freely concatenated like this. Without it, `kubectl apply -f -` would only recognize the last manifest in the stream and silently ignore the rest, no error, no warning.

`namespace.yaml` is named `00-namespace.yaml` on purpose, so a plain `*.yaml` glob applies it first: `kubectl apply` doesn't reorder a concatenated stream (or a directory's files, same behavior) by resource kind, it processes them in the order it reads them. Without the `00-` prefix, alphabetical order would put `configmap.yaml` and `deployment.yaml` before the `Namespace`, and both would fail with `namespaces "pacman" not found` since it wouldn't exist yet, tested and confirmed against a real cluster from a clean state.

The rendered output is never written back to the repo; if you need it on disk for debugging, redirect it to a directory outside git (e.g. `k8s/rendered/`, already gitignored) rather than committing it.

`k8s/base/schema-job.yaml` applies `schema.sql` against the target database (idempotent, safe to re-apply). It uses the same app image, so it only needs building/pushing once per deploy, not a separate image.

## Gateway API (future)

See `k8s/gateway-api/README.md`; not part of the command above.

## Local test environment (`pg-sim`)

`k8s/pg-sim/` only exists to stand up a throwaway PostgreSQL in the local `kind_cluster` test setup, simulating what the client's Terraform `postgresql` module provisions for real. It is local development tooling, not part of the reference example. The full local environment walkthrough (two `kind` clusters, how they reach each other) is workspace-specific setup documented outside this repo.

Not to be confused with `k8s/all-in-one/`: `pg-sim` runs in a separate cluster reached over its `LoadBalancer` IP, mirroring the real, external-database deployment for testing purposes; `all-in-one` runs PostgreSQL in the same cluster as the app instead, a different, simpler deployment mode meant for casual use.
