# Pac-Man Modernized

This repo hosts a modernized take on the classic Pac-Man Node.js game, adapted as a Platform Engineering reference example: it builds a container image and deploys to Kubernetes with parametrized manifests, connecting there to an externally provisioned PostgreSQL instance instead of deploying its own. That external-database setup is what the Kubernetes manifests are built for; for casual local testing, `docker-compose.yml` instead bundles its own PostgreSQL as a convenient all-in-one alternative, not meant to mirror the Kubernetes deployment. The app targets Node 22, renders server views with EJS, and emits structured logs through Pino.

At its simplest, it's just two pieces talking to each other: a container running the game and its REST API, and a database holding the hall of fame.

```text
┌────────────────────────┐    ┌────────────────────────┐
│       pacman-app       │    │  PostgreSQL / MongoDB  │
│   (game + REST API)    │◀──▶│      hall of fame      │
│       container        │    │  (highscores, stats)   │
└────────────────────────┘    └────────────────────────┘
```

## Features

- **Configurable database backend**: `DB_DRIVER=postgres` (default) or `mongo`. Postgres is the primary target for this reference example; the original Mongo path is preserved behind the same driver interface, unchanged and still covered by its own test suite.
- **No self-managed database in the Kubernetes deployment**: the K8s manifests under `k8s/` connect the app to an externally provisioned PostgreSQL instance, they never deploy one themselves. `docker-compose.yml` is the exception, bundling its own PostgreSQL for casual local testing.
- **Structured logging**: consistent JSON output across the API, location probes, and server bootstrap.
- **Automated testing**: Mocha/Chai/Supertest, with `mongodb-memory-server` for the Mongo path (`npm test`) and a real PostgreSQL instance for the Postgres path (`npm run test:postgres`).
- **Container & orchestration ready**: multi-stage, non-root `Dockerfile`; parametrized Kubernetes manifests under `k8s/`, no secrets or registry hardcoded.
- **`/healthz` endpoint**: checks live connectivity to whichever database backend is active, used by the K8s readiness/liveness probes.

## Getting Started

Three ways to run this, roughly easiest to hardest. Each section below is self-contained, including its own prerequisites: pick the one you need, you shouldn't need to read the others just to follow it.

