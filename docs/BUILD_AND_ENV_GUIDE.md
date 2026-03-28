# Android Build & Environment Variables Guide

This document covers critical gotchas and instructions for building the Android Release APK, specifically related to how Metro/Babel bundles Environment Variables in Expo and React Native.

## 1. Native Android Is Authoritative

GapWalk keeps a checked-in `android/` project and treats it as the source of truth for native Android behavior. `app.json` and `app.config.js` still provide shared Expo metadata and EAS build inputs, but release-critical Android settings must be mirrored in the native project.

That means:

- AndroidManifest changes must be verified in `android/app/src/main/AndroidManifest.xml`
- Gradle changes must be verified in `android/app/build.gradle`
- EAS profiles live in the tracked `eas.json`

## 2. Environment Variable Gotcha (The Optional Chaining Bug)

**Rule:** NEVER use optional chaining `?.` or dynamic object lookups when accessing `process.env` in Expo / React Native.

### ❌ Incorrect (Will fail in Release APKs)
```typescript
// Fails because Babel cannot statically analyze this string:
const clientId = process.env?.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

// Fails because it's a dynamic lookup:
const key = 'GOOGLE_CLIENT_ID';
const clientId = process.env[`EXPO_PUBLIC_${key}`];
```

### ✅ Correct (Will work in both Dev and Release)
```typescript
// Babel plugin requires EXACT direct access to replace the variable out at build time:
const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
```

**Why?** 
Expo uses a Babel plugin (`babel-plugin-transform-inline-environment-variables`) to replace environment variables with their actual string values during the build. This relies on **Static Analysis**. If you use optional chaining, Babel skips the replacement, and your app will end up with `undefined` in production!

---

## 3. Resolving CMake / Ninja Build Crashes

React Native uses C++ native modules heavily. Sometimes, the C++ build cache gets corrupt or out-of-sync with your Node modules, completely breaking Gradle builds with `ninja:` or `CMake` errors.

**The Fix:**
Delete the native `.cxx` cache before rebuilding:
```bash
rm -rf android/app/.cxx
```

---

## 4. Local Debug Installs and Emulator Storage

React Native debug APKs can become large enough to fail with `INSTALL_FAILED_INSUFFICIENT_STORAGE`, especially on emulators where `/data` is already crowded. A universal debug APK for this project can exceed `140 MB` because it bundles native libraries for every ABI.

GapWalk's local Android scripts now try to avoid that automatically:

- `npm run android` and `npm run android:e2e` detect a single connected Android target with `adb`
- If exactly one device or emulator is connected, they set `ORG_GRADLE_PROJECT_reactNativeArchitectures` to that target ABI before running `expo run:android`
- If multiple devices are connected, set `ANDROID_SERIAL=<serial>` or `ORG_GRADLE_PROJECT_reactNativeArchitectures=<abi>` yourself
- Local debug builds prefer `android/app/gapwalk-local-debug.jks` when present, then fall back to `android/app/debug.keystore`
- Override the debug keystore with `GAPWALK_DEBUG_STORE_FILE`, `GAPWALK_DEBUG_STORE_PASSWORD`, `GAPWALK_DEBUG_KEY_ALIAS`, and `GAPWALK_DEBUG_KEY_PASSWORD` in `local.properties` or the shell if needed

Useful commands when installs start failing:

```bash
adb shell df -h /data
adb -s emulator-5554 uninstall com.gapwalk.app
keytool -list -v -keystore android/app/gapwalk-local-debug.jks -alias androiddebugkey -storepass android -keypass android | rg "SHA1:"
```

If the emulator is still nearly full after uninstalling old builds, wipe the AVD data or increase its storage allocation in Android Studio.

## 5. Standard Release Build Commands

Official production builds should use EAS:

```bash
eas build --platform android --profile production
```

If you need to build a manual local Android release artifact without using EAS, follow these steps from the project root:

1. **Inject Environment Variables** (Needed for certain shell setups):
   ```bash
   export $(grep -v '^#' .env | xargs)
   ```

2. **Create or update `android/local.properties`**:
   ```bash
   cp android/local.properties.example android/local.properties
   ```

   Then fill in your local SDK path, Maps key, and release signing values:
   ```properties
   sdk.dir=/absolute/path/to/Android/Sdk
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key
   GAPWALK_RELEASE_STORE_FILE=/absolute/path/to/your-upload-keystore.jks
   GAPWALK_RELEASE_STORE_PASSWORD=your_store_password
   GAPWALK_RELEASE_KEY_ALIAS=your_key_alias
   GAPWALK_RELEASE_KEY_PASSWORD=your_key_password
   ```

   Shell env vars with the same names also work and override `local.properties` when both are present.

