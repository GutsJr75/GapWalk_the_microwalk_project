# Android Build & Environment Variables Guide

This document covers critical gotchas and instructions for building the Android Release APK, specifically related to how Metro/Babel bundles Environment Variables in Expo and React Native.

## 1. Environment Variable Gotcha (The Optional Chaining Bug)

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

## 2. Resolving CMake / Ninja Build Crashes

React Native uses C++ native modules heavily. Sometimes, the C++ build cache gets corrupt or out-of-sync with your Node modules, completely breaking Gradle builds with `ninja:` or `CMake` errors.

**The Fix:**
Delete the native `.cxx` cache before rebuilding:
```bash
rm -rf android/app/.cxx
```

---

## 3. Standard Release Build Commands

If you need to build a manual Release APK without using EAS, follow these steps from the project root:

1. **Inject Environment Variables** (Needed for certain shell setups):
   ```bash
   export $(grep -v '^#' .env | xargs)
   ```

2. **Clear C++/Native Cache** (Optional, but recommended if builds are failing):
   ```bash
   rm -rf android/app/.cxx
   ```

3. **Build the APK**:
   ```bash
   cd android
   ./gradlew clean assembleRelease --no-build-cache
   ```

**Output Location:**
Your APK will be generated at: `android/app/build/outputs/apk/release/app-release.apk`

---

## 4. API Keys: Where to Set Them

There are two separate places for API keys depending on the build type:

| File | Used by | When |
|------|---------|------|
| `android/local.properties` | Gradle (native Android build) | `npm run android`, `eas build --local` |
| `eas.json` (`env` block) | EAS cloud builds | `eas build --platform android` |
| `.env` | Expo/Metro (JS side only) | All builds, for `EXPO_PUBLIC_*` JS variables |

**Google Maps API key** is injected into `AndroidManifest.xml` at build time via Gradle `manifestPlaceholders`. It must be set in `local.properties` for local builds and in `eas.json` for EAS cloud builds. It cannot be changed at runtime — a new build is required.

```
# android/local.properties
sdk.dir=/home/sadik/Android/Sdk
GOOGLE_MAPS_API_KEY=your_key_here
```

---

## 5. Google Calendar OAuth — Android SHA-1 Fingerprint

`@react-native-google-signin/google-signin` validates the app's signing certificate against the Android OAuth client registered in Google Cloud Console. The SHA-1 must match the certificate that ends up on the device.

| Build type | Correct SHA-1 source |
|-----------|----------------------|
| `npm run android` (debug) | `android/app/debug.keystore` |
| EAS build (sideloaded APK) | EAS Credentials (`eas credentials --platform android`) |
| Google Play Store distribution | **Google Play Console → Setup → App integrity → App signing key certificate** |

> If distributing via the Play Store, Google re-signs the app — you must use the Play Console SHA-1, not the EAS keystore SHA-1.

To update: Google Cloud Console → APIs & Services → Credentials → your Android OAuth client → update the SHA-1 fingerprint.

---

## 6. Bumping the Version Code

Google Play rejects uploads with a `versionCode` already in use. You must increment it in **two places** before every new build submitted to the Play Store:

| File | Field |
|------|-------|
| `app.json` | `expo.android.versionCode` |
| `android/app/build.gradle` | `defaultConfig.versionCode` |

Both must match. Example — incrementing from `10103` to `10104`:

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

> `versionName` (e.g. `"1.0.3"`) is the human-readable version shown to users and does not need to change for every build — only `versionCode` must be unique and increasing.
