# GapWalk API Reference

> Base URL: `http://localhost:3000/api`
>
> Interactive docs: `http://localhost:3000/docs` (Swagger UI)

All authenticated endpoints require: `Authorization: Bearer <JWT>`

`today`/`yesterday` semantics use the authenticated user's timezone (`users.timezone`, default `America/New_York`).

All successful responses are wrapped by the global `TransformInterceptor`:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

---

## Table of Contents

- [Health & Root](#health--root)
- [Users](#users)
- [Devices](#devices)
- [Preferences](#preferences)
- [Schedule](#schedule)
- [Manual Schedule](#manual-schedule)
- [Nudge Plans](#nudge-plans)
- [Walk Sessions](#walk-sessions)
- [Sync](#sync)
- [Analytics](#analytics)
- [Behavior Log](#behavior-log)
- [Error Codes](#error-codes)
- [Data Types & Enums](#data-types--enums)

---

## Health & Root

### `GET /health`

Health check (no auth required, not rate-limited). Reports HTTP liveness plus
PostgreSQL and Redis connectivity. Returns **200** when all checks pass and
**503** when any dependency is down (so orchestrators/Docker treat a degraded
instance as unhealthy).

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-02-17T12:00:00.000Z",
  "checks": { "database": "up", "redis": "up" }
}
```

When degraded, `status` is `"degraded"`, the failing check reads `"down"`, and the HTTP status is `503`.

### `GET /api`

Returns hello world (no auth required).

---

## Users

### `GET /api/users/me`

Get the authenticated user's profile, including preferences, schedule source, and active devices.

**Auth:** JWT (any role)

**Response:**

```json
{
  "id": "uuid",
  "firebaseUid": "firebase-uid-123",
  "email": "user@example.com",
  "displayName": "Jane",
  "role": "user",
  "timezone": "America/New_York",
  "isActive": true,
  "lastSyncedAt": "2026-02-17T00:00:00.000Z",
  "preferences": { ... },
  "scheduleSource": { ... },
  "devices": [ ... ],
  "profile": { ... }
}
```

### `PATCH /api/users/me`

Update current user base info. `role` cannot be set through this endpoint (it is
managed server-side only).

**Auth:** JWT

**Body:**

```json
{
  "displayName": "Jane Doe",
  "timezone": "Europe/Berlin",
  "email": "jane@example.com"
}
```

### `POST /api/users/me/profile`

Upsert the optional personalization profile (used for tailoring suggestions).

**Auth:** JWT

**Body (all fields optional):**

```json
{
  "ageGroup": "25-34",
  "biologicalSex": "prefer_not_to_say",
  "heightCm": 175,
  "weightKg": 70,
  "occupationType": "sedentary_desk",
  "selfReportedActivityLevel": "lightly_active",
  "referralSource": "app_store",
  "locale": "en-US"
}
```

### `DELETE /api/users/me`

Permanently delete the authenticated user and **all** associated data
(GDPR hard delete): devices, preferences, schedule sources, busy events, manual
schedule entries, nudge plans, walk sessions/routes/pauses, analytics events,
crash reports, behavior logs, app sessions, achievements, aggregations, push
logs, and gap opportunities. Runs in a single transaction.

**Auth:** JWT

**Response:** `204 No Content`

---

## Devices

### `POST /api/devices`

Register or update (upsert) an Expo push token. Unique on `(userId, expoPushToken)`.

**Auth:** JWT

**Body:**

```json
{
  "expoPushToken": "ExponentPushToken[xxx]",
  "platform": "android",
  "appVersion": "1.2.0"
}
```

### `GET /api/devices`

List active devices for the current user.

**Auth:** JWT

---

## Preferences

### `GET /api/preferences`

Get preferences for the current user. Creates defaults on first call.

**Auth:** JWT

**Response:**

```json
{
  "id": "uuid",
  "userId": "uuid",
  "dailyTargetMinutes": 15,
  "bufferMinutes": 2,
  "notificationCountPerDay": 2,
  "notificationMinGapMinutes": 60,
  "quietHoursStart": "23:00",
  "quietHoursEnd": "06:00",
  "minWalkMinutes": 6,
  "gracePeriodMinutes": 2,
  "whenToNotify": "delay",
  "notifyDelayMinutes": 5,
  "strictnessMode": "easygoing",
  "stepGoalEnabled": false,
  "stepGoal": 1000
}
```

### `PUT /api/preferences`

Update user preferences (upsert).

**Auth:** JWT

**Body:** Any subset of the preference fields above.

---

## Schedule

### `GET /api/schedule/source`

Get the user's schedule source configuration.

**Auth:** JWT

### `PUT /api/schedule/source`

Set the schedule source type.

**Auth:** JWT

**Body:**

```json
{
  "type": "ics",
  "filename": "calendar.ics"
}
```

### `DELETE /api/schedule/source`

Clear the schedule source and optionally all associated events.

**Auth:** JWT

### `GET /api/schedule/events`

Query busy events. Filterable by date range and source.

**Auth:** JWT

**Query params:** `startDate`, `endDate`, `source` (ics | manual | google)

### `POST /api/schedule/events`

Create a single busy event.

**Auth:** JWT

**Body:**

```json
{
  "title": "Team standup",
  "start": "2026-02-17T09:00:00.000Z",
  "endTime": "2026-02-17T09:30:00.000Z",
  "source": "ics",
  "isAllDay": false,
  "localId": "client-uuid-123"
}
```

### `POST /api/schedule/events/bulk`

Bulk create busy events.

**Auth:** JWT

**Body:**

```json
{
  "events": [ { ... }, { ... } ]
}
```

### `DELETE /api/schedule/events/source/:source`

Delete all events from a specific source (e.g. `ics`, `manual`, `google`).

**Auth:** JWT

### `DELETE /api/schedule/events`

Delete all busy events for the current user.

**Auth:** JWT

---

## Manual Schedule

### `GET /api/manual-schedule`

Get all weekly manual schedule entries.

**Auth:** JWT

### `POST /api/manual-schedule`

Create a single manual schedule entry.

**Auth:** JWT

**Body:**

```json
{
  "title": "Morning commute",
  "dayOfWeek": 1,
  "startTime": "08:00",
  "endTime": "09:00",
  "isOneTime": false
}
```

### `POST /api/manual-schedule/bulk`

Replace all manual schedule entries (full save).

**Auth:** JWT

**Body:**

```json
{
  "entries": [ { ... }, { ... } ]
}
```

### `POST /api/manual-schedule/generate-events`

Generate busy events from the weekly template for the next 4 weeks, anchored to the user's timezone.

**Auth:** JWT

### `DELETE /api/manual-schedule`

Delete all manual schedule entries.

**Auth:** JWT

---

## Nudge Plans

### `GET /api/nudge-plans`

Query nudge plans for the current user.

**Auth:** JWT

**Query params:** `date` (yyyy-MM-dd), `status` (NudgePlanStatus)

### `GET /api/nudge-plans/today`

Get all nudge plans for today in the user's timezone.

**Auth:** JWT

### `GET /api/nudge-plans/upcoming`

Get upcoming plans with status `planned` or `notified`.

**Auth:** JWT

### `GET /api/nudge-plans/:id`

Get a nudge plan by UUID.

**Auth:** JWT

### `POST /api/nudge-plans`

Create a nudge plan (client-generated local fallback upload).

**Auth:** JWT

**Body:**

```json
{
  "localId": "client-uuid",
  "date": "2026-02-17",
  "gapStart": "2026-02-17T10:00:00.000Z",
  "gapEnd": "2026-02-17T11:00:00.000Z",
  "walkStart": "2026-02-17T10:05:00.000Z",
  "suggestedDurationMinutes": 8,
  "origin": "local_fallback"
}
```

### `POST /api/nudge-plans/generate`

Server-side nudge plan generation for today + tomorrow in the user's timezone. Cancels stale plans then runs the gap engine.

**Auth:** JWT

### `PATCH /api/nudge-plans/:id/status`

Update a nudge plan's status.

**Auth:** JWT

**Body:**

```json
{
  "status": "started",
  "reason": "User tapped notification"
}
```

Valid transitions: `planned → notified → started → completed/skipped/cancelled`

### `POST /api/nudge-plans/:id/notified`

Mark a plan as notified (transition from `planned`).

**Auth:** JWT

### `POST /api/nudge-plans/:id/skip`

Skip an entire gap window - cancels all `planned`/`notified` plans in the same gap.

**Auth:** JWT

### `POST /api/nudge-plans/:id/can-start`

Check whether the user can start another walk (based on daily goal completion).

**Auth:** JWT

**Response:**

```json
{
  "allowed": true,
  "planExists": true
}
```

---

## Walk Sessions

### `POST /api/walk-sessions`

Record a completed walk session. If linked to a nudge plan (via `nudgePlanId`), that plan's status is auto-set to `completed`.

**Auth:** JWT

**Body:**

```json
{
  "nudgePlanId": "uuid-or-null",
  "localId": "client-uuid",
  "start": "2026-02-17T10:05:00.000Z",
  "endTime": "2026-02-17T10:13:00.000Z",
  "activeSeconds": 480,
  "pausedSeconds": 0,
  "steps": 820,
  "distanceMeters": 650.5,
  "calories": 32.1,
  "usedLocation": true
}
```

### `GET /api/walk-sessions`

Query walk sessions. Filterable by date range.

**Auth:** JWT

**Query params:** `startDate`, `endDate`

### `GET /api/walk-sessions/today`

Get today's walk sessions in the user's timezone.

**Auth:** JWT

### `GET /api/walk-sessions/today/stats`

Aggregate today's walking statistics in the user's timezone.

**Auth:** JWT

**Response:**

```json
{
  "sessionCount": 2,
  "totalMinutes": 12,
  "totalSteps": 1560,
  "totalDistanceMeters": 1200.5,
  "totalCalories": 48.3
}
```

### `GET /api/walk-sessions/all`

Get all walk sessions for the current user.

**Auth:** JWT

---

## Sync

### `POST /api/sync`

Full bidirectional offline-first sync. Client sends all changes since last sync; server merges using **last-write-wins** and returns updated server state.

**Auth:** JWT

**Body:**

```json
{
  "lastSyncedAt": "2026-02-16T23:00:00.000Z",
  "scheduleSource": { "type": "manual" },
  "preferences": { "dailyTargetMinutes": 20 },
  "busyEvents": [ ... ],
  "manualScheduleEntries": [ ... ],
  "nudgePlans": [ ... ],
  "walkSessions": [ ... ],
  "analyticsEvents": [ ... ],
  "crashReports": [ ... ]
}
```

**Response:**

```json
{
  "scheduleSource": { ... },
  "preferences": { ... },
  "busyEvents": [ ... ],
  "manualScheduleEntries": [ ... ],
  "nudgePlans": [ ... ],
  "walkSessions": [ ... ],
  "syncedAt": "2026-02-17T12:00:00.000Z"
}
```

**Merge strategy:**

| Data             | Client → Server             | Server → Client                     |
| ---------------- | --------------------------- | ----------------------------------- |
| Schedule source  | Upsert                      | Return current                      |
| Preferences      | Upsert                      | Return current                      |
| Busy events      | Append (dedup by `localId`) | Return new since `lastSyncedAt`     |
| Manual entries   | Full replace                | Return all                          |
| Nudge plans      | Upsert by `localId`         | Return updated since `lastSyncedAt` |
| Walk sessions    | Append (dedup by `localId`) | Return new since `lastSyncedAt`     |
| Analytics events | Always append               | -                                   |
| Crash reports    | Always append               | -                                   |

---

## Analytics

### `POST /api/analytics/events`

Track a single analytics event.

**Auth:** JWT

**Body:**

```json
{
  "name": "screen_view",
  "payload": { "screen": "DashboardScreen" },
  "clientCreatedAt": "2026-02-17T10:00:00.000Z"
}
```

### `POST /api/analytics/events/bulk`

Batch upload analytics events.

**Auth:** JWT

**Body:**

```json
{
  "events": [
    { "name": "walk_completed", "payload": { "minutes": 8 } },
    { "name": "nudge_tapped" }
  ]
}
```

### `POST /api/analytics/crashes`

Report a crash.

**Auth:** JWT

**Body:**

```json
{
  "message": "TypeError: Cannot read property 'x' of undefined",
  "stack": "at ...",
  "isFatal": false,
  "context": { "screen": "WalkingScreen" },
  "clientCreatedAt": "2026-02-17T10:00:00.000Z"
}
```

### `POST /api/analytics/crashes/bulk`

Batch upload crash reports.

**Auth:** JWT

### `GET /api/analytics/daily`

Get the current user's daily aggregations.

**Auth:** JWT

**Query params:** `date`, `startDate`, `endDate` (always scoped to the caller)

### `GET /api/analytics/weekly`

Get the current user's weekly aggregations.

**Auth:** JWT

**Query params:** `weekStart`, `startDate`, `endDate` (always scoped to the caller)

### `POST /api/analytics/aggregate/daily`

Trigger daily aggregation computation for the current user.

**Auth:** JWT

**Body:**

```json
{ "date": "2026-02-16" }
```

### `POST /api/analytics/aggregate/weekly`

Trigger weekly aggregation computation.

**Auth:** JWT

**Body:**

```json
{ "weekStart": "2026-02-10" }
```

---

## Behavior Log

### `POST /api/behavior-log`

Log a single behavior event.

**Auth:** JWT

**Body:**

```json
{
  "nudgePlanId": "uuid-or-null",
  "eventType": "nudge_opened",
  "payload": { "source": "notification_tap" },
  "clientTimestamp": "2026-02-17T10:00:00.000Z"
}
```

### `POST /api/behavior-log/bulk`

Batch upload behavior logs.

**Auth:** JWT

**Body:**

```json
{
  "logs": [
    { "eventType": "nudge_received", "clientTimestamp": "..." },
    {
      "eventType": "walk_started",
      "nudgePlanId": "...",
      "clientTimestamp": "..."
    }
  ]
}
```

Behavior logs are write-only from the client; there are no client-facing query
endpoints. They are consumed internally for product analytics.

---

## Error Codes

The `PrismaExceptionFilter` maps database errors to HTTP responses:

| Prisma Code | HTTP Status     | Meaning                          |
| ----------- | --------------- | -------------------------------- |
| `P2002`     | 409 Conflict    | Unique constraint violation      |
| `P2025`     | 404 Not Found   | Record not found                 |
| `P2003`     | 400 Bad Request | Foreign key constraint violation |
| `P2014`     | 400 Bad Request | Required relation violation      |

Validation errors return `400` with field-level details from `class-validator`.

---

## Data Types & Enums

### UserRole

| Value   | Description                                    |
| ------- | ---------------------------------------------- |
| `user`  | Standard app user (default)                    |
| `admin` | Reserved for internal tooling (assigned server-side) |

### ScheduleSourceType

`ics` | `manual` | `google`

### WhenToNotify

| Value      | Description                                    |
| ---------- | ---------------------------------------------- |
| `now`      | Notify immediately when gap starts             |
| `delay`    | Notify after `notifyDelayMinutes` into the gap |
| `next_gap` | Delay notification to next gap                 |

### StrictnessMode

| Value        | Description        |
| ------------ | ------------------ |
| `easygoing`  | Relaxed nudging    |
| `no_excuses` | Aggressive nudging |

### NudgePlanStatus

```
planned → notified → started → completed
                              → skipped
                              → cancelled
```

### NudgePlanOrigin

| Value            | Description                       |
| ---------------- | --------------------------------- |
| `server`         | Generated by backend nudge engine |
| `local_fallback` | Generated on-device when offline  |

### BehaviorEventType

| Value              | When logged                          |
| ------------------ | ------------------------------------ |
| `nudge_received`   | Push notification received by device |
| `nudge_opened`     | User tapped the notification         |
| `nudge_dismissed`  | User dismissed the notification      |
| `nudge_expired`    | Notification expired without action  |
| `walk_started`     | Walk session began                   |
| `walk_completed`   | Walk session completed               |
| `walk_paused`      | Walk paused mid-session              |
| `walk_resumed`     | Walk resumed after pause             |
| `walk_cancelled`   | Walk cancelled before completion     |
| `app_opened`       | App brought to foreground            |
| `app_backgrounded` | App sent to background               |

### PushStatus

`queued` → `sent` → `delivered` | `failed` | `device_not_registered`
