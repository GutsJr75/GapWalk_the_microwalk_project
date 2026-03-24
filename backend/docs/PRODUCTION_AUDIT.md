# GapWalk Backend - Production Readiness Audit

> Review findings and changes applied to prepare the backend for production deployment.

---

## Audit Date: March 3, 2026

## Summary

The GapWalk backend is a well-structured NestJS 11 application with PostgreSQL, Redis/BullMQ, Auth0 authentication, and Expo push notifications. The codebase is production-ready with the following changes applied.

---

## Changes Applied

### 🔒 Security

| Change | File | Details |
|---|---|---|
| Non-root Docker user | `Dockerfile` | Added `appuser` group/user, `USER appuser` directive |
| Docker healthcheck | `Dockerfile` | Added `HEALTHCHECK` instruction for container orchestration |
| `npm ci --ignore-scripts` | `Dockerfile` | Prevents malicious post-install scripts during build |
| CORS origin in production compose | `docker-compose.yml` | Added `CORS_ORIGIN` env var with production placeholder |
| Production env guide | `.env.example` | Added production deployment notes and security reminders |

### 🐛 Bug Fixes

| Change | File | Details |
|---|---|---|
| Filter inactive users in nudge generation | `nudge-generation.processor.ts` | `generateForAllUsers()` now filters `isActive: true` - previously generated plans for all users including deactivated ones |
| Filter inactive users in daily aggregation | `aggregation.processor.ts` | `computeDailyAll()` now filters `isActive: true` |
| Filter inactive users in weekly aggregation | `aggregation.processor.ts` | `computeWeeklyAll()` now filters `isActive: true` |
| Dashboard copy in Docker | `Dockerfile` | Added `COPY --from=builder /app/dashboard ./dashboard` - dashboard SPA was not included in production image |

### ⚡ Production Hardening

| Change | File | Details |
|---|---|---|
| Graceful shutdown hooks | `main.ts` | Added `app.enableShutdownHooks()` for clean Prisma/Redis disconnects |
| Production log levels | `main.ts` | Reduces log output in production (only `error`, `warn`, `log`) |
| Redis memory limits | `docker-compose.yml` | Added `maxmemory 256mb` and `allkeys-lru` eviction policy |
| Service restart policy | `docker-compose.yml` | Added `restart: unless-stopped` to all persistent services |

### 📝 Documentation Fix

| Change | File | Details |
|---|---|---|
| Push send schedule | `ARCHITECTURE.md` | Fixed "every 2 minutes" → "every 1 minute" to match actual cron `* * * * *` |

---

## Architecture Review Findings

### ✅ Correct Implementation

| Area | Status | Notes |
|---|---|---|
| **Auth0 JWT validation** | ✅ | Proper JWKS endpoint, RS256 algorithm, rate-limited key requests |
| **Auto-registration** | ✅ | First JWT creates user record, subsequent JWTs sync email/displayName |
| **Role-based access** | ✅ | `RolesGuard` correctly checks `@Roles()` decorator |
| **Prisma error handling** | ✅ | Maps P2002/P2025/P2003/P2014 to proper HTTP status codes |
| **Response wrapping** | ✅ | `TransformInterceptor` consistently wraps all responses |
| **Validation** | ✅ | Global `ValidationPipe` with whitelist, transform, forbidNonWhitelisted |
| **Nudge engine algorithm** | ✅ | Correct gap finding, scoring, budget allocation, duration distribution |
| **Quiet hours handling** | ✅ | Handles overnight quiet hours, edge cases with walks spanning boundaries |
| **Timezone-aware processing** | ✅ | All date logic uses user's timezone with `TZDate` |
| **Sync deduplication** | ✅ | `localId`-based dedup for events, sessions; LWW for preferences |
| **Push notification lifecycle** | ✅ | Proper chunking, ticket logging, receipt checking, device deactivation |
| **Aggregation computation** | ✅ | Correct daily/weekly rollup with upsert |
| **Worker scheduling** | ✅ | Correct cron patterns, proper `upsertJobScheduler` usage |
| **Study data export** | ✅ | Exports all relevant data scoped to enrolled participants |
| **Database schema** | ✅ | Well-indexed, proper cascading deletes, composite unique constraints |

### ⚠️ Recommendations for Future Improvement

| Area | Priority | Recommendation |
|---|---|---|
| **Rate limiting** | High | Add `@nestjs/throttler` to protect against API abuse |
| **HTTP security headers** | Medium | Add `helmet` middleware for Content-Security-Policy, X-Frame-Options, etc. |
| **Request logging** | Medium | Add structured logging (e.g., `pino` or `winston`) with request IDs |
| **API versioning** | Low | Consider `/api/v1/` prefix for future backward compatibility |
| **Database transactions** | Medium | Wrap sync endpoint operations in a Prisma transaction for atomicity |
| **Queue monitoring** | Medium | Add BullMQ Board UI or Grafana dashboard for job queue monitoring |
| **Connection pooling** | Medium | Consider PgBouncer for high-concurrency production environments |
| **Compression** | Low | Add gzip compression for API responses (via `compression` middleware) |

---

## Logic Verification Summary

### Nudge Engine (`nudge-engine.service.ts`)

- ✅ Gap finding correctly merges overlapping intervals
- ✅ Quiet hours validation handles overnight windows (23:00→06:00)
- ✅ Quiet hours overlap detection catches walks spanning quiet period boundaries
- ✅ Gap scoring favors work hours (08:00–17:00) and lunch windows (11:00–14:00)
- ✅ Preferred walking periods boost gap scores by +30
- ✅ Sustainability guard limits notifications to `dailyTarget / minWalkMinutes`
- ✅ Round-robin allocation gives 1 notification per gap before filling extras
- ✅ Duration distribution is round-robin with capacity constraints
- ✅ Plans for today correctly filter out past walk start times

### Sync Service (`sync.service.ts`)

- ✅ Schedule source: upsert (last-write-wins)
- ✅ Preferences: upsert with proper JSON handling
- ✅ Busy events: append with localId dedup
- ✅ Manual schedule entries: full replace (delete all + create)
- ✅ Nudge plans: upsert by localId, status last-write-wins
- ✅ Walk sessions: append with localId dedup, resolves nudgePlanId via localId lookup
- ✅ Pause events and route points: persisted per walk session
- ✅ Analytics events and crash reports: always appended
- ✅ Achievements: upsert by composite key
- ✅ Server state returned filtered by lastSyncedAt

### Push Notifications (`push-notifications.service.ts`)

- ✅ Validates Expo push tokens before sending
- ✅ Chunks notifications per Expo SDK requirements
- ✅ Logs push results (ticket ID, error messages)
- ✅ Auto-deactivates `DeviceNotRegistered` tokens
- ✅ Updates nudge plan with push ticket info
- ✅ `sendDueNudges` correctly queries planned + server origin + walkStart <= now
- ✅ Receipt checking processes up to 300 pending logs per run

### Workers

- ✅ Nudge generation: daily at 06:00, per-user error isolation
- ✅ Push send: every 1 minute, checks for due plans
- ✅ Receipt check: every 15 minutes, up to 300 receipts
- ✅ Daily aggregation: 02:00, yesterday in each user's timezone
- ✅ Weekly aggregation: Monday 03:00, last week per user's timezone
- ✅ Workers disabled when `ENABLE_WORKERS=false` or `NODE_ENV=test`
