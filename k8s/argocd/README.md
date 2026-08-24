# ArgoCD Application examples

Minimal ArgoCD `Application` manifests for deploying this app by pull instead of the direct `kubectl apply -k` push documented in the root `README.md` and in `k8s/kustomize/README.md`.

## Prerequisites

- **A Kubernetes cluster with ArgoCD already installed and operational.** Nothing in this repo installs ArgoCD itself: it's assumed to already be part of the target cluster. Applying these manifests against a cluster without ArgoCD's own CRDs/controller does nothing useful.
- **Credentials for ArgoCD to pull whichever repo hosts these manifests**, if that repo is private: ArgoCD needs a configured `Repository` (or repository credentials Secret) before any `Application` resource pointing at it can sync, same as any private-repo GitOps source. Set this up once per ArgoCD instance, outside of anything these manifests can automate.
- `pacman-db-config`/`pacman-db-credentials` already present in the target namespace (`pacman-dev`/`pacman-prod`/`pacman`) before an `Application` here is applied. Unlike `k8s/kustomize/overlays/external-db/`, the `dev`/`prod`/`ci` overlays these Applications point at don't generate them from `.env` files: ArgoCD only ever reads from git, so a value that must vary per deployment (a database password, a freshly built image tag) can't come from a Kustomize generator here. Whatever manages that namespace has to create the ConfigMap/Secret directly, before applying the `Application`.

## `applications/`

| File | `source.path` | Meant to be applied by |
| --- | --- | --- |
| `dev/pacman-application.yaml` | `k8s/kustomize/overlays/dev` | Whoever manages the `dev` environment; static, apply it once, ArgoCD keeps it in sync afterwards. |
| `prod/pacman-application.yaml` | `k8s/kustomize/overlays/prod` | Same, for `prod`. |
| `ci/pacman-application.yaml.template` | `k8s/kustomize/overlays/all-in-one` | A CI pipeline validating a freshly built image, regenerated per run (see the file's own comment) and deleted again once done. |

`dev/pacman-application.yaml` and `prod/pacman-application.yaml` both point `repoURL` at this fork (`https://github.com/fjramons/pacman.git`): adjust it to point at your own fork if you're not deploying this exact one.

## Design

**Why `Application` only, never `kubectl apply -k` here.** The push-based deployment (`kubectl apply -k`, see `k8s/kustomize/README.md`) still works and is documented as-is; these `Application` manifests are an additional, pull-based path, not a replacement.

**No dedicated Kustomize layer to pin a different image registry.** `k8s/kustomize/overlays/image/kustomization.yaml` (which `overlays/dev`/`overlays/prod` already resolve through) already carries the `images:` transformer; point it at your own registry there directly rather than adding another Kustomize layer just for that.
