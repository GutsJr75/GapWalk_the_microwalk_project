# Changelog

All notable changes to the GapWalk backend are documented here.

## [Unreleased] — Production refactor (2026-05-28)

Converted the backend from a research-grade data-collection system into a clean
production API for the published app. No shipped endpoint paths or
request/response shapes used by the mobile app were changed.

### Added
- `DELETE /api/users/me` — GDPR hard delete of the user and **all** associated
  data in a single transaction (including aggregation/push/gap tables that have
  no User foreign key and would otherwise be orphaned). Returns `204`.
- Cursor-based batching for daily nudge generation, configurable via
  `NUDGE_GENERATION_BATCH_SIZE` (default `500`).
- `RequestIdMiddleware` — `X-Request-ID` on every response and error body.
- Enriched `GET /health` — reports PostgreSQL and Redis connectivity; returns
  `503` when a dependency is down.
- Startup environment validation (`config/env.validation.ts`) — fails fast on
  missing `DATABASE_URL` / `REDIS_URL` / Firebase credentials.
- Per-route rate-limit overrides (240/min) on `POST /api/sync`,
  `POST /api/devices/heartbeat`, and `POST /api/nudge-plans/local-delivery`.
- Explicit graceful worker shutdown (`OnApplicationShutdown`) that drains
  in-flight BullMQ jobs and closes queue connections.

### Changed
- `UserRole` enum collapsed from `participant | researcher | admin` to
  `user | admin` (migration `0006_remove_research`).
- `UserProfile` repurposed as an optional personalization profile (age group,
  biological sex, height/weight, occupation, activity level, referral, locale).
- Analytics aggregation endpoints (`GET /api/analytics/daily|weekly`) are now
  always scoped to the authenticated user.

### Removed
- `researcher/` module (study management, enrollment, data export endpoints).
- `dashboard-spa/` module and the static researcher dashboard (`/dashboard`),
  plus its `COPY` in the Dockerfile.
- `Study`, `StudyEnrollment`, `ResearcherAction` models and the
  `ResearcherActionType` enum.
- `UserProfile` research fields: `studyGroup`, `consentVersion`,
  `consentGivenAt`, `onboardingCompletedAt`.
- Researcher-gated query endpoints on analytics and behavior-log.

### Security
- Removed `role` from the `PATCH /api/users/me` DTO to prevent clients from
  self-escalating to `admin`.
- Confirmed in place: Helmet headers, env-configured CORS, JWT on all endpoints
  except `/health`, Prisma parameterized queries only, no secrets logged.

### Migration
- `0006_remove_research` — drops research tables/columns and remaps the
  `UserRole` enum (existing `participant`/`researcher` rows → `user`).
