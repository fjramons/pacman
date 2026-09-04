# Pac-Man Modernized

A modernized take on the classic Pac-Man Node.js game, adapted as a Platform Engineering reference example: builds a container image, deploys to Kubernetes with parametrized manifests, and connects to an externally provisioned PostgreSQL instance. Targets Node 22, renders server views with EJS, emits structured logs through Pino.

```text
┌────────────────────────┐    ┌────────────────────────┐
│       pacman-app       │    │  PostgreSQL / MongoDB  │
│   (game + REST API)    │◀──▶│      hall of fame      │
│       container        │    │  (highscores, stats)   │
└────────────────────────┘    └────────────────────────┘
```

## Features

- **Configurable database backend**: `DB_DRIVER=postgres` (default) or `mongo`, both behind the same driver interface, each with its own test suite.
- **No self-managed database in the Kubernetes deployment**: `k8s/` manifests connect to an externally provisioned PostgreSQL. `docker-compose.yml` is the exception, bundling its own PostgreSQL for local testing.
- **Structured logging**: consistent JSON output across the API, location probes, and server bootstrap.
- **Automated testing**: Mocha/Chai/Supertest — `mongodb-memory-server` for the Mongo path (`npm test`), a real PostgreSQL instance for the Postgres path (`npm run test:postgres`).
- **Container & orchestration ready**: multi-stage, non-root `Dockerfile`; parametrized Kubernetes manifests, no secrets or registry hardcoded.
- **`/healthz` endpoint**: checks live connectivity to the active database backend, used by K8s readiness/liveness probes.

## Getting Started

