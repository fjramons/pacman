# All-in-one (single cluster, bundled PostgreSQL)

`k8s/base/` deploys the app connecting to a PostgreSQL instance provisioned elsewhere, matching the real deployment (see the root `k8s/README.md`). This directory is a casual-testing alternative for anyone with just one Kubernetes cluster available who doesn't want to provision or point to an external PostgreSQL: it bundles a throwaway one in the same cluster and namespace as the app, the Kubernetes equivalent of what `docker-compose.yml` already offers for Docker.

Not a mirror of the real deployment: no persistent storage (`emptyDir`, data is lost if the pod is rescheduled), fixed dummy credentials, no `envsubst` for the database connection.

This directory is fully self-contained: every manifest it needs lives here, including deliberate duplicates of `k8s/base/deployment.yaml`, `k8s/base/service.yaml`, `k8s/base/schema-job.yaml` and `k8s/base/00-namespace.yaml` (see the header comment on each of those files in this directory). Deploying all-in-one never needs to reference a file from `k8s/base/`; keep the duplicates in sync by hand if the `k8s/base/` originals change.

Still needs a pre-built image: unlike `docker compose up --build`, `kubectl apply` can't build one for you.

**Any Kubernetes cluster, not just kind**: build and push to [ttl.sh](https://ttl.sh), anonymous and no login required (images expire after at most 24h). Generate a unique name so you don't collide with someone else's:

```bash
TAG=$(git rev-parse --short HEAD)
UUID=$(uuidgen)
docker build -t "ttl.sh/${UUID}/pacman:${TAG}" .
docker push "ttl.sh/${UUID}/pacman:${TAG}"
```

Validated against a real cluster: `kubelet` pulls it over the network like any other registry, this isn't specific to kind. Reuse the same `$TAG`/`$UUID` below (`scripts/build-and-push.sh` also does this same build/push, but computes its own tag internally rather than exposing `$TAG`, so it isn't used here to keep this a single, reproducible tag throughout).

**Local kind cluster only, faster iteration**: skip the registry and `kind load docker-image <image> --name <cluster>` instead. Doesn't validate `imagePullPolicy`/auth, and only works with kind.

## Apply

```bash
export IMAGE_REGISTRY=ttl.sh/${UUID}
export IMAGE_NAME=pacman
export IMAGE_TAG=${TAG}

cat k8s/all-in-one/*.yaml | envsubst | kubectl apply -f -
```

Every manifest under `k8s/` starts with a `---` document separator, so files can be freely concatenated (`cat`) or piped through `envsubst` together, `kubectl apply -f -` still recognizes each one. Without it, only the last document in a concatenated stream would be applied, silently.

`namespace.yaml` is named `00-namespace.yaml` on purpose, so a plain `*.yaml` glob applies it first: `kubectl apply` processes a concatenated stream in order, it does not reorder by resource kind, so without the `00-` prefix the alphabetically-earlier `configmap.yaml` and `deployment.yaml` would fail with `namespaces "pacman" not found`, tested and confirmed.

No explicit wait for PostgreSQL before this single apply, unlike the external-PostgreSQL flow: `scripts/apply-schema.js`, run by the schema `Job`, already waits for PostgreSQL to accept connections on its own (retrying for up to 60s) before applying the schema, precisely because PostgreSQL and this Job get created together here. The `pacman-app` Deployment has no such internal wait and can show a brief `CrashLoopBackOff` if it starts before PostgreSQL is ready; that's expected and self-resolving, a Deployment restarts its pod indefinitely with backoff rather than giving up like a `Job`'s bounded `backoffLimit` would.
