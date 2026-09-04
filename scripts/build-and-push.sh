#!/usr/bin/env bash
# Builds the app image with a unique per-build tag and, optionally, pushes it to a configurable registry. Never hardcodes a registry: IMAGE_REGISTRY must be set by the caller (e.g. exported before running, or inline).
#
# Usage:
#   IMAGE_REGISTRY=ghcr.io/<your-user> ./scripts/build-and-push.sh
#   IMAGE_REGISTRY=ghcr.io/<your-user> ./scripts/build-and-push.sh --push
#
# The tag defaults to a short commit SHA (see below), but can be pinned explicitly instead, e.g. for a release build tagging both a version and "latest" from the same commit:
#   IMAGE_REGISTRY=... IMAGE_TAG=v1.2.3 ./scripts/build-and-push.sh --push
#   IMAGE_REGISTRY=... IMAGE_TAG=latest  ./scripts/build-and-push.sh --push
#
# Prints only the final image reference to stdout (all other output goes to stderr), so it can be captured and chained into the k8s/ envsubst step:
#   IMAGE=$(IMAGE_REGISTRY=... ./scripts/build-and-push.sh --push)
#
# Registry alternatives:
#   - ghcr.io/<your-user>   persistent, authenticated (docker login ghcr.io)
#   - ttl.sh/<unique-name>  anonymous, no login, works against any Kubernetes cluster, images expire (max 24h):
#                             UUID=$(uuidgen)
#                             IMAGE_REGISTRY="ttl.sh/${UUID}" ./scripts/build-and-push.sh --push
#                           reuse the same $UUID when rendering the k8s/ manifests.
#
# Local "app" kind cluster only: `kind load docker-image <image> --name app` instead of --push. Faster, but skips imagePullPolicy/auth validation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${IMAGE_REGISTRY:-}" ]]; then
  echo "Error: IMAGE_REGISTRY is not set. Example: IMAGE_REGISTRY=ghcr.io/<your-user>" >&2
  exit 1
fi

IMAGE_NAME="${IMAGE_NAME:-pacman}"

if [[ -n "${IMAGE_TAG:-}" ]]; then
  TAG="${IMAGE_TAG}"   # used as-is; the "-dirty" suffix below only applies to the auto-derived commit SHA tag
else
  TAG="$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
  if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
    TAG="${TAG}-dirty"
  fi
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
