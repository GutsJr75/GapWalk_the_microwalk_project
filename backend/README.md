# GapWalk Backend

REST API server for **GapWalk** - a micro-walk research intervention platform that identifies schedule gaps and sends nudge notifications encouraging short walks throughout the day.

## Tech Stack

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Framework | NestJS 11, TypeScript 5.7             |
| Database  | PostgreSQL 16 (Prisma 7.4 ORM)        |
| Queue     | Redis 7 + BullMQ                      |
| Auth      | Auth0 (RS256 JWT via JWKS)            |
| Push      | Expo Server SDK                       |
| Docs      | Swagger (OpenAPI 3) at `/docs`        |
| Dashboard | Served at `/dashboard` (Chart.js SPA) |

## Quick Start

### Prerequisites

- Node.js 22 LTS (Node.js ≥ 20 supported)
- Docker & Docker Compose (for PostgreSQL + Redis)
- Auth0 tenant with an API configured
- Expo access token (for push notifications)

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your Auth0, Expo, and database credentials
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

| Endpoint     | Description              |
| ------------ | ------------------------ |
| `/api`       | API base path            |
| `/docs`      | Interactive Swagger UI   |
| `/health`    | Health check             |
| `/dashboard` | Researcher dashboard SPA |

## Runtime Notes

- All `today`/`yesterday`/day-boundary logic is computed in the user's timezone (`users.timezone`, default `America/New_York`).
- Background workers can be disabled by setting `ENABLE_WORKERS=false` (useful for tests or API-only local runs).

## Environment Variables

| Variable                 | Required | Default                  | Description                                                 |
| ------------------------ | -------- | ------------------------ | ----------------------------------------------------------- |
| `DATABASE_URL`           | Yes      | -                        | PostgreSQL connection string                                |
| `REDIS_URL`              | Yes      | `redis://localhost:6379` | Redis connection URL                                        |
| `AUTH0_DOMAIN`           | Yes      | -                        | Auth0 tenant domain                                         |
| `AUTH0_AUDIENCE`         | Yes      | -                        | Auth0 API audience                                          |
| `AUTH0_CLIENT_ID`        | Yes      | -                        | Auth0 application client ID                                 |
| `AUTH0_CLIENT_SECRET`    | Yes      | -                        | Auth0 application client secret                             |
| `EXPO_ACCESS_TOKEN`      | Yes      | -                        | Expo push notification access token                         |
| `PORT`                   | No       | `3000`                   | HTTP port                                                   |
| `NODE_ENV`               | No       | `development`            | `development` or `production`                               |
| `CORS_ORIGIN`            | No       | `http://localhost:8081`  | Allowed CORS origin                                         |
| `ENABLE_WORKERS`         | No       | `true`                   | Set `false` to disable BullMQ schedulers/processors         |
| `PRISMA_CONNECT_IN_TEST` | No       | `false`                  | When `NODE_ENV=test`, set `true` to force Prisma DB connect |
| `GOOGLE_CLIENT_ID`       | No       | -                        | Google Calendar OAuth client ID                             |
| `GOOGLE_CLIENT_SECRET`   | No       | -                        | Google Calendar OAuth client secret                         |

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
│   ├── schema.prisma          # Database schema (23 models, 11 enums)
│   └── migrations/            # SQL migration history
│       ├── 0001_init/
│       └── 0002_research_tracking/  # User profiles, app sessions, route points, achievements
├── dashboard/
│   └── public/index.html      # Researcher dashboard SPA
├── docs/
│   ├── USER_GUIDE.md          # User & feature documentation
│   ├── API_REFERENCE.md       # Complete REST API reference
│   ├── ARCHITECTURE.md        # System architecture & algorithms
│   ├── DEPLOYMENT.md          # Production deployment guide
│   ├── PRODUCTION_AUDIT.md    # Production readiness audit
│   └── data-analysis.md       # Data analysis & research queries
├── src/
│   ├── main.ts                # Bootstrap, CORS, Swagger, global pipes/filters
│   ├── app.module.ts          # Root module (19 modules)
│   ├── prisma/                # PrismaService (global DB client)
│   ├── config/                # ConfigModule (typed env config)
│   ├── common/                # Guards, filters, interceptors, decorators, DTOs
│   ├── auth/                  # Auth0 JWT strategy, auto-registration
│   ├── users/                 # User profile CRUD + user-profile DTO
│   ├── devices/               # Expo push token management
│   ├── preferences/           # Walk goals, notification settings
│   ├── schedule/              # Schedule sources & busy events
│   ├── manual-schedule/       # Weekly template → busy event generation
│   ├── nudge-engine/          # Gap-finding algorithm, plan generation
│   ├── nudge-plans/           # Nudge plan lifecycle
│   ├── walk-sessions/         # Walk recording, route points & stats
│   ├── app-sessions/          # App session lifecycle tracking (research)
│   ├── push-notifications/    # Expo push sending, receipt checking
│   ├── sync/                  # Bidirectional offline-first sync
│   ├── analytics/             # Events, crash reports, aggregations
│   ├── behavior-log/          # Nudge response behavior tracking
│   ├── researcher/            # Study management, data export
│   ├── dashboard-spa/         # Dashboard API + static serving
│   └── workers/               # BullMQ background job processors
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
| [docs/data-analysis.md](docs/data-analysis.md)       | Data analysis, metrics, SQL queries for research |
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

- [ ] All secrets rotated (Auth0, Expo, DB password)
- [ ] `NODE_ENV=production` set
- [ ] `CORS_ORIGIN` set to your production domain
- [ ] SSL configured (database, Redis, reverse proxy)
- [ ] Database backups configured
- [ ] Monitoring/alerting set up on `/health` endpoint
- [ ] Firewall rules restrict direct access to ports 3000, 5432, 6379

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions and [docs/PRODUCTION_AUDIT.md](docs/PRODUCTION_AUDIT.md) for the full production readiness audit.

## License

Private - Research use only.
