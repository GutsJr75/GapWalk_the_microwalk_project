# GapWalk Play Store Release Checklist

## Build

- Build Android production artifacts with `eas build --platform android --profile production`.
- Confirm `google-services.json` and `GOOGLE_MAPS_API_KEY` are available to the production build.
- If running a local release build, set all `GAPWALK_RELEASE_*` signing variables before `./gradlew assembleRelease`.
- Increment both `app.json` and `android/app/build.gradle` `versionCode` values before every Play upload.

## Play Console Declarations

- Background location declaration:
  GapWalk uses location in the background, when the app is not in use, only during an active walk so distance can keep updating if the user locks the screen or switches apps.
- Privacy policy:
  Publish the current `docs/privacy.html` wording to the public privacy policy URL before release.
- Demo video:
  Record a short video showing an active walk, the in-app background-location disclosure, the Android runtime prompt, and distance tracking continuing after the app is backgrounded.
- Data Safety / permissions:
  Keep answers aligned with the shipped permission set: notifications, activity recognition, foreground location, background location during active walks, and optional account/sync data.

## Smoke Checks

- Fresh install: onboarding requests notifications and activity recognition without requesting background location.
- Start a walk, tap the in-app background-location upgrade flow, and verify the disclosure appears before the Android background-location prompt.
- Deny background location and verify the walk still runs with foreground tracking plus a settings recovery path.
- Grant background location, reboot the phone, and verify future reminders recover without opening the app.
- Change timezone or device time and verify future reminder times are re-seeded correctly.
- Revoke exact-alarm capability and verify the reminder flow still falls back to local Expo scheduling.

## Final Review

- Check the merged release manifest for the intended permission set only.
- Confirm the production AAB is signed for Play App Signing.
- Run Play pre-launch report and verify the walk start, reminder tap, and active-walk flows do not crash.
