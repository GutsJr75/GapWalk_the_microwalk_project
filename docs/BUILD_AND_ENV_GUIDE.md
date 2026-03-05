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
