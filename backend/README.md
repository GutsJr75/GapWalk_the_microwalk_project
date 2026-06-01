# GapWalk Backend

REST API server for **GapWalk** - a published micro-walk app that identifies free gaps in a user's schedule and sends nudge notifications encouraging short walks throughout the day. The backend is the optional cloud layer for cross-device sync, server-side nudge generation, and push delivery; the app itself works fully offline-first.

## Tech Stack

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Framework | NestJS 11, TypeScript 5.7             |
| Database  | PostgreSQL 16 (Prisma 7.4 ORM)        |
| Queue     | Redis 7 + BullMQ                      |
| Auth      | Firebase Authentication + Admin SDK   |
| Push      | Expo Server SDK                       |
| Docs      | Swagger (OpenAPI 3) at `/docs`        |

## Quick Start

### Prerequisites

- Node.js 22 LTS (Node.js ≥ 20 supported)
- Docker & Docker Compose (for PostgreSQL + Redis)
- Firebase project with Authentication enabled
- Expo access token (for push notifications)

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your Firebase, Expo, and database credentials
```

### 3. Install dependencies

```bash
npm install
```

### 4. Generate Prisma client & run migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

### 5. Start the server

```bash
# Development (hot-reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`.

| Endpoint  | Description                                          |
| --------- | ---------------------------------------------------- |
| `/api`    | API base path                                        |
| `/docs`   | Interactive Swagger UI                               |
| `/health` | Health check (HTTP + PostgreSQL + Redis reachability) |

## Runtime Notes

- All `today`/`yesterday`/day-boundary logic is computed in the user's timezone (`users.timezone`, default `America/New_York`).
- Background workers can be disabled by setting `ENABLE_WORKERS=false` (useful for tests or API-only local runs).

## Environment Variables

| Variable                 | Required | Default                  | Description                                                 |
| ------------------------ | -------- | ------------------------ | ----------------------------------------------------------- |
| `DATABASE_URL`           | Yes      | -                        | PostgreSQL connection string                                |
| `REDIS_URL`              | Yes      | `redis://localhost:6379` | Redis connection URL                                        |
| `FIREBASE_PROJECT_ID`    | Yes      | -                        | Firebase project ID                                         |
| `FIREBASE_CLIENT_EMAIL`  | Yes      | -                        | Firebase Admin service account client email                 |
| `FIREBASE_PRIVATE_KEY`   | Yes      | -                        | Firebase Admin private key                                  |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | No | -                        | Optional JSON alternative to the Firebase Admin env trio    |
| `EXPO_ACCESS_TOKEN`      | Yes      | -                        | Expo push notification access token                         |
| `PORT`                   | No       | `3000`                   | HTTP port                                                   |
| `NODE_ENV`               | No       | `development`            | `development` or `production`                               |
| `CORS_ORIGIN`            | No       | `http://localhost:8081`  | Allowed CORS origin                                         |
| `ENABLE_WORKERS`         | No       | `true`                   | Set `false` to disable BullMQ schedulers/processors         |
| `SWAGGER_ENABLED`        | No       | (off in prod)            | Set `true`/`false` to force Swagger UI on/off               |
| `RATE_LIMIT_TTL_MS`      | No       | `60000`                  | Throttler window in ms                                      |
| `RATE_LIMIT_MAX`         | No       | `120`                    | Default max requests per window per IP                      |
| `RATE_LIMIT_BLOCK_DURATION_MS` | No | `60000`                | How long to block after exceeding the limit                 |
| `NUDGE_GENERATION_BATCH_SIZE` | No  | `500`                    | Active users processed per page in the daily nudge job      |
| `PRISMA_CONNECT_IN_TEST` | No       | `false`                  | When `NODE_ENV=test`, set `true` to force Prisma DB connect |

> **Startup validation:** these variables are validated at boot via `ConfigModule`'s `validate` function ([src/config/env.validation.ts](src/config/env.validation.ts)). The process fails fast with a clear message if `DATABASE_URL`/`REDIS_URL` are missing or no Firebase Admin credentials are supplied.

## NPM Scripts

| Script                | Description                   |
| --------------------- | ----------------------------- |
| `npm run build`       | Compile TypeScript            |
| `npm run start:dev`   | Development with hot-reload   |
| `npm run start:debug` | Debug mode with inspector     |
| `npm run start:prod`  | Run compiled production build |
| `npm run lint`        | ESLint with autofix           |
| `npm run format`      | Prettier formatting           |
| `npm test`            | Unit tests                    |
| `npm run test:cov`    | Tests with coverage           |
| `npm run test:e2e`    | End-to-end tests              |

