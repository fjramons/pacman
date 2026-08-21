#!/usr/bin/env bash
# Builds the app image with a unique per-build tag and, optionally, pushes
# it to a configurable registry. Never hardcodes a registry: IMAGE_REGISTRY
# must be set by the caller (e.g. exported before running, or inline).
#
# Usage:
#   IMAGE_REGISTRY=ghcr.io/<your-user> ./scripts/build-and-push.sh
#   IMAGE_REGISTRY=ghcr.io/<your-user> ./scripts/build-and-push.sh --push
#
# Prints only the final image reference to stdout (all other output goes
# to stderr), so it can be captured and chained into the k8s/ envsubst step:
#   IMAGE=$(IMAGE_REGISTRY=... ./scripts/build-and-push.sh --push)
#
# Registry alternatives:
#   - ghcr.io/<your-user>   persistent, authenticated (docker login ghcr.io)
#   - ttl.sh/<unique-name>  anonymous, no login, works against any
#                           Kubernetes cluster (not just kind), but images
#                           expire (max 24h). Generate a unique name so you
#                           don't collide with someone else's, e.g.:
#                             UUID=$(uuidgen)
#                             IMAGE_REGISTRY="ttl.sh/${UUID}" ./scripts/build-and-push.sh --push
#                           then reuse the same $UUID when rendering the k8s/
#                           manifests (IMAGE_REGISTRY="ttl.sh/${UUID}").
#                           Validated: this also works against a real
#                           Kubernetes cluster, kubelet pulls it over the
#                           network like any other registry, not specific
#                           to kind at all.
#
# For purely local iteration against the "app" kind cluster specifically,
# you can skip a registry entirely and use `kind load docker-image <image>
# --name app` instead of --push, faster, but doesn't validate
# imagePullPolicy/auth, and only works with kind.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${IMAGE_REGISTRY:-}" ]]; then
  echo "Error: IMAGE_REGISTRY is not set. Example: IMAGE_REGISTRY=ghcr.io/<your-user>" >&2
  exit 1
fi

IMAGE_NAME="${IMAGE_NAME:-pacman}"

TAG="$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  TAG="${TAG}-dirty"
fi

IMAGE="${IMAGE_REGISTRY}/${IMAGE_NAME}:${TAG}"

PUSH=false
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    *)
      echo "Error: unknown argument '$arg'" >&2
      exit 1
      ;;
  esac
done

echo "Building ${IMAGE} ..." >&2
docker build -t "${IMAGE}" "${REPO_ROOT}" >&2

if [[ "${PUSH}" == true ]]; then
  echo "Pushing ${IMAGE} ..." >&2
  docker push "${IMAGE}" >&2
fi

echo "${IMAGE}"