- [**Docker & Docker Compose**](#docker--docker-compose): quickest way to try it, only Docker needed.
- [**Kubernetes Deployment**](#kubernetes-deployment): what this repo is built to demonstrate.
- [**Local Development**](#local-development): for editing or debugging the app directly on your host.

## Docker & Docker Compose

Prerequisites: Docker, with the Compose plugin.

```bash
docker compose up --build
```

Provisions the schema automatically on first start and persists PostgreSQL data via the `postgres-data` volume. Works with no `.env` file; see [Environment Variables](#environment-variables) for overrides.

```bash
docker compose down       # stop and remove the containers
docker compose down -v    # also delete the saved highscores/stats
```

### Load simulation (advanced, optional)

Opt-in service (`pacman-load`, not started by `docker compose up`) driving headless browsers against the app to generate concurrent-player traffic.

```bash
docker compose run --rm pacman-load
```

Runs indefinitely by default (`LOAD_TEST_MAX_ITERATIONS=0`), stop with `Ctrl-C`. See [Load Simulation](#load-simulation) for `LOAD_TEST_*` variables.

## Kubernetes Deployment

Prerequisites: Docker, `kubectl`, `envsubst`, and access to a Kubernetes cluster.

### 1. Build and push the image

```bash
TAG=$(git rev-parse --short HEAD)
UUID=$(uuidgen)
docker build -t "ttl.sh/${UUID}/pacman:${TAG}" .
docker push "ttl.sh/${UUID}/pacman:${TAG}"
```

[ttl.sh](https://ttl.sh) is anonymous, no login, works against any cluster (images expire after 24h). Alternatives:

- **Local `kind` cluster**: `docker build -t local/pacman:$TAG .` then `kind load docker-image local/pacman:$TAG --name <cluster>`.
- **Persistent deployment**: push to your own registry, e.g. `docker build -t ghcr.io/<your-user>/pacman:$TAG . && docker push ghcr.io/<your-user>/pacman:$TAG` (needs `docker login ghcr.io`).

`scripts/build-and-push.sh` runs the same build/push and computes the tag: `IMAGE_REGISTRY="ttl.sh/${UUID}" ./scripts/build-and-push.sh --push`.

### 2. Deploy

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

Full reference: [`k8s/README.md`](k8s/README.md).

**All-in-one**, bundling a throwaway PostgreSQL in the same cluster:

```bash
export IMAGE_REGISTRY=ttl.sh/${UUID}
export IMAGE_NAME=pacman
export IMAGE_TAG=${TAG}

cat k8s/all-in-one/*.yaml | envsubst | kubectl apply -f -
```

Full reference: [`k8s/all-in-one/README.md`](k8s/all-in-one/README.md).

- `k8s/gateway-api/`: optional next step, exposing the app through Gateway API instead of `Service type=LoadBalancer`.
- **Kustomize alternative**: both variants above, parametrized with Kustomize instead of `envsubst`. See [`k8s/kustomize/README.md`](k8s/kustomize/README.md).

## Local Development

Prerequisites: Node.js ≥ 18 (developed against Node 22), npm ≥ 9, and a reachable database (PostgreSQL by default, or MongoDB with `DB_DRIVER=mongo`) — e.g. `docker compose up pacman-postgres`. `npm test` (Mongo path) needs none of that: `mongodb-memory-server` runs its own throwaway binary.

```bash
npm install

npm start             # run the app
npm run dev            # hot-reload development server (nodemon)

npm run lint
npm test              # Mongo path (mongodb-memory-server, no external DB needed)
npm run test:postgres # Postgres path (requires PGHOST etc. pointing at a real instance)
npm run build
```

If your local Node version breaks the test tooling, run it inside a pinned Node image instead:

```bash
scripts/test-in-docker.sh                                                      # npm test, Mongo path
scripts/test-in-docker.sh --network <docker-network> -- npm run test:postgres  # Postgres path
```

### Environment Variables

Copy `.env.example` to `.env` and adjust. Also read by Docker Compose (optional, already works with defaults). Not used for the Kubernetes deployment, which gets its configuration from a rendered `ConfigMap`/`Secret` instead.

| Variable | Purpose | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `production` |
| `PORT` | HTTP port | `8080` |
| `DB_DRIVER` | `postgres` or `mongo` | `postgres` |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Standard libpq env vars, read natively by the `pg` driver | see `.env.example` |
| `PGSSLMODE` | `disable` or `require` | `disable` |
| `MONGO_SERVICE_HOST`, `MY_MONGO_PORT`, `MONGO_DATABASE`, `MONGO_USE_SSL`, `MONGO_VALIDATE_SSL`, `MONGO_AUTH_USER`, `MONGO_AUTH_PWD`, `MONGO_REPLICA_SET` | Mongo connection settings | see `.env.example` |

### Load Simulation

Browser-based load driver exercising the UI and backing API routes. Install Playwright (v1.56.x) browsers once:

```bash
npx playwright install chromium
```

Start the app (`npm start`) in one terminal, then in another:

```bash
npm run load:test
```

Docker Compose users can run the same driver in an ephemeral container instead, see [Docker & Docker Compose](#docker--docker-compose).

| Variable | Description | Default |
| --- | --- | --- |
| `LOAD_TEST_BASE_URL` | Target URL for the load driver | `http://localhost:8080` |
| `LOAD_TEST_VUS` | Number of concurrent virtual users | `5` |
| `LOAD_TEST_MIN_SESSION` / `LOAD_TEST_MAX_SESSION` | Session duration range (seconds) | `10` / `30` |
| `LOAD_TEST_THINK_TIME_MS` | Think time between actions (ms) | `750` |
| `LOAD_TEST_MAX_SCORE` / `LOAD_TEST_MAX_LEVEL` / `LOAD_TEST_MAX_LIVES` | Gameplay metric limits | `5000` / `25` / `5` |

## Continuous Integration & Releases

GitHub Actions workflows live in `.github/workflows`. Full details in [`.github/workflows/README.md`](.github/workflows/README.md).

- `ci.yml`: lint → tests (Node 18/20 matrix) → build, on pushes to `master`/`modernize` and pull requests. Verification only.
- `release.yml`: on version tags (`v*`) or manual dispatch, same gate plus `npm pack` with a GitHub Release, and (tag push only) publishing the image to GHCR (`ghcr.io/<owner>/pacman:<tag>`).

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

Fork-of-a-fork, evolved as a Platform Engineering reference example:

- Original game and Docker/Kubernetes wrapper: [font/pacman](https://github.com/font/pacman) and [font/k8s-example-apps](https://github.com/font/k8s-example-apps) by Ivan Font.
- Modernized base this fork started from: [cftechwiz/pacman](https://github.com/cftechwiz/pacman).
- This fork: [fjramons/pacman](https://github.com/fjramons/pacman).

Licensed under GPL-3.0 (see `LICENSE`), same as upstream.
