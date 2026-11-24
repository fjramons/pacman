# All-in-one (single cluster, bundled PostgreSQL): Kustomize mode

Kustomize equivalent of `k8s/all-in-one/`, for anyone with just one cluster. Not a mirror of the real deployment: no persistent storage (`emptyDir`), no external database.

Unlike `k8s/all-in-one/`, this directory doesn't duplicate the app Deployment/Service/schema Job by hand: it layers `postgres-deployment.yaml`/`postgres-service.yaml`, `bootstrap-secret-rbac.yaml`/`bootstrap-secret-job.yaml`, and a fixed `pacman-db-config` on top of the shared `../image` (which resolves `../../base`). Changes to `base/` apply here automatically.

By default this applies the published reference image, no build needed. Testing a freshly built image instead is documented in [`../../README.md`](../../README.md).

## Apply

```bash
kubectl apply -k k8s/kustomize/overlays/all-in-one
```

`bootstrap-secret-job.yaml` generates the Postgres password on this first apply, not committed to git: read it back with `kubectl get secret pacman-db-credentials -n pacman -o jsonpath='{.data.PGPASSWORD}' | base64 -d`.

No explicit wait for anything before this single apply: `scripts/apply-schema.js` (run by the schema Job) retries for up to 60s on its own, and Postgres/the schema Job/the app Deployment may each show a brief, self-resolving `CreateContainerConfigError`/`CrashLoopBackOff` at startup if they start before the bootstrap Job has created `pacman-db-credentials` yet.
