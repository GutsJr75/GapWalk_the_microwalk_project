# GapWalk Production Data Verification Checklist

Step-by-step guide to verify every data flow works end-to-end from the real app
on a device to the production database at `http://136.115.63.96:3000`.

**Prerequisites**
- A physical or emulated Android/iOS device with GapWalk installed (production build)
- Access to the production database (Prisma Studio or `psql`)
- A terminal with `TEST_AUTH_TOKEN` obtained from the device (see §0)

---

## § 0 - Get a Test Auth Token

1. Log into GapWalk on the device.
2. Open the app's dev logs **or** use a reverse proxy (e.g. `mitmproxy`) to capture
   the `Authorization: Bearer eyJ…` header on any authenticated API call.
3. Alternatively, capture a bearer token from app network logs after logging in with Firebase Authentication.
4. Export for the automated tests:
   ```bash
   export TEST_AUTH_TOKEN=eyJ...
   export TEST_API_URL=http://136.115.63.96:3000
   ```

---

## § 1 - Fresh Install → Onboarding

**Steps**
1. Uninstall and reinstall GapWalk.
2. Log in with a test account.
3. Complete onboarding: enter a schedule (manual entry), set walking preferences,
   and allow notification permissions.

**Expected DB rows (verify after sync)**

| Table | What to check |
|---|---|
| `User` | Row exists with `firebaseUid` matching the token `sub` |
| `Preference` | Row for this userId with `dailyTargetMinutes` matching onboarding input |
| `ScheduleSource` | Row for this userId with `type = 'manual'` |
| `ManualScheduleEntry` | Rows matching the entries entered during onboarding |
| `Device` | Row with `expoPushToken` and `platform` (requires notification permission granted) |

**SQL snippets**
```sql
SELECT * FROM "User" ORDER BY created_at DESC LIMIT 5;
SELECT * FROM "Preference" WHERE user_id = '<userId>';
SELECT * FROM "ScheduleSource" WHERE user_id = '<userId>';
SELECT * FROM "ManualScheduleEntry" WHERE user_id = '<userId>';
SELECT * FROM "Device" WHERE user_id = '<userId>';
```

---

## § 2 - Manual Schedule → Busy Events

**Steps**
1. Open **Manage Schedule** and add or edit busy blocks.
2. Background the app and wait for a sync (or force sync by re-foregrounding).

**Expected DB rows**

| Table | What to check |
|---|---|
| `ManualScheduleEntry` | Rows replaced to match the new schedule |
| `BusyEvent` | New rows appended for any busy blocks generated from the manual schedule |

**SQL**
```sql
SELECT * FROM "ManualScheduleEntry" WHERE user_id = '<userId>' ORDER BY day_of_week;
SELECT * FROM "BusyEvent" WHERE user_id = '<userId>' ORDER BY start DESC LIMIT 20;
```

---

## § 3 - Start and Complete a Walk

**Steps**
1. From the Dashboard, tap **Start Walk** on a nudge plan.
2. Walk for at least 2 minutes, pause once, then end the walk.

**Expected DB rows**

| Table | What to check |
|---|---|
| `WalkSession` | 1 new row with `active_seconds > 0` |
| `WalkPauseEvent` | 1 new row linked to the WalkSession |
| `WalkRoutePoint` | ≥ 1 row (if location permission was granted) |
| `NudgePlan` | Status updated to `completed` |
| `AnalyticsEvent` | Events for `walk_started`, `walk_ended`, `nudge_action_start` |

**SQL**
```sql
SELECT id, active_seconds, distance_meters, steps FROM "WalkSession"
  WHERE user_id = '<userId>' ORDER BY start DESC LIMIT 3;
SELECT * FROM "WalkPauseEvent" WHERE walk_session_id = '<walkSessionId>';
SELECT COUNT(*) FROM "WalkRoutePoint" WHERE walk_session_id = '<walkSessionId>';
SELECT status FROM "NudgePlan" WHERE id = '<planId>';
SELECT name, created_at FROM "AnalyticsEvent"
  WHERE user_id = '<userId>' ORDER BY created_at DESC LIMIT 10;
```

---

## § 4 - Check Achievements

**Steps**
1. Complete your first walk (triggers `first_walk` achievement).
2. Open the **Achievements** screen.
3. Force a sync.

**Expected DB rows**

| Table | What to check |
|---|---|
| `UserAchievement` | Row with `achievement_id = 'first_walk'` and `unlocked_at` set |

**SQL**
```sql
SELECT * FROM "UserAchievement" WHERE user_id = '<userId>';
```

---

## § 5 - Analytics Events (Screen Views, Button Taps)

**Steps**
1. Navigate to **Weekly Data** and **Achievements** screens.
2. Force a sync.

**Expected DB rows**

| Table | What to check |
|---|---|
| `AnalyticsEvent` | Rows with `name = 'screen_view'` for `WeeklyData` and `Achievements` |

**SQL**
```sql
SELECT name, payload, created_at FROM "AnalyticsEvent"
  WHERE user_id = '<userId>' ORDER BY created_at DESC LIMIT 20;
```

---

## § 6 - Crash Recovery and AppSession

**Steps**
1. Start a walk.
2. Force-kill the app mid-walk (swipe away from the app switcher).
3. Reopen the app - it should offer to recover the interrupted walk.
4. Accept recovery, then complete and end the walk.

**Expected DB rows**

| Table | What to check |
|---|---|
| `WalkSession` | Row with `was_recovered = true` |
| `CrashReport` | Row (if the force-kill triggered a crash report) |
| `AppSession` | Row for the new app session with `source = 'cold_start'` and `session_end` set |

