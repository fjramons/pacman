# Kubernetes manifests (Kustomize mode)

Alternative to the `envsubst`-parametrized manifests in `k8s/base/`/`k8s/all-in-one/` (see the root [`k8s/README.md`](../README.md)), using native Kustomize mechanisms instead: `configMapGenerator`/`secretGenerator` for configuration/credentials, the `images:` transformer for the container image.

- `overlays/external-db/`: connects to a PostgreSQL instance provisioned elsewhere, matching the real deployment.
- `overlays/all-in-one/`: bundles a throwaway PostgreSQL in the same cluster, the Kustomize equivalent of `k8s/all-in-one/`.
- `overlays/dev/`/`overlays/prod/`: for a GitOps controller (e.g. ArgoCD, see [`../argocd/README.md`](../argocd/README.md)) rather than a direct `kubectl apply -k`. Namespaced `pacman-dev`/`pacman-prod`, and assume `pacman-db-config`/`pacman-db-credentials` already exist in the target namespace (created out of band), referencing them by name like `base/` does. `overlays/prod/` additionally patches the Deployment to 2 replicas.

All variants share `base/` (Namespace, Deployment, Service, schema Job) through `overlays/image/` (see Design), nothing hand-duplicated between them. `base/` is not meant to be applied on its own: its Deployment/Job reference `pacman-db-config`/`pacman-db-credentials` by name (only the overlays generate them), and its image is an internal placeholder (`pacman:dev`) only `overlays/image/` replaces. Always apply through an overlay.

## Prerequisites

`kubectl` 1.14+ (built-in `apply -k`/`kustomize` support). `docker`, only for the less common case of testing a freshly built image. No standalone `kustomize` binary used anywhere.

## Apply

**Common case, always the latest published image:**

```bash
# external-db: copy the .example templates first and fill in your values
EXTERNAL_DB_DIR=k8s/kustomize/overlays/external-db
cp "${EXTERNAL_DB_DIR}/db.env.example" "${EXTERNAL_DB_DIR}/db.env"
cp "${EXTERNAL_DB_DIR}/db-credentials.env.example" "${EXTERNAL_DB_DIR}/db-credentials.env"
# edit both files, then:
kubectl apply -k k8s/kustomize/overlays/external-db

# all-in-one: no files to copy, fixed dummy DB values are already committed
kubectl apply -k k8s/kustomize/overlays/all-in-one
```

`db.env`/`db-credentials.env` are gitignored, only their `.example` templates are tracked: never commit real connection values.

If your own automation already has these values as environment variables, `db.env.template`/`db-credentials.env.template` are an alternative to the manual copy above:

```bash
PGHOST=... PGPORT=... PGDATABASE=... \
  envsubst < "${EXTERNAL_DB_DIR}/db.env.template" > "${EXTERNAL_DB_DIR}/db.env"
PGUSER=... PGPASSWORD=... \
  envsubst < "${EXTERNAL_DB_DIR}/db-credentials.env.template" > "${EXTERNAL_DB_DIR}/db-credentials.env"
```

**Less common case, a freshly built image instead of the published one** (see Design for why this side needs the substitution step):

```bash
# Any cluster, not just kind: build and push to a login-free temporary registry (ttl.sh)
UUID=$(uuidgen)
docker build -t "ttl.sh/${UUID}/pacman:dev" .
docker push "ttl.sh/${UUID}/pacman:dev"
IMAGE_REGISTRY="ttl.sh/${UUID}" IMAGE_NAME=pacman IMAGE_TAG=dev \
  envsubst < k8s/kustomize/overlays/image/kustomization.yaml.template > k8s/kustomize/overlays/image/kustomization.yaml
kubectl apply -k k8s/kustomize/overlays/external-db   # or overlays/all-in-one

# Local kind cluster only, faster iteration: skip pushing anywhere
docker build -t local/pacman:dev .
kind load docker-image local/pacman:dev --name <cluster>
IMAGE_REGISTRY=local IMAGE_NAME=pacman IMAGE_TAG=dev \
  envsubst < k8s/kustomize/overlays/image/kustomization.yaml.template > k8s/kustomize/overlays/image/kustomization.yaml
kubectl apply -k k8s/kustomize/overlays/external-db   # or overlays/all-in-one

# either way, once done:
git checkout -- k8s/kustomize/overlays/image/kustomization.yaml
```

The last step matters: `kustomization.yaml` is a tracked file that `envsubst` overwrites in place; restoring it keeps the repo pointed at the published reference image.

## Design

**Configuration, three generated sources** via three `envFrom` entries, instead of one `ConfigMap`/`Secret` pair edited per variant:

- `pacman-app-config`: values common to both variants (`NODE_ENV`, `PORT`, `DB_DRIVER`), generated once in `base/kustomization.yaml`.
- `pacman-db-config`/`pacman-db-credentials`: connection values/credentials that differ per variant, generated only in each overlay (from `db.env`/fixed literals). `base/`, `overlays/dev/`, `overlays/prod/` only reference the names, never declare the generator.

Kustomize's hash-suffix and reference-rewriting transformers run once over the whole assembled resource tree, so no `behavior: merge`/`replace` is needed regardless of which `kustomization.yaml` declares a generator vs. references it.

**Image, via `overlays/image/`**: `base/` keeps an internal placeholder (`image: pacman:dev`); every overlay resolves `resources:` through `overlays/image/` rather than `../../base` directly, the only place the `images:` transformer is declared.

- `overlays/image/kustomization.yaml` (tracked) defaults to `latest`, published alongside every release: `kubectl apply -k` always gets the most recent image, no bump step needed.
- `overlays/image/kustomization.yaml.template` is the same file with `${IMAGE_REGISTRY}`/`${IMAGE_NAME}`/`${IMAGE_TAG}` placeholders, used to regenerate `kustomization.yaml` via `envsubst` for the less common freshly-built-image case (a deliberate, occasional edit of one tracked file, restored afterwards).
- To pin a specific version instead of `latest`, edit `newTag` in `overlays/image/kustomization.yaml` directly.
- `latest` is mutable, so `overlays/image/kustomization.yaml` also patches `imagePullPolicy` to `Always` on the Deployment and schema Job (`base/` keeps `IfNotPresent`). The patch lives only in `kustomization.yaml`, not the template, so regenerating from the template correctly drops it.

**Namespace**: each overlay sets `namespace:` once, instead of hardcoding `metadata.namespace` per manifest as the `envsubst` mode does. Unlike that mode, no `00-` filename prefix or `---` separator is needed: Kustomize applies the Namespace before namespaced resources on its own.

**Schema Job immutability**: Kustomize does not solve this. `pacman-schema` is a static, fixed-name Job, so its `spec.template` is still immutable once created; delete it (`kubectl delete job pacman-schema -n pacman`) before reapplying with a new image if `kubectl apply` complains.
