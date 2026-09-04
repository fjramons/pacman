# All-in-one (single cluster, bundled PostgreSQL) — Kustomize mode

Kustomize equivalent of `k8s/all-in-one/`, for anyone with just one cluster. Not a mirror of the real deployment: no persistent storage (`emptyDir`), fixed dummy credentials, no external database.

Unlike `k8s/all-in-one/`, this directory doesn't duplicate the app Deployment/Service/schema Job by hand: it layers `postgres-deployment.yaml`/`postgres-service.yaml` and fixed `pacman-db-config`/`pacman-db-credentials` values on top of the shared `../image` (which resolves `../../base`). Changes to `base/` apply here automatically.

By default this applies the published reference image, no build needed. Testing a freshly built image instead is documented in [`../../README.md`](../../README.md).

## Apply

```bash
kubectl apply -k k8s/kustomize/overlays/all-in-one
```

No explicit wait for PostgreSQL before this single apply: `scripts/apply-schema.js` (run by the schema Job) retries for up to 60s on its own. The `pacman-app` Deployment has no such wait and may show a brief, self-resolving `CrashLoopBackOff` at startup.
