# All-in-one (single cluster, bundled PostgreSQL) — Kustomize mode

Kustomize equivalent of `k8s/all-in-one/`: a casual-testing alternative for anyone with just one Kubernetes cluster available who doesn't want to provision or point to an external PostgreSQL. Not a mirror of the real deployment: no persistent storage (`emptyDir`, data is lost if the pod is rescheduled), fixed dummy credentials, no external database.

Unlike `k8s/all-in-one/`, this directory does not duplicate the app Deployment/Service/schema Job by hand: it layers `postgres-deployment.yaml`/`postgres-service.yaml` and this variant's fixed `pacman-db-config`/`pacman-db-credentials` values on top of the shared `../image` (which in turn resolves `../../base`), via `resources: [../image, ...]` in `kustomization.yaml`. Changes to the shared app manifests in `base/` apply here automatically, nothing to keep in sync by hand.

By default this applies against the published reference image, no build needed, see "Apply" below. Testing a freshly built image instead (unlike `docker compose up --build`, `kubectl apply -k` can't build one for you) is the less common case, documented with the `ttl.sh`/`kind load docker-image` options in the root `k8s/kustomize/README.md`.

## Apply

```bash
kubectl apply -k k8s/kustomize/overlays/all-in-one
```

No explicit wait for PostgreSQL before this single apply: `scripts/apply-schema.js`, run by the schema `Job`, already waits for PostgreSQL to accept connections on its own (retrying for up to 60s) before applying the schema, precisely because PostgreSQL and this Job get created together here. The `pacman-app` Deployment has no such internal wait and can show a brief `CrashLoopBackOff` if it starts before PostgreSQL is ready; that's expected and self-resolving, a Deployment restarts its pod indefinitely with backoff rather than giving up like a `Job`'s bounded `backoffLimit` would. Validated against a real `kind` cluster while building this mode.
