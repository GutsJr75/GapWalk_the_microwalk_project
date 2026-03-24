# GapWalk Backend - User & Feature Guide

> For app users, study participants, and anyone wanting to understand what GapWalk does and how it works.

---

## Table of Contents

1. [What is GapWalk?](#1-what-is-gapwalk)
2. [How It Works - Step by Step](#2-how-it-works--step-by-step)
3. [Features Overview](#3-features-overview)
4. [Setting Up Your Schedule](#4-setting-up-your-schedule)
5. [How Nudge Notifications Work](#5-how-nudge-notifications-work)
6. [Walking Sessions](#6-walking-sessions)
7. [Preferences & Customization](#7-preferences--customization)
8. [Achievements & Progress](#8-achievements--progress)
9. [Offline Support & Sync](#9-offline-support--sync)
10. [Researcher Dashboard](#10-researcher-dashboard)
11. [Privacy & Data](#11-privacy--data)
12. [FAQ](#12-faq)

---

## 1. What is GapWalk?

**GapWalk** is a micro-walk research intervention platform. It analyzes your daily schedule to find free gaps in your day and sends you gentle nudge notifications encouraging short walks (typically 6–15 minutes). The goal is to help you build a sustainable walking habit by fitting micro-walks into your existing routine - not by asking you to carve out separate exercise time.

### Key Principles

- **Schedule-aware**: GapWalk only suggests walks during genuinely free times
- **Non-intrusive**: Respects quiet hours, buffer times, and your notification preferences
- **Offline-first**: The app works fully offline; data syncs when connectivity returns
- **Research-backed**: Built for academic research studies with full data export capabilities

---

## 2. How It Works - Step by Step

```
1. IMPORT YOUR SCHEDULE
   ↓ Upload ICS file, connect Google Calendar, or manually enter your weekly routine
   
2. GAP ENGINE ANALYZES
   ↓ Finds free windows between your busy events
   ↓ Scores gaps by time of day, duration, and your preferences
   
3. NUDGE PLANS GENERATED
   ↓ Creates optimal walk windows with suggested durations
   ↓ Distributes your daily walking target across available gaps
   
4. NOTIFICATION SENT
   ↓ Push notification arrives when your walk window opens
   ↓ "🚶 Time for a walk! Your 8-minute micro-walk is scheduled now."
   
5. YOU WALK (or skip)
   ↓ Tap the notification to start tracking your walk
   ↓ GPS tracks your route, steps, distance, and calories
   
6. PROGRESS TRACKED
   ↓ Daily and weekly statistics aggregated automatically
   ↓ Achievements unlock as you build consistency
```

---

## 3. Features Overview

| Feature | Description |
|---|---|
| **Schedule Import** | Import from ICS files, Google Calendar, or create a manual weekly template |
| **Gap Detection** | Intelligent algorithm finds usable free time between events |
| **Smart Nudging** | Personalized notification timing based on your preferences |
| **Walk Tracking** | GPS route recording, step counting, distance, calories, and pause tracking |
| **Offline Mode** | Full offline functionality with bidirectional sync |
| **Daily Goals** | Configurable daily walking target in minutes |
| **Quiet Hours** | No notifications during sleep or designated quiet periods |
| **Achievements** | Milestone badges for streaks, total walks, and more |
| **Research Mode** | Study enrollment, data export, and researcher dashboard |
| **Multi-device** | Register multiple devices for push notification delivery |

---

## 4. Setting Up Your Schedule

GapWalk needs to know when you're **busy** so it can find gaps for walking. You can set up your schedule in three ways:

### Option A: ICS File Import

Upload a `.ics` calendar file exported from any calendar app (Apple Calendar, Outlook, etc.). Events are parsed and stored as busy blocks.

### Option B: Google Calendar

Connect your Google Calendar account. GapWalk reads your events to identify busy times. (Requires Google OAuth consent.)

### Option C: Manual Weekly Template

Create a weekly recurring schedule by entering your regular commitments:

| Field | Description | Example |
|---|---|---|
| **Title** | Name of the busy block | "Work", "School", "Gym" |
| **Day of Week** | 0 (Sunday) through 6 (Saturday) | 1 = Monday |
| **Start Time** | `HH:MM` 24-hour format | `09:00` |
| **End Time** | `HH:MM` 24-hour format | `17:00` |
| **One-time** | Override for a single date | Optional |

The manual template is expanded **14 days forward** into concrete busy events whenever you save changes.

### Switching Schedule Sources

You can change your schedule source at any time. When you switch, old events from the previous source are replaced with new ones.

---

## 5. How Nudge Notifications Work

### The Gap Engine

Every day at **06:00 AM**, the server runs the Gap Engine for every active user:

1. **Reads your busy events** for today and tomorrow
2. **Finds free gaps** between events (accounting for buffer time)
3. **Filters out quiet hours** - no walks during sleep time
4. **Scores each gap** - prefers work hours (8 AM–5 PM), lunch windows (11 AM–2 PM), and ideal durations (8–15 minutes)
5. **Allocates notifications** - distributes your daily notification budget across the best-scored gaps
6. **Creates walk plans** - each plan has a specific `walkStart` time and suggested duration

### Notification Delivery

When a walk plan's start time arrives, the server sends a push notification to all your registered devices:

```
🚶 Your 10:05 AM walk
Walk o'clock. 8 minutes is all it takes - let's go!
```

The notification includes two quick actions:
- **Start Walk** - opens the app and begins tracking
- **Skip** - dismisses the nudge

### Notification Variants

To keep things fresh, GapWalk rotates through 6 different notification body messages daily:

- "It's time! Head out for a X-min walk. Your body will thank you."
- "Walk o'clock. X minutes is all it takes - let's go!"
- "Step outside for X min. A little movement goes a long way."
- "Your X-min walking window is open. Time to move!"
- "Fresh air awaits. X-min walk starts now."
- "A X-min walk is the reset your day needs. Let's do it!"

### Plan Status Lifecycle

```
planned → notified → started → completed ✅
                              → skipped   ⏭️
                              → cancelled  ✖️
```

| Status | Meaning |
|---|---|
| `planned` | Walk window generated, notification not yet sent |
| `notified` | Push notification delivered to your device |
| `started` | You tapped "Start Walk" |
| `completed` | Walk session finished successfully |
| `skipped` | You chose to skip this walk |
| `cancelled` | Plan was cancelled (e.g., regenerated or dismissed) |

---

## 6. Walking Sessions

### Starting a Walk

You can start a walk in two ways:
1. **Tap a nudge notification** - opens the app linked to the specific nudge plan
2. **Manual start** - open the app and start an organic walk (not linked to a nudge)

### What Gets Tracked

| Metric | Description |
|---|---|
| **Duration** | Total time from start to end |
| **Active Time** | Time actually moving (excludes pauses) |
| **Paused Time** | Total time spent paused |
| **Steps** | From device pedometer (when available) |
| **Distance** | GPS-derived walking distance in meters |
| **Calories** | Estimated calories burned |
| **Speed** | Average and max speed |
| **Route** | GPS breadcrumb trail (recorded every ~5 seconds) |

### Pausing

You can pause a walk at any time. Pauses can be:
- **Manual** - you tap the pause button
- **Automatic** - the app detects you've stopped moving

Each pause records the reason (e.g., traffic light, phone call) and duration.

### Session Recovery

If the app is killed mid-walk (e.g., phone dies, OS kills it), GapWalk attempts to recover the session when you reopen the app. Recovered sessions are flagged with `wasRecovered = true`.

---

## 7. Preferences & Customization

All preferences are fully customizable from the app:

| Setting | Default | Description |
|---|---|---|
| **Daily Target Minutes** | 15 | How many minutes of walking you want per day |
| **Buffer Minutes** | 2 | Padding before/after busy events (don't start right at gap boundary) |
| **Notifications Per Day** | 2 | Maximum number of nudge notifications |
| **Notification Min Gap** | 60 min | Minimum time between consecutive notifications |
| **Quiet Hours Start** | 23:00 | No notifications after this time |
| **Quiet Hours End** | 06:00 | No notifications before this time |
| **Min Walk Minutes** | 6 | Minimum gap duration to be considered for a walk |
| **Grace Period** | 2 min | Extra buffer at the start of a gap |
| **When to Notify** | `delay` | `now` (immediately), `delay` (after a few minutes), or `next_gap` |
| **Notify Delay** | 5 min | Minutes to wait before sending notification (when `delay` is selected) |
| **Strictness Mode** | `easygoing` | `easygoing` = gentle, `no_excuses` = aggressive nudging |
| **Step Goal** | 1000 | Optional daily step target |
| **Preferred Walking Periods** | - | Optional time windows you prefer for walking |

### How Preferences Affect the Engine

- **Daily Target** determines total walking minutes the engine tries to distribute
- **Notifications Per Day** limits how many nudges you'll receive (sustainability guard)
- **Min Walk Minutes** sets the minimum gap size the engine considers
- **Quiet Hours** creates a hard blackout window - no notifications, no walk plans
- **Buffer** ensures you're never told to walk the instant a meeting ends

---

## 8. Achievements & Progress

### Achievements

GapWalk tracks milestones and unlocks achievement badges:

| Example Achievement | Trigger |
|---|---|
| `first_walk` | Complete your first walk |
| `3_day_streak` | Walk 3 days in a row |
| `7_day_streak` | Walk 7 days in a row |
| `total_30_min` | Accumulate 30 minutes of walking |
| `total_100_min` | Accumulate 100 minutes of walking |

Achievements are computed on-device and synced to the server.

### Daily & Weekly Aggregations

The server automatically computes your statistics:

**Daily (computed at 02:00 AM):**
- Total active minutes, steps, distance, calories
- Number of walk sessions
- Nudges planned, delivered, opened, skipped
- Whether you reached your daily goal

**Weekly (computed Monday at 03:00 AM):**
- Totals for the week (minutes, steps, distance)
- Days active (how many days you walked)
- Adherence rate (days goal reached / 7)

---

## 9. Offline Support & Sync

### How Offline Mode Works

GapWalk is designed **offline-first**. The mobile app uses a local SQLite database as the primary data store. Everything works without an internet connection:

- Schedule management
- Gap engine computation (local fallback)
- Walk session tracking
- Achievement unlocking

### How Sync Works

When you have internet connectivity, the app syncs with the server via `POST /api/sync`:

1. **App sends** all data changed since the last sync
2. **Server merges** using last-write-wins for preferences and schedule, deduplication by `localId` for events and sessions
3. **Server returns** its latest state since the last sync
4. **App updates** its local database with server changes

### Merge Rules

| Data Type | Strategy |
|---|---|
| Schedule source & preferences | Last-write-wins (latest update kept) |
| Busy events | Append-only, deduplicated by `localId` |
| Manual schedule entries | Full replace on each sync |
| Nudge plans | Upsert by `localId`, status updated if exists |
| Walk sessions | Append-only, deduplicated by `localId` |
| Analytics & crash reports | Always appended (write-only from client) |
| Achievements | Upsert (device is source of truth) |

---

## 10. Researcher Dashboard

### Accessing the Dashboard

The researcher dashboard is available at `/dashboard` on the server. It requires a JWT token with `researcher` or `admin` role.

### Dashboard Features

| Feature | Description |
|---|---|
| **Overview Cards** | Total users, sessions, minutes walked, steps, plans, active studies |
| **Daily Activity Chart** | Bar chart of walking activity over the last 30 days |
| **Nudge Adherence** | Doughnut chart showing planned/completed/skipped/cancelled breakdown |
| **Leaderboard** | Top walkers ranked by total minutes |

### Study Management

Researchers can:
- **Create studies** with name, description, date range, and configuration
- **Enroll participants** by user ID
- **Withdraw participants** (preserves data, marks as withdrawn)
- **Export all study data** - walk sessions, nudge plans, behavior logs, aggregations
- **View per-participant summaries** - totals for sessions, minutes, steps, nudge adherence

---

## 11. Privacy & Data

### What Data is Collected

| Data Category | What | Why |
|---|---|---|
| **Schedule** | Event titles, start/end times | To find free gaps for walking |
| **Walk Sessions** | Duration, steps, distance, calories | To track progress and compute aggregations |
| **GPS Routes** | Latitude, longitude, accuracy, speed | To map walk routes (optional, can disable location) |
| **Device Info** | Push token, platform, app version | To deliver push notifications |
| **Analytics** | Screen views, feature usage events | To understand app usage patterns |
| **Crash Reports** | Error messages, stack traces | To fix bugs |
| **Behavior Logs** | Nudge received/opened/dismissed events | To measure nudge effectiveness |

### Data Retention

- All data is stored in PostgreSQL on the server
- Walk route points are high-volume (~720 rows per 1-hour walk)
- No data is shared with third parties
- Researchers can only access data for participants enrolled in their studies

### User Control

- Users can update their profile and preferences at any time
- Device push tokens can be deactivated
- Inactive users are excluded from nudge generation and aggregation processing

---

## 12. FAQ

### Q: How many notifications will I get per day?

By default, 2 per day. You can change this in Preferences → Notifications Per Day (range: 1–10). The engine also applies a "sustainability guard" - it won't schedule more notifications than your daily walking goal can reasonably support.

### Q: What happens if I don't have any free time today?

If the gap engine can't find any valid free windows (after accounting for buffer times, quiet hours, and minimum walk duration), no nudge plans are generated and you won't receive any notifications.

### Q: Can I walk without a nudge notification?

Yes! You can start an organic walk anytime. It will be recorded as a regular walk session but won't be linked to a nudge plan. These organic walks still count toward your daily goal.

### Q: What if I lose internet connection?

The app works fully offline. Your walks, schedule changes, and preferences are stored locally and will sync to the server when you're back online.

### Q: How accurate is step counting?

Step accuracy depends on your device's pedometer sensor. The app reports the step source (`sensor`, `gps_fallback`, or `none`) so you know how steps were counted.

### Q: Can I participate in a research study?

Yes - a researcher can enroll you in a study using your user ID. You'll continue using the app normally; your data will be included in the study's exports.

### Q: How do I stop receiving notifications?

You can:
1. Set **Notifications Per Day** to 0 in preferences
2. Set **Quiet Hours** to cover the entire day
3. Deactivate your device push token
4. Disable notifications at the OS level

### Q: What timezone does GapWalk use?

GapWalk uses your configured timezone (default: `America/New_York`). All day boundaries, quiet hours, and schedule expansions are computed in your local timezone. You can change this in your profile settings.