## Docker Deployment

```bash
docker compose up -d --build
```

| Service          | Port | Purpose                          |
| ---------------- | ---- | -------------------------------- |
| `postgres`       | 5432 | PostgreSQL 16 database           |
| `redis`          | 6379 | BullMQ queue backend             |
| `prisma-migrate` | -    | Runs migrations then exits       |
| `api`            | 3000 | Production API server            |

All services have health checks, restart policies (`unless-stopped`), and proper dependency ordering. The API container runs as a non-root user with a built-in Docker `HEALTHCHECK`.

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma          # Database schema (20 models, 9 enums)
│   └── migrations/            # SQL migration history
│       ├── 0001_initial/
│       ├── 0002_research_tracking/
│       ├── 0003_firebase_auth/
│       ├── 0004_notification_backup_signals/
│       ├── 0005_remove_schedule_source_google_tokens/
│       └── 0006_remove_research/  # Drops study/researcher models, simplifies roles
├── docs/
│   ├── USER_GUIDE.md          # User & feature documentation
│   ├── API_REFERENCE.md       # Complete REST API reference
│   ├── ARCHITECTURE.md        # System architecture & algorithms
│   ├── DEPLOYMENT.md          # Production deployment guide
│   └── PRODUCTION_AUDIT.md    # Production readiness audit
├── src/
│   ├── main.ts                # Bootstrap, CORS, Swagger, global pipes/filters
│   ├── app.module.ts          # Root module + request-id middleware wiring
│   ├── prisma/                # PrismaService (global DB client)
│   ├── config/                # ConfigModule + startup env validation
│   ├── common/                # Guards, filters, interceptors, decorators, middleware, DTOs
│   ├── health/                # GET /health — DB + Redis connectivity probe
│   ├── auth/                  # Firebase token verification, auto-registration
│   ├── users/                 # GET/PATCH/DELETE /users/me + personalization profile
│   ├── devices/               # Expo push token management
│   ├── preferences/           # Walk goals, notification settings
│   ├── schedule/              # Schedule sources & busy events
│   ├── manual-schedule/       # Weekly template → busy event generation
│   ├── nudge-engine/          # Gap-finding algorithm, plan generation
│   ├── nudge-plans/           # Nudge plan lifecycle
│   ├── walk-sessions/         # Walk recording, route points & stats
│   ├── app-sessions/          # App session lifecycle + achievements sync
│   ├── push-notifications/    # Expo push sending, receipt checking
│   ├── sync/                  # Bidirectional offline-first sync
│   ├── analytics/             # Events, crash reports, per-user aggregations
│   ├── behavior-log/          # Nudge response behavior tracking
│   └── workers/               # BullMQ background job processors (batched, graceful shutdown)
├── Dockerfile                 # Multi-stage build (non-root, healthcheck)
└── docker-compose.yml         # Full production stack
```

## Documentation

| Document                                             | Description                                     |
| ---------------------------------------------------- | ----------------------------------------------- |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md)             | User & feature guide - how GapWalk works        |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md)       | Complete REST API reference                      |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)         | System architecture, data flow, algorithms       |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)             | Production deployment guide                      |
| [docs/PRODUCTION_AUDIT.md](docs/PRODUCTION_AUDIT.md) | Production readiness audit & changes applied     |
| [docs/REFACTOR_DEPLOYMENT_CHECKLIST.md](docs/REFACTOR_DEPLOYMENT_CHECKLIST.md) | Go-live checklist for the refactor + app release |
| [CHANGELOG.md](CHANGELOG.md)                         | Notable changes by release                       |
| `/docs` (runtime)                                    | Interactive Swagger UI                           |

## Production Deployment

### Quick Deploy with Docker Compose

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with production values (see docs/DEPLOYMENT.md for guidance)

# 2. Deploy
docker compose up -d --build

# 3. Verify
curl http://localhost:3000/health
```

### Production Checklist

- [ ] All secrets rotated (Firebase, Expo, DB password)
- [ ] `NODE_ENV=production` set
- [ ] `CORS_ORIGIN` set to your production domain
- [ ] SSL configured (database, Redis, reverse proxy)
- [ ] Database backups configured
- [ ] Monitoring/alerting set up on `/health` endpoint
- [ ] Firewall rules restrict direct access to ports 3000, 5432, 6379

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions and [docs/PRODUCTION_AUDIT.md](docs/PRODUCTION_AUDIT.md) for the full production readiness audit.

## License

Private.
