# GapWalk Backend — Architecture

## System Overview

GapWalk is a **hybrid nudging** platform for micro-walk research interventions. The backend computes _when to nudge_ (scheduling), while the mobile app handles _nudge delivery_ (local fallback) and _behavior logging_.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Mobile App (Expo)                            │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌──────────────────────┐ │
│  │ SQLite   │ │ Gap      │ │ Local       │ │ Expo                 │ │
│  │ (offline │ │ Engine   │ │ Notifi-     │ │ Push                 │ │
│  │  store)  │ │ (fallback│ │ cations     │ │ Receiver             │ │
│  └────┬─────┘ └──────────┘ └─────────────┘ └──────────┬───────────┘ │
│       │              Bidirectional Sync                │             │
└───────┼───────────────────────────────────────────────┼─────────────┘
        │           POST /api/sync                      │
        ▼                                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        NestJS API Server                             │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      Auth0 JWT Guard                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Users    │ │ Schedule │ │ Nudge    │ │ Walk     │ │ Analytics│  │
│  │ Devices  │ │ Manual   │ │ Engine   │ │ Sessions │ │ Behavior │  │
│  │ Prefs    │ │ Schedule │ │ Plans    │ │          │ │ Log      │  │
│  └──────────┘ └──────────┘ └────┬─────┘ └──────────┘ └──────────┘  │
│                                  │                                   │
│  ┌──────────┐ ┌─────────────────┼──────────────────┐ ┌──────────┐  │
│  │ Push     │ │      BullMQ Workers                │ │ Research │  │
│  │ Notifi-  │ │  ┌────────┐ ┌────────┐ ┌────────┐ │ │ Studies  │  │
│  │ cations  │◄┤  │ Nudge  │ │ Push   │ │ Agg    │ │ │ Dashboard│  │
│  │ (Expo)   │ │  │ Gen    │ │ Send   │ │ Compute│ │ │ Export   │  │
│  └──────────┘ │  └────────┘ └────────┘ └────────┘ │ └──────────┘  │
│               └────────────────────────────────────┘                │
└────────────────────────┬──────────────────────┬─────────────────────┘
                         │                      │
                    ┌────▼────┐            ┌────▼────┐
                    │ Postgres│            │  Redis  │
                    │   16    │            │    7    │
                    └─────────┘            └─────────┘
```

---

## Module Dependency Graph

```
ConfigModule ──────────────────────────────────────────────────┐
PrismaModule ─────────────────────────────────────┐            │
AuthModule ←── ConfigModule                       │            │
                                                  ▼            ▼
UsersModule         ←── PrismaModule
DevicesModule       ←── PrismaModule
PreferencesModule   ←── PrismaModule
ScheduleModule      ←── PrismaModule
ManualScheduleModule ←── PrismaModule
NudgeEngineModule   ←── PrismaModule
NudgePlansModule    ←── PrismaModule, NudgeEngineModule
WalkSessionsModule  ←── PrismaModule
AppSessionsModule   ←── PrismaModule
PushNotificationsModule ←── PrismaModule, DevicesModule, ConfigModule
SyncModule          ←── PrismaModule
AnalyticsModule     ←── PrismaModule
BehaviorLogModule   ←── PrismaModule
ResearcherModule    ←── PrismaModule
DashboardSpaModule  ←── PrismaModule, ServeStaticModule
WorkersModule       ←── BullModule, PrismaModule, NudgeEngineModule,
                        PushNotificationsModule, AnalyticsModule
```

---

## Authentication & Authorization

### Flow

1. Mobile app authenticates with **Auth0** and receives an RS256-signed JWT.
2. Every API request includes `Authorization: Bearer <token>`.
3. `JwtStrategy` validates the token using Auth0's JWKS endpoint (`/.well-known/jwks.json`).
4. On first valid JWT, if no user exists with that `auth0Sub`, a `User` record is **auto-created** with role `participant`.
5. `RolesGuard` checks the `@Roles()` decorator on each endpoint. No decorator = open to all authenticated users.

### Roles

| Role          | Access                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| `participant` | Own data: profile, preferences, schedule, walk sessions, nudge plans    |
| `researcher`  | All of participant + studies, analytics queries, dashboard, data export |
| `admin`       | Full access                                                             |

### Request Flow

```
Request → JwtAuthGuard → RolesGuard → Controller → Service → Prisma → DB
                                                                   ↓
Response ← TransformInterceptor ← Controller ←─────────────── Result
           (wraps in {success, data, timestamp})

Errors  → PrismaExceptionFilter → HTTP response with proper status code
```

---

## Data Flow

### Offline-First Sync

The mobile app operates **100% offline** using SQLite. Data syncs bidirectionally via `POST /api/sync`:

```
┌─────────────────┐                    ┌─────────────────┐
│   Mobile App    │                    │     Server      │
│                 │                    │                 │
│  SQLite DB      │───── changes ─────▶│  Merge (LWW)   │
│  (source of     │   since lastSync   │                 │
│   truth)        │                    │  PostgreSQL     │
│                 │◀── server state ───│                 │
│  Update local   │   since lastSync   │  Update         │
│  records        │                    │  lastSyncedAt   │
└─────────────────┘                    └─────────────────┘
```

**Merge rules:**

- **Schedule source & preferences:** Last-write-wins (server stores latest)
- **Busy events & walk sessions:** Append-only, deduplicated by `localId`
- **Manual schedule entries:** Full replace on each sync
- **Nudge plans:** Upsert by `localId` (status updated if plan already exists)
- **Analytics events & crash reports:** Always appended (write-only from client)

### Nudge Lifecycle

```
                    ┌──────────────┐
                    │   Schedule   │
                    │  (busy       │
                    │   events)    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Gap Engine  │──▶ Find free gaps between events
                    │              │──▶ Score gaps (time of day, duration)
                    │              │──▶ Allocate notification budget
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
        ┌───────── │  NudgePlan   │ ──────────┐
        │          │  (planned)   │            │
        │          └──────┬───────┘            │
        │                 │                    │
   Push sent         User taps           Timer expires
        │                 │                    │
        ▼                 ▼                    ▼
   ┌──────────┐    ┌──────────┐         ┌──────────┐
   │ notified │───▶│ started  │         │ skipped/ │
   └──────────┘    └─────┬────┘         │cancelled │
                         │              └──────────┘
                    Walk ends
                         │
                         ▼
                   ┌──────────┐
                   │completed │
                   └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │WalkSession│──▶ Steps, distance, calories, duration
                   └──────────┘
```

---

## Nudge Engine Algorithm

The server-side nudge engine (ported from the frontend `gapEngine.ts`) generates optimal walk schedules.

### Input

- User's **busy events** for the target day
- User's **preferences** (daily target, notification count, quiet hours, minimum walk duration, buffer times)

### Step-by-Step Process

#### 1. Find Gaps

Merge overlapping busy intervals, then identify free windows:

```
Timeline:  |──busy──|     |──busy──|          |──busy──|
Gaps:               |─gap─|        |───gap────|
```

#### 2. Validate Gaps

A gap is valid if:

- Duration ≥ `bufferMinutes` + `gracePeriodMinutes` + `minWalkMinutes`
- Does not start during quiet hours (`quietHoursStart` → `quietHoursEnd`)

#### 3. Score Gaps

Each valid gap receives a score:

| Criteria                            | Points        |
| ----------------------------------- | ------------- |
| Ideal duration (8–15 min available) | +100          |
| Work hours (08:00–17:00)            | +20           |
| Lunch window (11:00–14:00)          | +10           |
| Larger gap (more flexibility)       | +5 per 30 min |

#### 4. Compute Notification Budget

```
sustainabilityGuard = min(notificationCountPerDay, dailyTargetMinutes / minWalkMinutes)
```

#### 5. Per-Gap Notification Cap

Based on available time in the gap:

| Available Minutes | Max Notifications |
| ----------------- | ----------------- |
| ≤ 60              | 1                 |
| ≤ 180             | 2                 |
| ≤ 360             | 5                 |
| > 360             | Uncapped          |

Also limited by spacing constraint: `availableMinutes / notificationMinGapMinutes`

#### 6. Allocate Across Gaps

1. Round-robin: 1 notification per gap (highest-scored first)
2. Fill remaining budget into gaps with remaining capacity (by score)

#### 7. Build Walk Slots

For each gap, calculate `walkStart` times with:

```
walkStart = gapStart + bufferMinutes + gracePeriodMinutes
```

Multiple slots spaced by `notificationMinGapMinutes`.

#### 8. Distribute Duration

Round-robin allocation of `dailyTargetMinutes` across all slots, respecting each slot's max capacity and the `minWalkMinutes` floor.

### Output

Array of `NudgePlan` records saved to DB with `status: planned`, ready for push notification delivery.

---

## Background Workers

BullMQ processes background jobs via Redis queues.
Workers are enabled when `ENABLE_WORKERS` is not set to `false`.

### Job Schedules

| Job                        | Schedule         | Description                                                                |
| -------------------------- | ---------------- | -------------------------------------------------------------------------- |
| **Daily nudge generation** | 06:00 every day  | Runs `nudgeEngine.generateAndSavePlans()` for all users                    |
| **Send due nudges**        | Every 1 minute   | Scans due `planned` server plans and sends push notifications              |
| **Push receipt check**     | Every 15 minutes | Verifies Expo push delivery receipts, deactivates unregistered tokens      |
| **Daily aggregation**      | 02:00 every day  | Computes `DailyAggregation` for all users (yesterday in each user's TZ)    |
| **Weekly aggregation**     | Monday 03:00     | Computes `WeeklyAggregation` for all users (last week in each user's local week) |

### Processor Details

**NudgeGenerationProcessor:**

- Iterates all users, calls `generateAndSavePlans()` per user
- Uses each user's timezone when computing today/tomorrow date keys and day boundaries
- Cancels existing `planned`/`notified` plans for the target day(s) first
- Reports success/failure counts

**PushSendProcessor:**

- Handles both ad-hoc `send-nudge` jobs and scheduled `send-due-nudges` scans
- Sends only eligible plans (`planned`/`notified` for ad-hoc, due `planned` for scheduled)
- Calls `pushService.sendWalkNudge()` and records push ticket/log metadata

**AggregationProcessor:**

- Computes daily/weekly windows in each user's timezone
- Computes: total minutes, steps, distance, calories, session count
- Computes: nudges planned/delivered/opened/skipped, goal reached
- Upserts into `DailyAggregation` / `WeeklyAggregation` tables

**ReceiptCheckProcessor:**

- Calls `pushService.checkReceipts()` for up to 300 pending push logs
- Updates delivery status, deactivates unregistered device tokens

---

## Push Notification System

### Sending Flow

```
NudgePlan (planned) ──▶ PushSendProcessor ──▶ Expo Server SDK
                                                    │
                                              ┌─────▼─────┐
                                              │ Expo Push  │
                                              │ Service    │
                                              └─────┬─────┘
                                                    │
                                              ┌─────▼─────┐
                                              │ APNs/FCM  │
                                              └─────┬─────┘
                                                    │
                                              ┌─────▼─────┐
                                              │  Device   │
                                              └───────────┘
```

### Notification Structure

```json
{
  "to": "ExponentPushToken[xxx]",
  "title": "🚶 Time for a walk!",
  "body": "Your 8-minute micro-walk is scheduled now.",
  "sound": "default",
  "priority": "high",
  "channelId": "gapwalk-nudges",
  "categoryId": "walk_nudge_actions",
  "data": { "planId": "uuid", "type": "walk_nudge" }
}
```

### Receipt Checking

Every 15 minutes, the system:

1. Queries `PushLog` entries with status `sent` (up to 300)
2. Fetches receipts from Expo
3. Updates status to `delivered` or `failed`
4. Auto-deactivates devices returning `DeviceNotRegistered`

---

## Database Schema Summary

**23 models** across 5 domains:

| Domain         | Models                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | `User`, `Device`, `UserProfile`                                                                                                        |
| Schedule       | `ScheduleSource`, `BusyEvent`, `ManualScheduleEntry`, `Preference`, `GapOpportunity`                                                   |
| Nudging        | `NudgePlan`, `WalkSession`, `WalkPauseEvent`, `WalkRoutePoint`                                                                         |
| Analytics      | `AnalyticsEvent`, `CrashReport`, `BehaviorLog`, `DailyAggregation`, `WeeklyAggregation`, `AppSession`, `UserAchievement`, `ResearcherAction` |
| Research       | `Study`, `StudyEnrollment`                                                                                                             |
| Infrastructure | `PushLog`                                                                                                                              |

**11 enums:** `UserRole`, `ScheduleSourceType`, `WhenToNotify`, `StrictnessMode`, `NudgePlanStatus`, `NudgePlanOrigin`, `BehaviorEventType`, `PushStatus`, `BiologicalSex`, `OccupationType`, `ActivityLevel`

---

## Researcher Dashboard

A static HTML/JS SPA served at `/dashboard`, backed by the `/api/dashboard-api/*` endpoints.

### Features

| Feature              | Chart Type     | Data Source                                                       |
| -------------------- | -------------- | ----------------------------------------------------------------- |
| Overview stats cards | —              | `GET /overview` (users, sessions, minutes, steps, plans, studies) |
| Daily walk activity  | Bar chart      | `GET /daily-activity` (last 30 days)                              |
| Nudge adherence      | Doughnut chart | `GET /nudge-adherence` (planned/completed/skipped/cancelled)      |
| Top walkers          | Table          | `GET /leaderboard` (name, minutes, steps, sessions)               |

### Authentication

Simple JWT token paste form. In production, this would integrate with Auth0 login.

---

## API Response Format

### Success

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

### Error

```json
{
  "statusCode": 409,
  "message": "Unique constraint failed on the fields: (`email`)",
  "error": "Conflict"
}
```

### Prisma Error Mapping

| Code  | HTTP | Meaning                     |
| ----- | ---- | --------------------------- |
| P2002 | 409  | Unique constraint violation |
| P2025 | 404  | Record not found            |
| P2003 | 400  | Foreign key violation       |
| P2014 | 400  | Required relation violation |

---

## Deployment Architecture

### Docker Compose (Production)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  PostgreSQL │     │    Redis    │     │  API Server │
│    :5432    │◀────│    :6379    │◀────│    :3000    │
└─────────────┘     └─────────────┘     └─────────────┘
       ▲                                       │
       │                                       │
┌──────┴──────┐                         ┌──────┴──────┐
│   Prisma    │                         │  Dashboard  │
│   Migrate   │                         │  /dashboard │
│  (init job) │                         │  (static)   │
└─────────────┘                         └─────────────┘
```

### Build Pipeline

Multi-stage Dockerfile:

1. **Builder:** `npm ci --ignore-scripts` → `prisma generate` → `nest build`
2. **Runner:** Copies `dist/`, `node_modules/`, `prisma/`, `dashboard/`
3. **Security:** Runs as non-root `appuser`, includes `HEALTHCHECK`

### Startup Order

1. PostgreSQL starts
2. Redis starts
3. `prisma-migrate` runs `prisma migrate deploy` then exits
4. `api` starts (depends on both postgres and redis via `prisma-migrate`)

---

## Production Hardening

| Feature | Implementation |
|---|---|
| **Graceful shutdown** | `app.enableShutdownHooks()` — clean Prisma/Redis disconnect on SIGTERM |
| **Log levels** | Production: `error`, `warn`, `log` only |
| **Non-root container** | Docker `appuser` with minimal permissions |
| **Health check** | `GET /health` endpoint + Docker `HEALTHCHECK` |
| **CORS** | Configurable via `CORS_ORIGIN` env variable |
| **Validation** | Global `ValidationPipe` with whitelist/forbid/transform |
| **Error handling** | `PrismaExceptionFilter` + `TransformInterceptor` |
| **Inactive user filtering** | Workers skip `isActive: false` users |
| **Redis memory limits** | `maxmemory 256mb` with `allkeys-lru` eviction |
| **Service restarts** | `restart: unless-stopped` on all services |

For full deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).