- [**Docker & Docker Compose**](#docker--docker-compose): quickest way to try it, only Docker needed on your host.
- [**Kubernetes Deployment**](#kubernetes-deployment): what this repo is actually built to demonstrate.
- [**Local Development**](#local-development): for editing or debugging the app itself, directly on your host.

## Docker & Docker Compose

Prerequisites: Docker, with the Compose plugin. Nothing else, Node.js and PostgreSQL both run inside containers.

Run the local stack (app + PostgreSQL) for quick manual testing:

```bash
docker compose up --build
```

The compose file provisions the schema automatically on first start (mounted into `/docker-entrypoint-initdb.d/`) and persists PostgreSQL data via the `postgres-data` volume. It works out of the box with no `.env` file; for the full list of variables you can override, see [Environment Variables](#environment-variables) under Local Development.

When you're done playing:

```bash
docker compose down       # stop and remove the containers
docker compose down -v    # also delete the saved highscores/stats (the postgres-data volume)
```

### Load simulation (advanced, optional)

Not needed to just play the game, skip this unless you specifically want to generate artificial traffic for testing. It's a separate, opt-in service (`pacman-load`, not started by `docker compose up`) that drives several headless browsers against the app, each playing a fake session and posting highscores/stats, useful for checking the app holds up under several concurrent players rather than one request at a time.

```bash
docker compose run --rm pacman-load
```

Runs indefinitely by default (`LOAD_TEST_MAX_ITERATIONS=0`), stop it with `Ctrl-C` (the `--rm` flag cleans up the container). Configured via the `LOAD_TEST_*` environment variables, see [Load Simulation](#load-simulation) under Local Development for the full list.

## Kubernetes Deployment

Prerequisites: Docker (to build the image), `kubectl`, `envsubst`, and access to a Kubernetes cluster. No Node.js, npm, PostgreSQL or MongoDB needed on your host, everything runs inside the cluster.

### 1. Build and push the image

`kubectl apply` can't build one for you, so you need one pushed somewhere reachable first, with a unique tag (never `latest`):

```bash
TAG=$(git rev-parse --short HEAD)
UUID=$(uuidgen)
docker build -t "ttl.sh/${UUID}/pacman:${TAG}" .
docker push "ttl.sh/${UUID}/pacman:${TAG}"
```

[ttl.sh](https://ttl.sh) is anonymous, no login, and works against any Kubernetes cluster (images expire after at most 24h): a good default for casual use. Two other options:

- **Local `kind` cluster specifically**: skip pushing anywhere, `docker build -t local/pacman:$TAG .` then `kind load docker-image local/pacman:$TAG --name <cluster>`.
- **A real, persistent deployment**: push to your own registry instead, e.g. `docker build -t ghcr.io/<your-user>/pacman:$TAG . && docker push ghcr.io/<your-user>/pacman:$TAG` (needs `docker login ghcr.io` first).

`scripts/build-and-push.sh` runs the same `docker build`/`docker push` shown above and computes the tag for you: `IMAGE_REGISTRY="ttl.sh/${UUID}" ./scripts/build-and-push.sh --push`.

### 2. Deploy

Two ways to deploy, depending on whether you have a PostgreSQL to point at.

**With an external PostgreSQL**, matching the real deployment:

```bash
export IMAGE_REGISTRY=ttl.sh/${UUID}
export IMAGE_NAME=pacman
export IMAGE_TAG=${TAG}
export DB_HOST=...             # DB host
export DB_USER=...             # DB user
export DB_PASSWORD=...         # DB password
export DB_PORT=5432
export DB_DATABASE=pacman
export DB_SSLMODE=disable

cat k8s/base/*.yaml | envsubst | kubectl apply -f -
```

Full reference, including how the schema gets applied: [`k8s/README.md`](k8s/README.md).

**All-in-one**, if you don't have a PostgreSQL to point at, bundles a throwaway one in the same cluster:

```bash
export IMAGE_REGISTRY=ttl.sh/${UUID}
export IMAGE_NAME=pacman
export IMAGE_TAG=${TAG}

cat k8s/all-in-one/*.yaml | envsubst | kubectl apply -f -
```

Full reference: [`k8s/all-in-one/README.md`](k8s/all-in-one/README.md).

`k8s/gateway-api/` documents an optional next step for exposing the app through Gateway API instead of the current `Service type=LoadBalancer`.

**Kustomize alternative**: both variants above are also available parametrized with Kustomize generators/transformers instead of `envsubst`, see [`k8s/kustomize/README.md`](k8s/kustomize/README.md).

Testing this locally (without access to a real provisioned cluster/database) means standing up two `kind` clusters: one for the app, one simulating an externally provisioned PostgreSQL, reachable from the other over their shared Docker network. That walkthrough is workspace-specific setup, not part of this repo.

## Local Development

Prerequisites: Node.js ≥ 18 (developed and tested against Node 22) and npm ≥ 9, installed on your host. Also needs a *reachable* database (PostgreSQL by default, or MongoDB with `DB_DRIVER=mongo`), which doesn't need to be installed on the host either, just pointed at via `PGHOST`/`MONGO_SERVICE_HOST`/etc., e.g. the one `docker compose up pacman-postgres` gives you. `npm test` (the Mongo-path test suite) needs none of that: `mongodb-memory-server` downloads and runs its own throwaway Mongo binary.

```bash
npm install

# Run the app
npm start

# Hot-reload development server (nodemon)
npm run dev

# Lint, test, and combined build script
npm run lint
npm test              # Mongo path (mongodb-memory-server, no external DB needed)
npm run test:postgres # Postgres path (requires PGHOST etc. pointing at a real instance)
npm run build
```

If your locally installed Node version is far ahead of any LTS and breaks the test tooling (mocha's bundled yargs, `mongodb-memory-server` needing a Mongo build for your host's OS), run everything inside a pinned, known-good Node image instead:

```bash
scripts/test-in-docker.sh                                          # npm test, Mongo path
scripts/test-in-docker.sh --network <docker-network> -- npm run test:postgres  # Postgres path, reaching a real instance over that network
```

### Environment Variables

Copy `.env.example` to `.env` and adjust. Also read by Docker Compose (optional there, it already works with defaults). Not used for the Kubernetes deployment, which gets its configuration from a rendered `ConfigMap`/`Secret` instead, see [Kubernetes Deployment](#kubernetes-deployment). Key values:

| Variable | Purpose | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `production` |
| `PORT` | HTTP port | `8080` |
| `DB_DRIVER` | `postgres` or `mongo` | `postgres` |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Standard libpq env vars, read natively by the `pg` driver (used when `DB_DRIVER=postgres`) | see `.env.example` |
| `PGSSLMODE` | `disable` or `require` | `disable` |
| `MONGO_SERVICE_HOST`, `MY_MONGO_PORT`, `MONGO_DATABASE`, `MONGO_USE_SSL`, `MONGO_VALIDATE_SSL`, `MONGO_AUTH_USER`, `MONGO_AUTH_PWD`, `MONGO_REPLICA_SET` | Mongo connection settings (used when `DB_DRIVER=mongo`) | see `.env.example` |

### Load Simulation

An automated browser-based load driver is available to exercise the UI and backing API routes. Install Playwright (v1.56.x) browsers once:

```bash
npx playwright install chromium
```

Then start the app (`npm start`) in one terminal and, in another, run:

```bash
npm run load:test
```

Docker Compose users can run the same driver in an ephemeral container instead, see [Docker & Docker Compose](#docker--docker-compose).

Environment variables control the session behaviour:

| Variable | Description | Default |
| --- | --- | --- |
| `LOAD_TEST_BASE_URL` | Target URL for the load driver | `http://localhost:8080` |
| `LOAD_TEST_VUS` | Number of concurrent virtual users | `5` |
| `LOAD_TEST_MIN_SESSION` / `LOAD_TEST_MAX_SESSION` | Session duration range (seconds) | `10` / `30` |
| `LOAD_TEST_THINK_TIME_MS` | Think time between actions (ms) | `750` |
| `LOAD_TEST_MAX_SCORE` / `LOAD_TEST_MAX_LEVEL` / `LOAD_TEST_MAX_LIVES` | Gameplay metric limits | `5000` / `25` / `5` |

## Continuous Integration & Releases

GitHub Actions workflows live in `.github/workflows`, cleanly separated by trigger: a commit runs CI, a version tag publishes a release. Full details in [`.github/workflows/README.md`](.github/workflows/README.md).

- `ci.yml` runs lint ➝ tests (Node 18/20 matrix) ➝ build on pushes to `master` or `modernize`, and on pull requests. Verification only, nothing published.
- `release.yml` triggers on version tags (`v*`) or manual dispatch: the same lint/test/build gate, `npm pack` with a GitHub Release, and (only on an actual tag push) building and pushing the container image to GHCR (`ghcr.io/<owner>/pacman:<tag>`).

## Project Structure Highlights

```text
.
├── app.js                 # Express app setup, /healthz endpoint
├── bin/server.js          # HTTP server bootstrap with Pino logging
├── public/                # Front-end game assets (HTML/CSS/JS/media)
├── routes/                # REST API routes (highscores, user stats, location metadata)
├── lib/db/                # Database adapters: mongo-adapter.js, postgres-adapter.js, index.js (DB_DRIVER dispatcher)
├── schema.sql             # PostgreSQL schema (idempotent)
├── scripts/               # build-and-push.sh, apply-schema.js (K8s schema Job), test-in-docker.sh
├── test/                  # Mongo-path specs; test/postgres/ has the Postgres-path specs
├── Dockerfile             # Multi-stage, non-root, node:22-bookworm-slim
├── docker-compose.yml     # Local app + PostgreSQL stack, all-in-one for Docker
├── k8s/                   # Parametrized Kubernetes manifests: base/ (external DB), all-in-one/ (bundled DB), gateway-api/, kustomize/ (see k8s/README.md)
└── .github/workflows/     # CI (every commit) and release (version tags: package + publish image, see .github/workflows/README.md)
```

## Attribution

This is a fork-of-a-fork, evolved as a Platform Engineering reference example:

- Original game and Docker/Kubernetes wrapper: [font/pacman](https://github.com/font/pacman) and [font/k8s-example-apps](https://github.com/font/k8s-example-apps) by Ivan Font.
- Modernized base this fork started from: [cftechwiz/pacman](https://github.com/cftechwiz/pacman).
- This fork: [fjramons/pacman](https://github.com/fjramons/pacman).

Licensed under GPL-3.0 (see `LICENSE`), same as upstream.
