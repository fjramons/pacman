# Kubernetes manifests (Kustomize mode)

Alternative to the plain `envsubst`-parametrized manifests in `k8s/base/`/`k8s/all-in-one/` (see the root `k8s/README.md`), using native Kustomize mechanisms instead of `${...}` text placeholders: `configMapGenerator`/`secretGenerator` for configuration and credentials, and the `images:` transformer for the container image. Same two variants as the `envsubst` mode, same underlying application: `overlays/external-db/` connects to a PostgreSQL instance provisioned elsewhere, matching the real deployment; `overlays/all-in-one/` bundles a throwaway PostgreSQL in the same cluster for casual testing, the Kustomize equivalent of `k8s/all-in-one/`. Both share the same `base/` (Namespace, Deployment, Service, schema Job) through `overlays/image/` (see "Design" below), so nothing is hand-duplicated between variants the way `k8s/all-in-one/` duplicates `k8s/base/` in the `envsubst` mode.

`base/` is not meant to be applied on its own: its Deployment/Job reference a `pacman-db-config` ConfigMap and a `pacman-db-credentials` Secret by name that only the overlays generate (see "Design" below), and its container image is an internal placeholder (`pacman:dev`) that only `overlays/image/` replaces with a real one. Always apply through `overlays/external-db/` or `overlays/all-in-one/`.

## Prerequisites

`kubectl` (1.14+, for its built-in `apply -k`/`kustomize` support) to apply the manifests, and `docker` to build the app image, only needed for the less common case of testing a freshly built image (see "Apply" below). No standalone `kustomize` binary is used anywhere in this mode.

## Apply

**Common case, always the latest published image** (no setup beyond the DB connection):

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

`db.env`/`db-credentials.env` are gitignored, only their `.example` templates are tracked, the same pattern used for `terraform.tfvars` elsewhere in this workspace: never commit real connection values or credentials.

**Less common case, a freshly built image instead of the published one** (see "Design" below for why this is the one that needs a substitution step, not the other way around):

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

The last step matters: `kustomization.yaml` is a tracked file, and `envsubst` overwrites it in place. Restoring it afterwards keeps the repo pointed at the published reference image, not a local/throwaway one.

## Design

**Configuration is split into three generated sources**, referenced from the Deployment/Job via three `envFrom` entries, rather than one `ConfigMap`/`Secret` pair edited per variant:

- `pacman-app-config`: values common to both variants (`NODE_ENV`, `PORT`, `DB_DRIVER`), generated once in `base/kustomization.yaml`, never overridden.
- `pacman-db-config`: connection values that differ per variant, generated only in each overlay (from `db.env` in `external-db`, from fixed literals in `all-in-one`). `base/` never declares this generator, only references the name.
- `pacman-db-credentials`: same idea, for credentials, via `secretGenerator`.

This works without `base/` and the overlay ever declaring the same generator twice (no `behavior: merge`/`replace` needed): Kustomize's hash-suffix and reference-rewriting transformers run once over the whole assembled resource tree for a build, regardless of which `kustomization.yaml` in that tree declared the generator versus the resource that references it by name.

**Image, via a dedicated `overlays/image/` layer**: `base/` keeps an internal placeholder (`image: pacman:dev`), and both `overlays/external-db/` and `overlays/all-in-one/` resolve their `resources:` through `overlays/image/` instead of `../../base` directly, which is the only place the `images:` transformer is declared. `overlays/image/kustomization.yaml` is a tracked file whose committed default tracks `latest` (published as a second tag alongside every versioned release), matching the common case above: `kubectl apply -k` always gets the most recently published image, no bump step needed after a release. `overlays/image/kustomization.yaml.template` is the same file with `${IMAGE_REGISTRY}`/`${IMAGE_NAME}`/`${IMAGE_TAG}` placeholders instead, for the less common case of pointing at a freshly built image: Kustomize has no built-in way to read an `images:` value from an environment variable, so that case regenerates `kustomization.yaml` from the template with `envsubst` (a small, deliberate, occasional edit of one tracked file, restored afterwards, not something regenerated on every apply). To pin a specific version instead of always tracking `latest`, edit `newTag` in `overlays/image/kustomization.yaml` directly (e.g. a released version tag) rather than regenerating it from the template.

`latest` is a mutable tag, so `overlays/image/kustomization.yaml` also patches `imagePullPolicy` to `Always` on the Deployment and the schema Job (`base/` keeps `IfNotPresent`, correct for the freshly-built-locally case above): without it, a node that already cached some "latest" would never check the registry again, which would make "latest" behave like "whatever was first pulled" instead of "the most recent one". That patch lives only in `kustomization.yaml`, not in the template, so regenerating from the template for the local-image case correctly drops it and reverts to `IfNotPresent` (there's no real registry to re-pull a kind-loaded image from anyway).

**Namespace**: each overlay sets `namespace: pacman` once (`namespace:` at the top of its `kustomization.yaml`), rather than hardcoding `metadata.namespace` in every manifest as the `envsubst` mode does. This also namespaces the extra Postgres resources `overlays/all-in-one/` adds alongside `../image`. Unlike the `envsubst` mode, no `00-` filename prefix or `---` document separator is needed anywhere here: Kustomize applies the Namespace before namespaced resources on its own, it doesn't rely on file or stream order.

**Schema Job immutability**: Kustomize does not solve this. `pacman-schema` is a static, fixed-name Job, not a generated resource, so its `spec.template` is still immutable once created, same as in the `envsubst` mode; delete the completed Job (`kubectl delete job pacman-schema -n pacman`) before reapplying with a new image if `kubectl apply` complains about immutable fields.
