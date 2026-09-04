# All-in-one (single cluster, bundled PostgreSQL)

Casual-testing alternative to `k8s/base/` (see [`k8s/README.md`](../README.md)) for anyone with just one cluster: bundles a throwaway PostgreSQL in the same cluster and namespace as the app.

- Not a mirror of the real deployment: no persistent storage (`emptyDir`), fixed dummy credentials, no `envsubst` for the database connection.
- Self-contained: duplicates `k8s/base/deployment.yaml`, `service.yaml`, `schema-job.yaml` and `00-namespace.yaml` locally, keep in sync by hand if the `k8s/base/` originals change.
- Still needs a pre-built image: `kubectl apply` can't build one for you.

**Any Kubernetes cluster, not just kind**: build and push to [ttl.sh](https://ttl.sh), anonymous, no login (images expire after 24h):

```bash
TAG=$(git rev-parse --short HEAD)
UUID=$(uuidgen)
docker build -t "ttl.sh/${UUID}/pacman:${TAG}" .
docker push "ttl.sh/${UUID}/pacman:${TAG}"
```

**Local kind cluster only, faster iteration**: skip the registry, `kind load docker-image <image> --name <cluster>` instead. Doesn't validate `imagePullPolicy`/auth.

## Apply

```bash
export IMAGE_REGISTRY=ttl.sh/${UUID}
export IMAGE_NAME=pacman
export IMAGE_TAG=${TAG}

cat k8s/all-in-one/*.yaml | envsubst | kubectl apply -f -
```

See [`k8s/README.md`](../README.md) for the `---` separator and `00-` prefix requirements, which apply here too.

No explicit wait for PostgreSQL before this single apply: `scripts/apply-schema.js` (run by the schema Job) retries for up to 60s on its own. The `pacman-app` Deployment has no such wait and may show a brief, self-resolving `CrashLoopBackOff` at startup.
