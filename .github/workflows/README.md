# GitHub Actions workflows

Two workflows, cleanly separated by what triggers them: a commit runs CI, a version tag publishes a release. Neither one triggers the other.

## `ci.yml`, every commit

Triggers on push to `master`/`modernize` and on pull requests. Runs lint → test (Node 18.x/20.x matrix) → build. Verification only, nothing gets published.

## `release.yml`, only on a version tag

Triggers on a `v*` tag push, or manual dispatch. Two jobs:

- `build-and-package`: the same lint/test/build gate as `ci.yml` (a release can be cut from a tag `ci.yml`'s branch/PR triggers never saw), then `npm pack` and, only on an actual tag push, a GitHub Release with that tarball attached.
- `publish-image`: needs `build-and-package` to pass first. Only on an actual tag push (`if: startsWith(github.ref, 'refs/tags/')`), so a manual `workflow_dispatch` without a real tag runs the lint/test/build/pack gate but publishes neither the GitHub Release nor the image, a dry run. Logs into GHCR with the built-in `GITHUB_TOKEN` (no extra secret to configure) and pushes two tags: `ghcr.io/<owner>/<repo>:<tag>` (the git tag itself) and `ghcr.io/<owner>/<repo>:latest`.

To cut a release:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

## After a release publishes

Nothing to do: `k8s/kustomize/overlays/image/kustomization.yaml` (the Kustomize deployment mode, see `k8s/kustomize/README.md`) tracks `:latest` by default, so `kubectl apply -k` against `overlays/external-db/`/`overlays/all-in-one/` automatically picks up whatever this workflow just published. To pin a specific version instead, edit `newTag` in that file directly.

## GHCR package visibility, one-time check

A package published to GHCR for the first time via the built-in `GITHUB_TOKEN` can default to **private** even in a public repository. If `kubectl apply -k` against the default `overlays/image/` reference fails with a pull-access-denied error for anyone other than the publishing account, check the package's settings on GitHub (repo → Packages → the `pacman` package → Package settings → Change visibility) and set it to Public.
