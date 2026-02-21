# GapWalk Backend

REST API server for **GapWalk** — a micro-walk research intervention platform that identifies schedule gaps and sends nudge notifications encouraging short walks throughout the day.

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
| `DATABASE_URL`           | Yes      | —                        | PostgreSQL connection string                                |
| `REDIS_URL`              | Yes      | `redis://localhost:6379` | Redis connection URL                                        |
| `AUTH0_DOMAIN`           | Yes      | —                        | Auth0 tenant domain                                         |
| `AUTH0_AUDIENCE`         | Yes      | —                        | Auth0 API audience                                          |
| `AUTH0_CLIENT_ID`        | Yes      | —                        | Auth0 application client ID                                 |
| `AUTH0_CLIENT_SECRET`    | Yes      | —                        | Auth0 application client secret                             |
| `EXPO_ACCESS_TOKEN`      | Yes      | —                        | Expo push notification access token                         |
| `PORT`                   | No       | `3000`                   | HTTP port                                                   |
| `NODE_ENV`               | No       | `development`            | `development` or `production`                               |
| `CORS_ORIGIN`            | No       | `http://localhost:8081`  | Allowed CORS origin                                         |
| `ENABLE_WORKERS`         | No       | `true`                   | Set `false` to disable BullMQ schedulers/processors         |
| `PRISMA_CONNECT_IN_TEST` | No       | `false`                  | When `NODE_ENV=test`, set `true` to force Prisma DB connect |
| `GOOGLE_CLIENT_ID`       | No       | —                        | Google Calendar OAuth client ID                             |
| `GOOGLE_CLIENT_SECRET`   | No       | —                        | Google Calendar OAuth client secret                         |

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
docker compose up -d
```

| Service          | Port | Purpose                    |
| ---------------- | ---- | -------------------------- |
| `postgres`       | 5432 | PostgreSQL 16 database     |
| `redis`          | 6379 | BullMQ queue backend       |
| `prisma-migrate` | —    | Runs migrations then exits |
| `api`            | 3000 | Production API server      |

## Project Structure

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema (16 models, 8 enums)
├── dashboard/
│   └── public/index.html      # Researcher dashboard SPA
├── src/
│   ├── main.ts                # Bootstrap, CORS, Swagger, global pipes/filters
│   ├── app.module.ts          # Root module (18 modules)
│   ├── prisma/                # PrismaService (global DB client)
│   ├── config/                # ConfigModule (typed env config)
│   ├── common/                # Guards, filters, interceptors, decorators, DTOs
│   ├── auth/                  # Auth0 JWT strategy, auto-registration
│   ├── users/                 # User profile CRUD
│   ├── devices/               # Expo push token management
│   ├── preferences/           # Walk goals, notification settings
│   ├── schedule/              # Schedule sources & busy events
│   ├── manual-schedule/       # Weekly template → busy event generation
│   ├── nudge-engine/          # Gap-finding algorithm, plan generation
│   ├── nudge-plans/           # Nudge plan lifecycle
│   ├── walk-sessions/         # Walk recording & stats
│   ├── push-notifications/    # Expo push sending, receipt checking
│   ├── sync/                  # Bidirectional offline-first sync
│   ├── analytics/             # Events, crash reports, aggregations
│   ├── behavior-log/          # Nudge response behavior tracking
│   ├── researcher/            # Study management, data export
│   ├── dashboard-spa/         # Dashboard API + static serving
│   └── workers/               # BullMQ background job processors
└── docker-compose.yml
```

## Documentation

| Document                                       | Description                                |
| ---------------------------------------------- | ------------------------------------------ |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Complete REST API reference                |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | System architecture, data flow, algorithms |
| `/docs` (runtime)                              | Interactive Swagger UI                     |

## License

Private — Research use only.
