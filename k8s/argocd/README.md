# ArgoCD Application examples

Minimal ArgoCD `Application` manifests for deploying this app by pull instead of the direct `kubectl apply -k` push documented in the root `README.md` and in `k8s/kustomize/README.md`.

## Prerequisites

- A Kubernetes cluster with ArgoCD already installed and operational (not provisioned by this repo).
- If the repo hosting these manifests is private, a configured ArgoCD `Repository`/credentials Secret, set up once per ArgoCD instance.
- `pacman-db-config`/`pacman-db-credentials` already present in the target namespace (`pacman-dev`/`pacman-prod`/`pacman`) before applying: unlike `overlays/external-db/`, the `dev`/`prod`/`ci` overlays don't generate them from `.env` files, since ArgoCD only reads from git. Whatever manages the namespace must create them directly.

## `applications/`

| File | `source.path` | Meant to be applied by |
| --- | --- | --- |
| `dev/pacman-application.yaml` | `k8s/kustomize/overlays/dev` | Whoever manages `dev`; static, apply once, ArgoCD keeps it in sync. |
| `prod/pacman-application.yaml` | `k8s/kustomize/overlays/prod` | Same, for `prod`. |
| `ci/pacman-application.yaml.template` | `k8s/kustomize/overlays/all-in-one` | A CI pipeline validating a freshly built image, regenerated per run and deleted after. |

`dev`/`prod` point `repoURL` at this fork (`https://github.com/fjramons/pacman.git`); adjust it if deploying your own fork.

## Design

- **`Application` only, never `kubectl apply -k` here**: the push-based deployment still works and is documented as-is; these manifests are an additional, pull-based path.
- **No dedicated Kustomize layer for a different image registry**: `overlays/image/kustomization.yaml` (which `overlays/dev`/`overlays/prod` already resolve through) already carries the `images:` transformer; point it at your own registry there.
