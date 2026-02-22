# Building an APK for GapWalk

You can install GapWalk on your Android phone in two ways: **local build** (on your computer) or **cloud build** (Expo EAS).

---

## Option 1: Local build (APK on your machine)

### Prerequisites

- **Node.js** (v18+)
- **JDK 17** (e.g. from [Adoptium](https://adoptium.net/))
- **Android SDK** (e.g. via [Android Studio](https://developer.android.com/studio))
- Set `ANDROID_HOME` (e.g. `~/Library/Android/sdk` on macOS)

### 1. Install dependencies

```bash
npm install
```

### 2. (Optional) Google Maps

For the map on the Walking screen, set a Google Maps API key in `.env`:

```
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key
GOOGLE_MAPS_API_KEY=your_key
```

If you skip this, the app still runs; the Walking screen shows “Map Unavailable” but distance and steps still work.

### 3. Use the app icon (optional)

The project includes a GapWalk app icon at `assets/icon.png` and it’s set in `app.json`. To make the built APK use it, regenerate the Android project once:

```bash
npx expo prebuild --clean
```

Then continue with the keystore and build steps below.

### 4. Create a debug keystore (first time only)

From the project root:

```bash
cd android/app
keytool -genkey -v -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000
cd ../..
```

(Answer the prompts; values don’t matter for a local install.)

### 5. Build the release APK

```bash
cd android
./gradlew assembleRelease
cd ..
```

On **Windows** use: `gradlew.bat assembleRelease`

### 6. Find and install the APK

- APK path: **`android/app/build/outputs/apk/release/app-release.apk`**
- Copy it to your phone (USB, cloud, etc.) and open the file to install.
- If asked, allow “Install from unknown sources” for your file manager or browser.

---

## Option 2: Cloud build with Expo EAS

No Android SDK needed on your machine; Expo builds the app in the cloud.

### 1. Install EAS CLI and log in

```bash
npm install -g eas-cli
eas login
```

(Create an Expo account if needed.)

### 2. Configure EAS

```bash
eas build:configure
```

Choose **Android** and accept the defaults (or add a “preview” profile for APK).

### 3. Build an APK

```bash
eas build --platform android --profile preview
```

If you don’t have a `preview` profile, use:

```bash
eas build --platform android
```

Then in [expo.dev](https://expo.dev) → your project → Builds, open the Android build and download the **APK** (or install link).

---

## Will it work on my phone?

Yes. On a real device:

- **Push notifications** work (when you allow notification permission).
- **Location / map** work (allow location when the app asks; Maps need the API key in the build).
- **Weekly data and SQLite** work; data is stored on the device.

Use a **release** build (e.g. `assembleRelease` or EAS production/preview) for testing as you would in production. Debug builds are fine for development but are slower and not signed for distribution.
