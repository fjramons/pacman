#!/usr/bin/env bash
# Runs an npm command for this app inside node:22-bookworm-slim (the same
# image the production Dockerfile uses), instead of on the host directly.
#
# Usage:
#   scripts/test-in-docker.sh [--network NAME] [-- CMD...]
#
#   --network NAME   join an existing Docker network (needed for
#                     `npm run test:postgres` to reach a PostgreSQL
#                     instance running in another container/kind cluster)
#   CMD...            command to run inside the container after "--"
#                     (default: npm test)
#
# Why this exists: on some hosts, the locally installed Node version is far
# ahead of any LTS and breaks test tooling this app depends on. Mocha's
# bundled yargs can fail with "require is not defined in ES module scope",
# and mongodb-memory-server needs a Mongo binary with a Debian 12 build
# (the default 6.0.14 has none) plus libcurl4, which node:*-bookworm-slim
# doesn't include. Running everything inside a pinned, known-good Node
# image sidesteps all of that regardless of what's installed on the host.
#
# PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE/DB_DRIVER are
# forwarded automatically if already exported in the calling shell.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NETWORK=""
CMD=(npm test)
HAS_CMD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --)
      shift
      CMD=("$@")
      HAS_CMD=true
      break
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ "$HAS_CMD" == true && ${#CMD[@]} -eq 0 ]]; then
  echo "Error: '--' given with no command after it" >&2
  exit 1
fi

VOLUME_NAME="$(basename "$REPO_ROOT")_node_modules"

# Pre-create the mountpoint as the current (non-root) user. Otherwise,
# since node_modules doesn't exist yet inside the bind-mounted repo, Docker
# creates it itself as the mountpoint for the named volume below, owned by
# root (the daemon's own user), leaving a root-owned directory on the host
# after every run.
mkdir -p "${REPO_ROOT}/node_modules"

DOCKER_ARGS=(
  --rm
  -v "${REPO_ROOT}:/app"
  -w /app
  -v "${VOLUME_NAME}:/app/node_modules"
  -e "MONGOMS_VERSION=${MONGOMS_VERSION:-7.0.14}"
)

for var in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE DB_DRIVER; do
  if [[ -n "${!var:-}" ]]; then
    DOCKER_ARGS+=(-e "${var}=${!var}")
  fi
done

if [[ -n "$NETWORK" ]]; then
  DOCKER_ARGS+=(--network "$NETWORK")
fi

SHELL_CMD="apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq libcurl4 >/dev/null 2>&1 && npm install --no-audit --no-fund && "
for arg in "${CMD[@]}"; do
  SHELL_CMD+="$(printf '%q ' "$arg")"
done

docker run "${DOCKER_ARGS[@]}" node:22-bookworm-slim sh -c "$SHELL_CMD"
