# GapWalk Device QA Matrix

This matrix is the production gate for notification lifecycle behavior and onboarding clarity.

## Scope

- Platforms: Android, iOS
- App states: foreground, background, killed
- Flows:
  - Onboarding (manual schedule)
  - Onboarding (ICS import preview -> save -> continue)
  - Notification actions (`Start walk`, `Skip this gap`)
  - Completion funnel telemetry (`notification_delivered`, `notification_opened`, `notification_skip_action`, `walk_completed`)

## Required Test Cases

| ID | Platform | Device/OS | App State | Scenario | Pass Criteria |
|---|---|---|---|---|---|
| QA-A1 | Android | Pixel API 34+ | Foreground | Receive walk nudge | In-app listener marks plan `notified`; dashboard count updates |
| QA-A2 | Android | Pixel API 34+ | Background | Tap `Start walk` action | App opens Walking screen with target `planId` |
| QA-A3 | Android | Pixel API 34+ | Background | Tap `Skip this gap` action | Same-gap active plans are skipped/cancelled and next nudges rescheduled |
| QA-A4 | Android | Pixel API 34+ | Killed | Open from notification action | App-level listener handles response on cold start and routes correctly |
| QA-I1 | iOS 17+ | iPhone simulator/device | Foreground | Receive walk nudge | Foreground delivery updates plan status and dashboard stats |
| QA-I2 | iOS 17+ | iPhone simulator/device | Background | Tap `Start walk` action | App opens Walking screen and preserves `planId` |
| QA-I3 | iOS 17+ | iPhone simulator/device | Background | Tap `Skip this gap` action | Gap is skipped and notifications are re-planned |
| QA-I4 | iOS 17+ | iPhone simulator/device | Killed | Open from notification action | Last response recovery handles action after cold launch |
| QA-O1 | Android/iOS | Any | Fresh install | Manual onboarding | Continue path reaches dashboard without dead ends |
| QA-O2 | Android/iOS | Any | Fresh install | Import onboarding | Imported filename + grid preview shown; Continue disabled until Save |
| QA-T1 | Android/iOS | Any | Any | Telemetry snapshot | Event counts increase for delivery/open/skip/completion |

## Execution Commands

1. Build E2E client: `npm run android:e2e` or `npm run ios:e2e`
2. Start app in E2E mode: `npm run start:e2e`
3. Run automation:
   - `npm run e2e:maestro:manual`
   - `npm run e2e:maestro:import`
   - `npm run e2e:maestro:notifications`

## Exit Criteria

- All matrix rows pass on at least:
  - 1 Android emulator/device
  - 1 iOS simulator/device
- No critical onboarding confusion found (file selection clarity + save/continue gating validated)
- Notification actions work consistently in foreground/background/killed states