**SQL**
```sql
SELECT id, was_recovered, active_seconds FROM "WalkSession"
  WHERE user_id = '<userId>' AND was_recovered = true ORDER BY start DESC LIMIT 3;
SELECT message, is_fatal, created_at FROM "CrashReport"
  WHERE user_id = '<userId>' ORDER BY created_at DESC LIMIT 5;
SELECT session_start, session_end, source FROM "AppSession"
  WHERE user_id = '<userId>' ORDER BY session_start DESC LIMIT 5;
```

---

## § 7 - Device Registration

**Steps**
1. Grant notification permissions during onboarding (if not already granted).
2. Check the `Device` table immediately after the app bootstraps.

**Expected DB rows**

| Table | What to check |
|---|---|
| `Device` | Row with `expo_push_token` and `platform` (`ios` or `android`) |
| `Device` | `notification_permission_granted = true` |

**SQL**
```sql
SELECT expo_push_token, platform, notification_permission_granted,
       device_model, app_version, last_seen_at
FROM "Device" WHERE user_id = '<userId>';
```

---

## § 8 - Full Row-Count Audit (All 23 Tables)

Run this after completing §§ 1–7 above. Every table should have at least one row
for the test user (or globally for backend-only tables).

```sql
-- Per-user tables (replace <userId>)
SELECT 'User'                  AS tbl, COUNT(*) FROM "User"                  WHERE id = '<userId>'
UNION ALL
SELECT 'Preference',                   COUNT(*) FROM "Preference"             WHERE user_id = '<userId>'
UNION ALL
SELECT 'ScheduleSource',               COUNT(*) FROM "ScheduleSource"         WHERE user_id = '<userId>'
UNION ALL
SELECT 'ManualScheduleEntry',          COUNT(*) FROM "ManualScheduleEntry"    WHERE user_id = '<userId>'
UNION ALL
SELECT 'BusyEvent',                    COUNT(*) FROM "BusyEvent"              WHERE user_id = '<userId>'
UNION ALL
SELECT 'NudgePlan',                    COUNT(*) FROM "NudgePlan"              WHERE user_id = '<userId>'
UNION ALL
SELECT 'WalkSession',                  COUNT(*) FROM "WalkSession"            WHERE user_id = '<userId>'
UNION ALL
SELECT 'WalkPauseEvent',               COUNT(*) FROM "WalkPauseEvent"         WHERE walk_session_id IN (SELECT id FROM "WalkSession" WHERE user_id = '<userId>')
UNION ALL
SELECT 'WalkRoutePoint',               COUNT(*) FROM "WalkRoutePoint"         WHERE walk_session_id IN (SELECT id FROM "WalkSession" WHERE user_id = '<userId>')
UNION ALL
SELECT 'AnalyticsEvent',               COUNT(*) FROM "AnalyticsEvent"         WHERE user_id = '<userId>'
UNION ALL
SELECT 'CrashReport',                  COUNT(*) FROM "CrashReport"            WHERE user_id = '<userId>'
UNION ALL
SELECT 'UserAchievement',              COUNT(*) FROM "UserAchievement"        WHERE user_id = '<userId>'
UNION ALL
SELECT 'AppSession',                   COUNT(*) FROM "AppSession"             WHERE user_id = '<userId>'
UNION ALL
SELECT 'Device',                       COUNT(*) FROM "Device"                 WHERE user_id = '<userId>'
UNION ALL
SELECT 'BehaviorLog',                  COUNT(*) FROM "BehaviorLog"            WHERE user_id = '<userId>'
UNION ALL
SELECT 'UserProfile',                  COUNT(*) FROM "UserProfile"            WHERE user_id = '<userId>'

-- Backend-only / shared tables (global counts)
UNION ALL
SELECT 'Study',                        COUNT(*) FROM "Study"
UNION ALL
SELECT 'StudyEnrollment',              COUNT(*) FROM "StudyEnrollment"
UNION ALL
SELECT 'PushLog',                      COUNT(*) FROM "PushLog"
UNION ALL
SELECT 'GapOpportunity',               COUNT(*) FROM "GapOpportunity"
UNION ALL
SELECT 'ResearcherAction',             COUNT(*) FROM "ResearcherAction"
UNION ALL
SELECT 'DailyAnalyticsSummary',        COUNT(*) FROM "DailyAnalyticsSummary"
UNION ALL
SELECT 'WeeklyAnalyticsSummary',       COUNT(*) FROM "WeeklyAnalyticsSummary"
ORDER BY 1;
```

**Pass criteria:** every row in the result should show `count >= 1`.
Any zero count indicates a broken data path that must be investigated before
the study goes live.

---

## § 9 - Run the Automated E2E Tests

```bash
cd backend
TEST_AUTH_TOKEN=eyJ... \
TEST_API_URL=http://136.115.63.96:3000 \
npx jest --config test/jest-e2e.json test/data-flow.e2e-spec.ts --verbose
```

All tests should pass (`✓`). Failures indicate either a missing endpoint, a
validation schema mismatch, or a sync gap that was not fixed.

---

## Sign-off

| Check | Verified by | Date |
|---|---|---|
| §1 Fresh install + onboarding | | |
| §2 Manual schedule + busy events | | |
| §3 Walk session + pause + route | | |
| §4 Achievements | | |
| §5 Analytics events | | |
| §6 Crash recovery + AppSession | | |
| §7 Device registration | | |
| §8 All 23 tables have rows | | |
| §9 Automated e2e tests pass | | |