3. **Clear generated native caches only if needed**:
   ```bash
   rm -rf android/app/.cxx
   rm -rf android/app/build
   rm -rf android/build
   ```

4. **Build the artifact you need**:
   ```bash
   cd android
   ./gradlew bundleRelease --no-build-cache
   ```

   Use `bundleRelease` for the Play Store `.aab`. If you also need a local release APK, run:
   ```bash
   ./gradlew assembleRelease --no-build-cache
   ```

> Local release tasks now fail fast if neither EAS-managed credentials nor `GAPWALK_RELEASE_*` values are present. GapWalk no longer falls back to the debug keystore for release builds.
>
> If a previous debug build leaves stale CMake/codegen state behind, `clean` can fail before the release build starts. In that case, delete `android/app/.cxx`, `android/app/build`, and `android/build`, then rerun `bundleRelease` directly.

**Output Locations:**
- AAB: `android/app/build/outputs/bundle/release/`
- APK: `android/app/build/outputs/apk/release/`

## 6. API Keys: Where to Set Them

There are two separate places for API keys depending on the build type:

| File | Used by | When |
|------|---------|------|
| `android/local.properties` | Gradle (native Android build) | `npm run android`, `eas build --local` |
| `eas.json` + EAS secrets/env | EAS cloud builds | `eas build --platform android` |
| `.env` | Expo/Metro (JS side only) | All builds, for `EXPO_PUBLIC_*` JS variables |

**Google Maps API key** is injected into `AndroidManifest.xml` at build time via Gradle `manifestPlaceholders`. It must be set in `local.properties` for local builds and supplied through EAS secrets or environment variables referenced by `eas.json` for cloud builds. It cannot be changed at runtime - a new build is required.

Start from the checked-in template:

```bash
cp android/local.properties.example android/local.properties
```

```
# android/local.properties
sdk.dir=/home/sadik/Android/Sdk
GOOGLE_MAPS_API_KEY=your_key_here
```

---

## 7. Google Calendar OAuth - Android SHA-1 Fingerprint

`@react-native-google-signin/google-signin` validates the app's signing certificate against the Android OAuth client registered in Google Cloud Console. The SHA-1 must match the certificate that ends up on the device.

| Build type | Correct SHA-1 source |
|-----------|----------------------|
| `npm run android` / `expo run:android` (debug) | `android/app/gapwalk-local-debug.jks`, or the keystore configured through `GAPWALK_DEBUG_*` |
| Local `assembleRelease` / sideloaded EAS APK or AAB | The upload or EAS signing key that signed the artifact you installed |
| Google Play Store distribution | **Google Play Console → Setup → App integrity → App signing key certificate** |

> If you installed the build yourself, do not use the Play App Signing SHA-1 unless the build actually came from Google Play. Local debug, local release, and sideloaded EAS builds use the certificate that signed that artifact on disk.

To update: Google Cloud Console → APIs & Services → Credentials → your Android OAuth client → update the SHA-1 fingerprint.

Important:
- Use the same Google project for `google-services.json`, Firebase Auth, and any Google Sign-In or Calendar OAuth clients.
- If `google-services.json` already contains an Android OAuth client for `com.gapwalk.app`, do not create another Android OAuth client in a different project just to satisfy app configuration.
- Deleting an OAuth client does not always free the package/SHA-1 immediately. If you are moving the app to a different project, remove the Android app/client from the original Firebase or Google Cloud project and allow time for Google to release the package/SHA registration.

---

## 8. Bumping the Version Code

Google Play rejects uploads with a `versionCode` already in use. You must increment it in **two places** before every new build submitted to the Play Store:

| File | Field |
|------|-------|
| `app.json` | `expo.android.versionCode` |
| `android/app/build.gradle` | `defaultConfig.versionCode` |

Both must match. Example - incrementing from `10103` to `10104`:

**`app.json`:**
```json
"android": {
  "versionCode": 10104
}
```

**`android/app/build.gradle`:**
```groovy
defaultConfig {
    versionCode 10104
}
```

> `versionName` (e.g. `"1.0.3"`) is the human-readable version shown to users and does not need to change for every build - only `versionCode` must be unique and increasing.
