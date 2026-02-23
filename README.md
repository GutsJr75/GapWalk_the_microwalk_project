# GapWalk

**Turn short gaps in your busy schedule into quick, healthy walks.**

GapWalk is a privacy-first health intervention app that analyzes your calendar, identifies free windows throughout your day, and sends smart nudges to encourage regular micro-walks. No account required — all core functionality works entirely on-device.

Available on **iOS** and **Android**.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Screens & User Flow](#screens--user-flow)
- [Gap Detection Algorithm](#gap-detection-algorithm)
- [Walk Tracking](#walk-tracking)
- [Notification System](#notification-system)
- [Offline-First Design](#offline-first-design)
- [Backend (Research Layer)](#backend-research-layer)
- [Permissions](#permissions)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Building for Production](#building-for-production)
- [End-to-End Tests](#end-to-end-tests)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [License](#license)

---

## Overview

GapWalk is a **behavior-change mobile application** designed around the concept of _micro-walks_: short, 5–15 minute walks taken during natural gaps between meetings and tasks. It was built as a research-grade health intervention tool for studying how intelligent, context-aware nudging affects physical activity in knowledge workers.

The app works by:

1. Ingesting your calendar (via ICS, Google Calendar, or manual entry)
2. Running a gap detection algorithm to identify the best walking opportunities
3. Scheduling local push notifications with actionable buttons
4. Tracking GPS distance, step counts, and time during each walk
5. Aggregating data to show streaks, weekly stats, and goal progress

---

## Features

- **Smart gap detection** — algorithm scores candidate windows by size, time of day, and proximity to meetings
- **Multiple schedule sources** — ICS file import, Google Calendar OAuth, or manual weekly entry
- **Live walk tracking** — GPS route map, hardware pedometer, distance, timer, pause/resume
- **Idle detection** — auto-pauses if you stop moving for more than 30 seconds
- **Session recovery** — checkpoints every 30 seconds; recovers automatically if the app is force-killed mid-walk
- **Granular preferences** — 9+ user-configurable settings (daily targets, quiet hours, preferred walking periods, strictness mode, and more)
- **Achievements & streaks** — milestone badges and consecutive active day tracking
- **Dark and light themes** — user-selectable, persists across sessions
- **Bilingual** — full English and Spanish support
- **Fully offline** — no account, no network required for core functionality
- **Optional cloud backend** — bidirectional sync for research data collection (opt-in)

---

## Architecture

GapWalk follows a **layered, offline-first architecture** split into a React Native mobile client and an optional NestJS research backend.

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile Client                        │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Screens │  │ Zustand  │  │     Repositories     │  │
│  │  (React  │─▶│  Store   │─▶│  (SQLite via expo-   │  │
│  │  Native) │  │          │  │   sqlite, on-device) │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
│        │                               │                │
│  ┌─────▼──────────────────────────┐    │                │
│  │          Core Libraries        │    │                │
│  │  gapEngine · notifications     │◀───┘                │
│  │  scheduleSync · walkCheckpoint │                     │
│  │  statsUtils · permissions      │                     │
│  └────────────────────────────────┘                     │
│                    │  (optional sync)                   │
└────────────────────│────────────────────────────────────┘
                     │ HTTPS / JWT (Auth0)
┌────────────────────▼────────────────────────────────────┐
│                  Research Backend                       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  NestJS  │  │ Prisma   │  │ BullMQ   │              │
│  │  REST    │─▶│ ORM      │  │ Workers  │              │
│  │  API     │  │          │  │          │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│        │            │              │                    │
│  ┌─────▼────┐  ┌────▼─────┐  ┌────▼─────┐             │
│  │  Auth0   │  │PostgreSQL│  │  Redis   │             │
│  │  (RS256) │  │    16    │  │    7     │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Architectural Decisions

| Decision                  | Rationale                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| **Offline-first**         | App works without internet; sync is optional and additive                                |
| **SQLite on-device**      | Fast local reads, no data leaves device by default                                       |
| **Zustand (not Redux)**   | Minimal boilerplate; state slices map directly to UI concerns                            |
| **Expo managed workflow** | Faster iteration; EAS builds for production                                              |
| **NestJS backend**        | Modular, decorator-based — mirrors domain model cleanly                                  |
| **Prisma ORM**            | Type-safe queries, auto-generated migrations                                             |
| **BullMQ workers**        | Async nudge generation, push sending, and stats aggregation decoupled from request cycle |
| **Last-write-wins sync**  | Simple, deterministic conflict resolution for offline-first bidirectional sync           |
| **Auth0 (RS256 JWKS)**    | Stateless JWT verification; no session storage needed on server                          |

---

## Tech Stack

### Mobile (Frontend)

| Layer            | Technology                              |
| ---------------- | --------------------------------------- |
| Framework        | Expo 54 + React Native 0.81.5           |
| Language         | TypeScript 5.9 (strict mode)            |
| Navigation       | React Navigation — Native Stack         |
| State Management | Zustand                                 |
| Local Database   | expo-sqlite                             |
| Notifications    | expo-notifications                      |
| Maps             | react-native-maps + expo-location       |
| Step Counting    | expo-sensors (Pedometer API)            |
| Date/Time        | date-fns 3.x                            |
| Charts/Visuals   | react-native-svg + expo-linear-gradient |
| Build System     | Expo EAS + Metro bundler                |
| E2E Tests        | Maestro                                 |

### Backend (Research Layer)

| Layer             | Technology                   |
| ----------------- | ---------------------------- |
| Framework         | NestJS 11                    |
| Language          | TypeScript 5.7 (strict mode) |
| ORM               | Prisma 7.4                   |
| Database          | PostgreSQL 16                |
| Queue / Workers   | Redis 7 + BullMQ             |
| Authentication    | Auth0 (RS256 JWT via JWKS)   |
| Push Delivery     | Expo Server SDK              |
| API Documentation | Swagger / OpenAPI 3          |
| Containerization  | Docker + Docker Compose      |

---

## Project Structure

```
GapWalk/
├── App.tsx                        # Root: navigation stack, notification handlers, app init
├── app.json                       # Expo config (name, slug, icons, permissions)
├── eas.json                       # EAS build profiles (dev / preview / production)
├── .env.example                   # Required environment variables
│
├── src/
│   ├── screens/                   # All application screens
│   │   ├── IntroScreen            # Onboarding landing page
│   │   ├── ScheduleSetupScreen    # Choose schedule import method
│   │   ├── ManualScheduleScreen   # Create/edit recurring weekly schedule
│   │   ├── PreferencesScreen      # Configure 9+ user settings
│   │   ├── DashboardScreen        # Main hub: stats, plans, achievements
│   │   ├── WalkingScreen          # Active walk: map, pedometer, timer
│   │   ├── SettingsScreen         # Theme, language, data reset
│   │   ├── ScheduleOverviewScreen # All planned walking opportunities
│   │   └── WeeklyDataScreen       # Aggregated weekly statistics
│   │
│   ├── components/                # Reusable UI components
│   │   ├── Button, Card, Modal
│   │   ├── StatCard, StreakCard
│   │   ├── PlanItem, AchievementCard
│   │   └── MapErrorBoundary       # Graceful map failure handling
│   │
│   ├── lib/
│   │   ├── gapEngine.ts           # Core gap detection & nudge plan generation
│   │   ├── notifications.ts       # Scheduling, permissions, action callbacks
│   │   ├── scheduleSync.ts        # Rebuild plans after schedule changes
│   │   ├── walkCheckpoint.ts      # Persist in-progress session every ~30s
│   │   ├── permissions.ts         # Centralized permission request helpers
│   │   ├── statsUtils.ts          # Streak, adherence, weekly aggregation
│   │   ├── time.ts                # Quiet-hour checks and time window helpers
│   │   ├── types.ts               # Core types and preference defaults
│   │   └── repositories/          # SQLite data access layer (8 repositories)
│   │       ├── preferencesRepo
│   │       ├── nudgePlanRepo
│   │       ├── walkSessionRepo
│   │       ├── busyEventRepo
│   │       ├── manualScheduleRepo
│   │       ├── analyticsRepo
│   │       ├── achievementRepo
│   │       └── walkCheckpointRepo
│   │
│   ├── store/                     # Zustand global state
│   │   └── index.ts               # Prefs, stats, walk session, permissions, theme, language
│   │
│   └── theme/                     # Color palettes, typography, dark/light tokens
│
├── assets/
│   └── icon.png                   # App icon (2048×2048)
│
├── android/                       # Native Android project (Gradle)
├── ios/                           # Native iOS project (Xcode)
│
├── backend/                       # NestJS research backend (optional)
│   ├── src/
│   │   ├── modules/               # 18 NestJS feature modules
│   │   │   ├── auth               # Auth0 JWT strategy + auto-registration
│   │   │   ├── users              # Profile management
│   │   │   ├── devices            # Expo push token tracking
│   │   │   ├── preferences        # Settings CRUD
│   │   │   ├── schedule           # ICS / Google Calendar import
│   │   │   ├── manual-schedule    # Template → busy event generation
│   │   │   ├── nudge-engine       # Server-side gap algorithm (mirrors frontend)
│   │   │   ├── nudge-plans        # Plan lifecycle management
│   │   │   ├── walk-sessions      # Recording completed sessions
│   │   │   ├── push-notifications # Expo push delivery & receipt checking
│   │   │   ├── sync               # Bidirectional offline-first sync
│   │   │   ├── analytics          # Event ingestion & aggregation
│   │   │   ├── behavior-log       # Nudge response tracking
│   │   │   ├── researcher         # Study management & data export
│   │   │   └── workers            # BullMQ background jobs
│   │   └── main.ts
│   └── prisma/
│       └── schema.prisma          # 16 Prisma models
│
└── e2e/
    └── maestro/                   # End-to-end test flows
        ├── onboarding-manual.yaml
        ├── onboarding-import.yaml
        └── notification-actions.yaml
```

---

## Screens & User Flow

```
IntroScreen
    └── ScheduleSetupScreen
            ├── (ICS import)   ──────────────┐
            ├── (Google Calendar OAuth) ──────┤
            └── ManualScheduleScreen ─────────┤
                                              ▼
                                    PreferencesScreen
                                              │
                                              ▼
                                    DashboardScreen ◀─────────────┐
                                    ├── WalkingScreen             │
                                    ├── ScheduleOverviewScreen    │
                                    ├── WeeklyDataScreen          │
                                    └── SettingsScreen ───────────┘
```

---

## Gap Detection Algorithm

`src/lib/gapEngine.ts` is the core of GapWalk. It takes a set of busy events and user preferences, then generates a prioritized list of nudge plans for the day.

**Steps:**

1. **Sort busy events** by start time for the target date.
2. **Identify free windows** — time between consecutive events (and before the first / after the last event of the day).
3. **Apply filters:**
   - Window must be ≥ `minWalkMinutes` (default: 6 min)
   - Window must fall within `preferredWalkingPeriods` (e.g., 9 am–5 pm)
   - Window must not overlap with `quietHours` (default: 11 pm–6 am)
   - Apply `bufferMinutes` breathing room after each event ends
4. **Score each window** by:
   - Gap duration relative to daily target
   - Time-of-day preference weight
   - Proximity to upcoming high-priority meetings
5. **Rank and cap** — sort by score descending, cap at `maxDailyNotifications` (default: 2).
6. **Return nudge plans** — each plan carries a scheduled notification time based on the `notificationTiming` preference (at gap start, 5 min before, or deferred to next gap).

---

## Walk Tracking

During an active walk (`WalkingScreen`), the app:

- **GPS tracking** — polls `expo-location` for position updates; computes incremental distance using the Haversine formula and smooths noisy readings.
- **Step counting** — subscribes to the device hardware pedometer via `expo-sensors`. Falls back to GPS-based step estimation if the sensor is unavailable.
- **Timer** — counts elapsed time with pause/resume support.
- **Idle detection** — automatically pauses if speed drops below 0.65 m/s for more than 30 consecutive seconds.
- **Session checkpointing** — serializes the current walk state to SQLite every ~30 seconds so the session survives a force-kill.
- **Session recovery** — on next app launch, if an incomplete checkpoint exists, the app resumes and saves the session.
- **Map rendering** — live dark-themed route with polyline overlay (requires Google Maps API key on Android; Apple Maps on iOS requires no key).

---

## Notification System

Notifications are scheduled locally via `expo-notifications` — no server required.

**Action buttons on each notification:**

- `Start now` — launches the walk immediately
- `Maybe later` — marks the plan as skipped and schedules the next available gap
- `Pause` / `Resume` / `End Walk` — in-walk controls accessible from the notification shade

**Notification timing modes** (user-configurable):
| Mode | Behavior |
|---|---|
| `now` | Notify at the exact start of the gap |
| `delay` | Notify X minutes before the gap (configurable lead time) |
| `next_gap` | Defer to the next available gap if current one passes |

**Suppression rules:**

- Daily walking target already met
- Step goal already reached
- Quiet hours active
- Minimum gap between notifications not elapsed (default: 60 min)

---

## Offline-First Design

GapWalk is designed to function completely without a network connection.

| Concern             | Approach                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Persistent storage  | expo-sqlite (on-device SQLite) — never requires a server                                   |
| Notifications       | expo-notifications — scheduled locally                                                     |
| Plan generation     | `gapEngine.ts` runs entirely on-device                                                     |
| Walk tracking       | GPS + pedometer — no external APIs                                                         |
| Sync                | Optional — when available, sends changes since `lastSyncedAt`; server returns merged state |
| Conflict resolution | Last-write-wins on all synced entities                                                     |

---

## Backend (Research Layer)

The optional NestJS backend enables research use cases: behavior logging, push notification delivery at scale, cross-device sync, study enrollment, and aggregate analytics.

**Key backend capabilities:**

- Bidirectional sync (`POST /sync`) — client sends local delta; server returns merged state + 7-day nudge plan
- Behavior logging — records nudge reception, walk start, completion, and skip events
- Background workers (BullMQ):
  - `nudge-generation` — recalculates daily plans for all active users
  - `push-send` — dispatches Expo push notifications in batches
  - `receipt-check` — verifies delivery receipts from Expo push service
  - `aggregation` — computes daily/weekly stats rollups
- Research endpoints — study enrollment, anonymized cohort exports
- Swagger UI at `/docs`

**Backend data model (PostgreSQL, 16 Prisma models):**
Users · Devices · Preferences · BusyEvents · ManualScheduleEntries · NudgePlans · WalkSessions · ScheduleSources · AnalyticsEvents · CrashReports · BehaviorLogs · DailyAggregation · WeeklyAggregation · PushLogs · Studies · StudyEnrollments

---

## Permissions

| Permission             | Platform      | Purpose                                      |
| ---------------------- | ------------- | -------------------------------------------- |
| Location (When In Use) | iOS & Android | GPS tracking and route visualization         |
| Background Location    | Android       | Continue tracking if app moves to background |
| Notifications          | iOS & Android | Deliver walk reminders at scheduled times    |
| Activity Recognition   | Android       | Access hardware step counter (pedometer)     |

All permissions are optional. The app degrades gracefully:

- **No location** → timer-only walk tracking, no map
- **No notifications** → user initiates walks manually from the dashboard
- **No activity recognition** → GPS-based step estimation

**iOS Privacy Strings** (`app.json`):

- `NSLocationWhenInUseUsageDescription` — explains location use to Apple reviewers
- `UIBackgroundModes: location` — declared for background GPS

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo`)
- Android Studio (for Android) or Xcode 15+ (for iOS, Mac only)

### Install & Run

```bash
npm install
npm run android   # Android emulator / connected device
npm run ios       # iOS simulator (Mac only)
npm run start     # Expo dev server (scan QR with Expo Go)
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable                           | Required | Purpose                              |
| ---------------------------------- | -------- | ------------------------------------ |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`  | Optional | Live map on walk screen (Android)    |
| `GOOGLE_MAPS_API_KEY`              | Optional | Same key — used at native build time |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Optional | Google Calendar OAuth integration    |

Without a Maps API key, the walking screen falls back to a simplified UI. Walk tracking (GPS distance, steps, time) continues to work normally.

---

## Building for Production

### iOS (App Store)

```bash
eas build --platform=ios --profile=production
```

Requires an Apple Developer account and valid provisioning profiles configured in `eas.json`.

### Android (Google Play / APK)

```bash
eas build --platform=android --profile=production
# or local APK:
cd android && ./gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

### Backend (Docker)

```bash
cd backend
docker compose up -d
```

Starts PostgreSQL 16, Redis 7, runs Prisma migrations, and launches the API on port 3000.

---

## End-to-End Tests

Tests use [Maestro](https://maestro.mobile.dev/):

```bash
maestro test e2e/maestro/onboarding-manual.yaml
maestro test e2e/maestro/onboarding-import.yaml
maestro test e2e/maestro/notification-actions.yaml
```

---

## Troubleshooting

**Notifications not appearing**
Verify notification permission is granted, no quiet hours are active, and there are upcoming plans on the dashboard. Test on a physical device (simulators have limited notification support).

**Map shows a fallback view**
Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in your `.env` and `GOOGLE_MAPS_API_KEY` in `android/gradle.properties`, then rebuild. On iOS, Apple Maps works without an API key.

**Step count stays at 0**
Grant Activity Recognition permission. If the device has no hardware step sensor, the app automatically uses GPS-based estimation (works outdoors with location permission).

**Database corruption / stale state**
Uninstall and reinstall the app for a clean SQLite database.

---

## Privacy

GapWalk is designed with a privacy-first philosophy:

- **No account required** — the app works entirely offline with no sign-in
- **Data stays on device** — calendar events, walk history, and preferences are stored in a local SQLite database and never leave the device unless the user explicitly enables cloud sync
- **No advertising or tracking** — the app contains no analytics SDKs, ad networks, or third-party tracking
- **Minimal permissions** — permissions are requested only when the relevant feature is used, with clear in-app explanations
- **Optional sync** — the research backend is opt-in; users who do not enable it share no data externally

---

## License

MIT
