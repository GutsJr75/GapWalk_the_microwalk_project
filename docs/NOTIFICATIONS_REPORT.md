# GapWalk Notification System — Analysis & Bug Report

**Author:** Claude (analysis)
**Date:** 2026-04-20
**Scope:** End-to-end review of the push / local notification pipeline, plus root-cause analysis of two production bugs.
**Status:** P0 fixes landed (see §7). §4 and §5 describe the bugs *as they were*; §7 tracks what has been patched vs what's still open.

---

## 0. Changelog

| Date | Change |
|---|---|
| 2026-04-20 | Initial analysis + report |
| 2026-04-20 | P0 fixes implemented: device cleanup on register, atomic claim in `sendDueNudges`, token/ticket alignment in `sendWalkNudge`, client-side dedupe of local two-phase walk notifications on server `walk_nudge` receipt/response. See §7. |

---

## 1. Architecture at a glance

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Expo RN)                          │
│                                                                    │
│  IntroScreen ── onAuthenticated ──► registerCurrentDeviceFor...    │
│                                        │                           │
│                                        ▼                           │
│                    Notifications.getExpoPushTokenAsync()           │
│                                        │                           │
│                                        ▼                           │
│                          POST /api/devices  ──────────────┐        │
│                                                           │        │
│   notificationService (src/services/notifications.ts)     │        │
│   ├─ setNotificationHandler (foreground gating)           │        │
│   ├─ schedulePlanNotifications (local, 3 per plan)        │        │
│   │   • walk-alert:<planId>                               │        │
│   │   • walk-ready:<planId>                               │        │
│   │   • walk-missed:<planId>                              │        │
│   └─ recovery + dedupe sets                               │        │
│                                                           │        │
│   App.tsx listeners:                                      │        │
│   ├─ addNotificationResponseListener                      │        │
│   ├─ addNotificationReceivedListener                      │        │
│   └─ androidExactNotifications.subscribe* (Android only)  │        │
└───────────────────────────────────────────────────────────┼────────┘
                                                            │
                                                            ▼
