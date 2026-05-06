# Maestro E2E Flows

These flows cover the production-critical onboarding and notification paths:

- `onboarding-manual.yaml`
- `onboarding-import.yaml`
- `notification-actions.yaml`
- `manage-schedule-exit.yaml`

## Prerequisites

1. Install Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. Build and install a dev client with E2E hooks enabled:
   - Android: `npm run android:e2e`
3. Start Metro in E2E mode:
   - `npm run start:e2e`

## Run Flows

- Manual onboarding: `npm run e2e:maestro:manual`
- Import onboarding: `npm run e2e:maestro:import`
- Manage schedule exit flow: `npm run e2e:maestro:manage`
- Notification actions: `npm run e2e:maestro:notifications`
- All flows: `npm run e2e:maestro:all`

## Notes

- These flows assume `EXPO_PUBLIC_E2E=1` so E2E-only buttons are visible.
- `notification-actions.yaml` validates both "start walk" and "skip gap" action paths plus telemetry snapshot visibility.
