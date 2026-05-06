# GapWalk Play Store Release Checklist

## Build

- Build Android production artifacts with `eas build --platform android --profile production`.
- For local EAS production builds, run `GOOGLE_SERVICES_JSON="$PWD/google-services.json" eas build -p android --profile production --local --clear-cache`.
- Confirm `google-services.json` and `GOOGLE_MAPS_API_KEY` or `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` are available to the production build.
- Confirm any Google Maps API key Android app restrictions include the Play App Signing SHA-1 from Play Console for `com.gapwalk.app`; upload and local debug SHA-1 fingerprints are not enough for the version installed from Google Play.
- Confirm the release signing SHA-1 is registered in the same Firebase/Google project as `google-services.json`. The current local upload key SHA-1 is `F9:10:8B:9B:40:1A:FB:E9:23:0D:C5:A5:D5:9C:7F:BC:CD:59:76:F9`.
- If running a manual local Gradle release build, copy `android/local.properties.example` to `android/local.properties`, fill `GOOGLE_MAPS_API_KEY` plus all `GAPWALK_RELEASE_*` values, then run `./gradlew bundleRelease`.
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