┌───────────────────────────────────────────────────────────┴────────┐
│                       BACKEND (NestJS)                             │
│                                                                    │
│   DevicesService.register  → upsert(userId, expoPushToken)         │
│                                                                    │
│   BullMQ scheduler (workers.service.ts)                            │
│   ├─ daily-nudge-generation         06:00 daily                    │
│   ├─ send-due-nudges                * * * * *   (EVERY MINUTE)     │
│   ├─ receipt-check                  */15 * * * *                   │
│   └─ daily-aggregation / weekly                                    │
│                                                                    │
│   PushSendProcessor ── sendDueNudges() ── sendWalkNudge()          │
│       │                                                            │
│       ├─ devicesService.getActiveTokens(userId)  ← ALL isActive    │
│       ├─ expo.chunkPushNotifications              ← 100/chunk      │
│       └─ expo.sendPushNotificationsAsync(chunk)                    │
└────────────────────────────────────────────────────────────────────┘
```

**Key libs**

| Layer | Library | Role |
|---|---|---|
| Client | `expo-notifications` | local schedule, listeners, foreground handler |
| Client | Custom `androidExactNotifications` native module | exact-alarm fallback for Android 13+ (plugins/) |
| Backend | `expo-server-sdk` | push dispatch to Expo push service |
| Backend | `@nestjs/bullmq` + Redis | cron scheduler + job queue |
| DB | Prisma `Device`, `NudgePlan`, `PushLog` | state |

---

## 2. Client-side flow

### 2.1 Registration (first install / first login)

Entry points that call `registerCurrentDeviceForNotifications()`:

1. [App.tsx:1339-1342](App.tsx#L1339-L1342) — `IntroScreen.onAuthenticated`
2. [App.tsx:1064-1066](App.tsx#L1064-L1066) — during `initializeApp()` after session restore
3. Anywhere `registerDevice()` in [src/services/backendSync.ts:347](src/services/backendSync.ts#L347) is re-invoked

The function ([src/services/deviceRegistration.ts:15-72](src/services/deviceRegistration.ts#L15-L72)):

1. Gets timezone
2. Checks `isNotificationsSupported` — if false, only PATCHes `/users/me` timezone
3. Calls `Notifications.getExpoPushTokenAsync({ projectId })`
4. If token returned → `POST /api/devices` via `registerDevice(...)`
5. If token fails → falls back to `updateTimezoneFallback()` (⚠️ **silent**, no retry)

### 2.2 Listeners

Set up inside one `useEffect` ([App.tsx:697-819](App.tsx#L697-L819)). Four subscriptions registered every time the callbacks change:

- `responseSubscription` — OS tap events (Expo)
- `receivedSubscription` — foreground delivery (Expo)
- `exactResponseSubscription` — Android custom native module
- `exactDeliverySubscription` — Android custom native module

Plus a one-shot read of `getLastNotificationResponseAsync()` for cold-start taps.

**Dedupe** is handled via in-memory `Set`s on `handledResponseKeysRef`, `handledResponseNotificationIdsRef`, `handledDeliveryIdsRef` plus `authStorage.getLastHandledNotificationKey()` for the cold-start response.

### 2.3 Local scheduling

Per plan, `schedulePlanNotifications` in [src/services/notifications.ts:780-883](src/services/notifications.ts#L780-L883) schedules up to **three** local notifications:

| ID | Trigger | Category | Purpose |
|---|---|---|---|
| `walk-alert:<planId>` | nudge offset before walkStart | — | informational heads-up |
| `walk-ready:<planId>` | walkStart | `WALK_READY_CATEGORY_ID` | Yes / Not Now prompt |
| `walk-missed:<planId>` | gapEnd | — | missed walk |

Foreground handler ([src/services/notifications.ts:111-126](src/services/notifications.ts#L111-L126)) suppresses sound/banner for `walk_session` and `walk_ready` so the app can render an in-app prompt instead.

### 2.4 Recovery & cleanup

- `runScheduledNotificationRecovery` — throttled to 5 min, cancels + reschedules for plans within 48 h, debounced 30 s on digest
- `cleanupPresentedNotifications` — dismisses banners for orphaned / terminal / expired plans on foreground

---

## 3. Backend flow

### 3.1 Cron schedule

[backend/src/workers/workers.service.ts:36-76](backend/src/workers/workers.service.ts#L36-L76):

```ts
await this.pushQueue.upsertJobScheduler(
  'send-due-nudges',
  { pattern: '* * * * *' },              // every minute
  { name: 'send-due-nudges', data: {} },
);
```

### 3.2 `sendDueNudges()` — *patched*

[backend/src/push-notifications/push-notifications.service.ts:150-200](backend/src/push-notifications/push-notifications.service.ts#L150-L200):

```ts
const duePlans = await prisma.nudgePlan.findMany({
  where: {
    status: 'planned',
    walkStart: { lte: now },
    origin: 'server',
    pushSentAt: null,                 // NEW — skip already-claimed plans
  },
});
for (const plan of duePlans) {
  // NEW — atomic claim. If another worker already flipped the status or
  // stamped pushSentAt, count === 0 and we skip without sending.
  const claim = await prisma.nudgePlan.updateMany({
    where: { id: plan.id, status: 'planned', pushSentAt: null },
    data: { status: 'notified', pushSentAt: now },
  });
  if (claim.count === 0) continue;

  await this.sendWalkNudge(plan.userId, plan.id, title, body);
}
```

The claim happens **before** the send, so a worker restart mid-flight or a briefly-doubled cron fire can't produce duplicate pushes. If the subsequent send fails, the plan stays `notified` — we treat a single missed nudge as preferable to a duplicate.

### 3.3 `sendWalkNudge()` — *patched*

[backend/src/push-notifications/push-notifications.service.ts:24-144](backend/src/push-notifications/push-notifications.service.ts#L24-L144):

1. `devicesService.getActiveTokens(userId)` → every `Device` row where `isActive = true` for the user (after the §3.4 cleanup this is now ~1 per physical device).
2. Build `validPairs: { token, message }[]` so token ↔ message pairing is tracked explicitly.
3. Chunk via `expo.chunkPushNotifications()`, and for each chunk walk a `cursor` through `validPairs` — successful tickets and failed-chunk nulls both get pushed into `results` with the **correct** token, so `PushLog` attribution and `DeviceNotRegistered` deactivations can no longer target the wrong token.
4. `firstSuccessTicketId` (the first `status === 'ok'` ticket) is written back to `NudgePlan.pushTicketId` together with `pushSentAt`. The `pushSentAt` write here is idempotent with the one set by the atomic claim in §3.2.

### 3.4 Device lifecycle

- `register` ([backend/src/devices/devices.service.ts:9-64](backend/src/devices/devices.service.ts#L9-L64)) upserts on `(userId, expoPushToken)`, **and** (since the P0 patch at [devices.service.ts:50-61](backend/src/devices/devices.service.ts#L50-L61)) now deactivates any other still-active rows that match `(userId, platform, deviceModel)`. This collapses stale rows from reinstalls / token rotation on the same physical device.
- `deactivate` ([backend/src/devices/devices.service.ts:66-71](backend/src/devices/devices.service.ts#L66-L71)) is also called reactively when Expo returns `DeviceNotRegistered`.
- Receipt check runs every 15 min as a backstop.

---

## 4. Bug A — "first time notifications don't match the device"

> **Status: primary cause patched.** See §7 fix (1).

### Most likely root cause: **stale tokens never get deactivated on re-install / account re-login**

On iOS and Android, the Expo push token can change across:

- Re-install
- App update that triggers token rotation
- Switch to a different build channel (dev/preview/prod)
- Restoring a user account on a **different** physical device

The backend never cleans up. `registerCurrentDeviceForNotifications` only **upserts** the new row; the old row stays `isActive = true` until Expo returns `DeviceNotRegistered` — which only happens on the *next* push attempt, and only affects that row 15 min later (receipt check).

Result on first login:

1. User logs in on **Device B** → backend now has two rows: old Device A token (still `isActive`) + new Device B token.
2. Next `send-due-nudges` tick fans out to **both** tokens.
3. Device A gets the push (or it silently fails but still looks "delivered" to APNs/FCM if the token hasn't been invalidated yet). Device B also gets it — but if the user is watching Device B and a family member is holding Device A, it **feels like** the wrong device received it.
4. 15 min later the receipt check finally deactivates the dead token — after which behavior appears normal.

### Contributing factors

| Cause | Evidence |
|---|---|
| No proactive device cleanup on registration | [backend/src/devices/devices.service.ts:9-47](backend/src/devices/devices.service.ts#L9-L47) |
| Registration call fires before permissions are granted in some flows | `registerCurrentDeviceForNotifications` is called at [App.tsx:1339-1342](App.tsx#L1339-L1342) right after `setIsAuthenticated(true)` with no permission check; inside, if the token fetch fails it silently falls back to a PATCH on timezone ([src/services/deviceRegistration.ts:59-71](src/services/deviceRegistration.ts#L59-L71)). |
| Fallback is silent + never retried | Same file — no retry schedule, so if the first call fails the device is **never** registered this session. |
| Expo token is fetched without ensuring the device has an FCM registration (Android) / APNs token (iOS) is ready | There is no `Notifications.getDevicePushTokenAsync` precheck; on cold boot the native token can lag a few seconds. |

---

## 5. Bug B — "sometimes 4 notifications come in at once"

> **Status: all three multipliers mitigated.** See §7 fixes (1), (2), (3). Worst remaining case is one local + one server banner with ≥90 s overlap, not four.

Three independent multipliers stack on top of each other. Any two of them hitting at once gives you 3–4 banners.

### Multiplier 1 — local + server schedule the same event (×2)

At `walkStart` you get **both**:

- The local `walk-ready:<planId>` scheduled by the client ([src/services/notifications.ts:824-845](src/services/notifications.ts#L824-L845))
- The server's `walk_nudge` push dispatched by the `send-due-nudges` cron when `walkStart <= now` ([backend/src/push-notifications/push-notifications.service.ts:128-135](backend/src/push-notifications/push-notifications.service.ts#L128-L135))

There is **no coordination** between the two — the client doesn't suppress its local one if the server is going to send, and the server doesn't check whether the client already scheduled one.

### Multiplier 2 — token fan-out to stale rows on the same device (×N)

Because old device rows are never cleaned up (see Bug A), a user who has reinstalled three times still has 3 active rows. `sendWalkNudge` sends to **all** of them. If the new install happens to share the same FCM/APNs registration under the hood (common on Android after reinstall on the same install-ID), the physical device shows N banners.

### Multiplier 3 — walk-alert + walk-ready land close together

If `nudgePolicy.triggerAt` is within a minute or two of `walkStart`, the client can fire `walk-alert` and `walk-ready` effectively simultaneously. The 60-second guard at [src/services/notifications.ts:806-807](src/services/notifications.ts#L806-L807) only skips the alert if the gap is **< 60 s**, so a 70-second gap produces two banners side by side.

### Why exactly "4"

A realistic worst case during a first-login session:

```
t = walkStart − 2 min   local walk-alert          (1)
t = walkStart           local walk-ready          (2)
t = walkStart           server walk_nudge → old token fan-out (3, 4)
```

That's four banners within ~2 minutes, which matches the reported symptom.

### Additional amplifier: no idempotency in `sendDueNudges`

The status transition isn't atomic with the send:

```ts
await this.sendWalkNudge(...);        // slow (network)
await prisma.nudgePlan.update({...}); // only *after* send returns
```

If two workers pick up the same `send-due-nudges` job (BullMQ is generally safe here, but `upsertJobScheduler` + Redis failover can briefly double-fire), both can observe `status = 'planned'` and both send. Not the primary cause of 4× — but it's a latent duplicate risk that should be closed regardless.

---

## 6. Other issues & anti-patterns

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 1 | `tokens[i] ↔ tickets[i]` alignment assumed after chunk loop; a chunk throw broke the invariant → `PushLog` mis-attribution, wrong-token `deactivate()` calls | [backend/src/push-notifications/push-notifications.service.ts:36-143](backend/src/push-notifications/push-notifications.service.ts#L36-L143) | Medium (data-integrity) | **Fixed** — explicit `{ token, message }` pairing + chunk-level null records |
| 2 | Only the first successful ticket is written back to `NudgePlan.pushTicketId`; devices 2..N are only in `PushLog` | [push-notifications.service.ts:129-141](backend/src/push-notifications/push-notifications.service.ts#L129-L141) | Low | Open — accepted: `NudgePlan` tracks "a" ticket, `PushLog` is the source of truth for per-device |
| 3 | No retry + no backoff on failed chunks | [push-notifications.service.ts:67-87](backend/src/push-notifications/push-notifications.service.ts#L67-L87) | Medium | Open (P1) |
| 4 | `registerDevice` silently swallows failures — no surfaced state for "device not registered" | [src/services/backendSync.ts:366-374](src/services/backendSync.ts#L366-L374) | Medium | Open (P2) |
| 5 | Status update separate from send → not idempotent if worker restarts mid-flight | previously [push-notifications.service.ts:162-172](backend/src/push-notifications/push-notifications.service.ts#L162-L172) | Medium | **Fixed** — atomic claim via `updateMany` guarded by `(status='planned', pushSentAt=null)` |
| 6 | `every-minute` cron is wasteful at scale | [backend/src/workers/workers.service.ts:46-50](backend/src/workers/workers.service.ts#L46-L50) | Low | Open (P2) |
| 7 | Listener `useEffect` depends on callbacks whose identity can change, re-creating all four subscriptions and re-consuming pending Android exact deliveries | [App.tsx:697-819](App.tsx#L697-L819) | Low | Open — existing dedupe sets neutralize user-visible impact |
| 8 | `pushSentAt` column was not used as an idempotency guard | previously [push-notifications.service.ts:104-117](backend/src/push-notifications/push-notifications.service.ts#L104-L117) | Medium | **Fixed** — now part of both the `findMany` filter and the atomic claim |
| 9 | Local two-phase (`walk-alert` + `walk-ready`) fires alongside server `walk_nudge` for the same plan | [notifications.ts:790-845](src/services/notifications.ts#L790-L845) | High (UX) | **Mitigated** — on `walk_nudge` delivery/response the client now cancels + dismisses the local alert/ready for that plan ([App.tsx:692-702](App.tsx#L692-L702), [App.tsx:611-615](App.tsx#L611-L615), [notifications.ts:1073-1088](src/services/notifications.ts#L1073-L1088)) |

---

## 7. Fixes — status

### P0 — stop the duplicate storm  *(all landed 2026-04-20)*

1. **Proactive device cleanup on register.** ✅ In `DevicesService.register`, after upserting the new row, deactivate every other `Device` row for the same user matching `(platform, deviceModel)`. See [backend/src/devices/devices.service.ts:50-61](backend/src/devices/devices.service.ts#L50-L61).
2. **Atomic claim in `sendDueNudges`.** ✅ The `findMany` now filters `pushSentAt: null`, and each plan is claimed with a conditional `updateMany` (`status='planned' AND pushSentAt IS NULL → status='notified', pushSentAt=now`) *before* the send. If another worker claimed it, `count === 0` and we skip. See [push-notifications.service.ts:150-200](backend/src/push-notifications/push-notifications.service.ts#L150-L200).
3. **Client-side dedupe of local walk duplicates when server push arrives.** ✅ New helper `notificationService.clearLocalWalkDuplicates(planId)` cancels + dismisses `walk-alert:<planId>` and `walk-ready:<planId>` (but preserves `walk-missed:<planId>`). Invoked in the received listener ([App.tsx:692-702](App.tsx#L692-L702)) and the response handler ([App.tsx:611-615](App.tsx#L611-L615)) for `type === 'walk_nudge'`.

### P1 — correctness

4. **Token/ticket alignment in `sendWalkNudge`.** ✅ Rewritten to track `{ token, message }` pairs explicitly and walk a cursor through them as chunks resolve. A chunk throw records nulls at the right positions instead of shifting all subsequent tickets onto wrong tokens. See [push-notifications.service.ts:36-143](backend/src/push-notifications/push-notifications.service.ts#L36-L143).
5. **Retry failed chunks** with simple exponential backoff (3 attempts). *Open.*
6. **Don't generate server-side nudges for users with no active devices.** Add `getActiveTokens(userId).length > 0` precheck before the nudge-generation cron enqueues plans. *Open.*

### P2 — hygiene *(all open)*

7. Reduce `send-due-nudges` to every 2 minutes, or early-`return` when `duePlans.length === 0`.
8. `registerCurrentDeviceForNotifications` → return `{ success, reason }` and retry on `AppState.active` if prior attempt failed.
9. Add a stable `deviceId` to `RegisterDeviceDto` and upsert on `(userId, deviceId)` instead of `(userId, expoPushToken)`. Structurally prevents stale-token accumulation — this is the long-term replacement for fix (1).
10. Memoize notification listener setup so subscriptions aren't torn down + rebuilt on every callback identity change.

---

## 8. TL;DR — *post-fix*

- **Bug A (wrong device):** root cause was stale `Device` rows with `isActive=true` surviving reinstalls / token rotation. The backend now collapses them on register by `(platform, deviceModel)`. Fan-out is now ~1 row per physical device.
- **Bug B (4 at once):** root cause was three overlapping nudge sources (local walk-alert + local walk-ready + server walk_nudge) multiplied by stale-token fan-out. Fan-out is gone (fix 1); server-side race between cron ticks is gone (atomic claim, fix 2); local duplicates of an incoming server push are now cancelled + dismissed (fix 3). Worst realistic remaining case is 1 local + 1 server banner during a push-delivery window — not 4.
- **Still open (P1/P2):** chunk retry/backoff, no-device-gate on nudge generation, richer registration status on the client, and the long-term structural fix of swapping the device unique key to `(userId, deviceId)`.
