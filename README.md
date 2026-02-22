# GapWalk

Turn short gaps in your busy schedule into quick, healthy walks.

GapWalk analyzes your calendar, finds free windows, and nudges you to take a walk at the right time. No account needed — everything stays on your device.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Android Studio (for Android builds) or Xcode (for iOS)

### Install & Run

```bash
npm install
npm run android   # Android emulator / connected device
npm run ios       # iOS simulator (Mac only)
```

### Build a Release APK

```bash
cd android
./gradlew assembleRelease
```

The APK will be at `android/app/build/outputs/apk/release/app-release.apk`.

### Environment Variables (Optional)

Copy `.env.example` to `.env` and fill in the values you need:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Show Google Maps on the walking screen (Android) |
| `GOOGLE_MAPS_API_KEY` | Same key — used at native build time |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Calendar OAuth (optional) |

Without a Maps key the walking screen still tracks your walk — it just shows a fallback instead of a live map.

---

## How It Works

### 1. Set Your Schedule

Import an `.ics` file, enter your schedule manually, or connect Google Calendar. GapWalk uses your busy times to find free gaps.

### 2. Configure Preferences

| Setting | What it does |
|---|---|
| **Daily Target** | Minutes of walking you want per day |
| **Notification Count** | Max nudges per day |
| **Quiet Hours** | No notifications during these hours |
| **When to Notify** | At gap start, or 5/10 min before |
| **Buffer Minutes** | Breathing room before a walk starts |
| **Min Walk Minutes** | Shortest walk worth scheduling |
| **Preferred Walking Periods** | Only schedule walks during these windows |
| **Strictness Mode** | *Easygoing* = gentle reminders; *No Excuses* = more direct, motivating nudges |
| **Step Goal** | Optional step target — suppresses nudges once reached |

Every preference is respected throughout the notification scheduling, plan generation, and walk tracking flow.

### 3. Get Nudged & Walk

GapWalk schedules local notifications for your best walking windows. Tap **Start now** to begin, or **Maybe later** to skip. During a walk you get:

- Live GPS map with your route
- Real-time step counting (hardware pedometer with GPS fallback)
- Distance and time tracking
- Pause / resume controls
- Idle detection (auto-pauses if you stop moving)

### 4. Track Progress

The dashboard shows:

- **Quick Status** — daily minutes, notification count, step goal (live-updated)
- **Streak** — consecutive active days
- **Weekly Stats** — total minutes, steps, active days
- **Walking Opportunities** — upcoming scheduled gaps with times and actions

---

## Project Structure

```
GapWalk/
├── App.tsx                    # Navigation, notification handlers, app init
├── src/
│   ├── components/            # Reusable UI (Button, Card, Modal, StatCard …)
│   ├── screens/               # All app screens
│   │   ├── IntroScreen        # Onboarding landing
│   │   ├── ScheduleSetupScreen
│   │   ├── ManualScheduleScreen
│   │   ├── PreferencesScreen
│   │   ├── DashboardScreen    # Main hub
│   │   ├── WalkingScreen      # Walk tracker (map, pedometer, timer)
│   │   ├── SettingsScreen
│   │   └── WeeklyDataScreen
│   ├── lib/
│   │   ├── gapEngine.ts       # Gap detection & plan generation
│   │   ├── notifications.ts   # Notification scheduling & permissions
│   │   ├── permissions.ts     # Centralized permission requests
│   │   ├── scheduleSync.ts    # Rebuilds plans after changes
│   │   ├── types.ts           # Core types & defaults
│   │   ├── time.ts            # Time/quiet-hour helpers
│   │   ├── statsUtils.ts      # Streak & weekly stat calculations
│   │   └── repositories/      # SQLite data access layer
│   ├── store/                 # Zustand state (prefs, stats, permissions)
│   └── theme/                 # Colors, typography, dark/light palettes
├── assets/
│   └── icon.png               # App icon (2048×2048)
├── android/                   # Native Android project
├── backend/                   # NestJS backend (optional — app works offline)
└── e2e/                       # Maestro end-to-end tests
```

---

## Permissions

On first launch / after onboarding the app requests:

| Permission | Why |
|---|---|
| **Location** | Track walking distance and show route on map |
| **Notifications** | Send walk reminders at the right time |
| **Activity Recognition** | Real-time step counting via device pedometer |

All permissions are optional — the app degrades gracefully (timer-only mode, no map, no nudges).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo 54 + React Native |
| Language | TypeScript |
| Navigation | React Navigation (Native Stack) |
| State | Zustand |
| Database | expo-sqlite (local, on-device) |
| Notifications | expo-notifications |
| Location | expo-location + react-native-maps |
| Step Counting | expo-sensors (Pedometer API) |
| Date Logic | date-fns |

---

## Troubleshooting

**Notifications not appearing** — Make sure notification permission is granted, quiet hours aren't active, and there are upcoming plans on the dashboard. Test on a physical device.

**Map shows fallback** — Set `GOOGLE_MAPS_API_KEY` in `android/gradle.properties` and rebuild. On iOS, Apple Maps works without a key.

**Steps stay at 0** — Grant the Activity Recognition permission. If the device lacks a step sensor, the app falls back to GPS-based estimation (requires walking outdoors).

**Database issues** — Uninstall and reinstall the app for a clean slate.

---

## License

MIT
