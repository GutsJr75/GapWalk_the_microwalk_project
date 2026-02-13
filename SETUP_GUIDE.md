# GapWalk - Complete Setup Guide

This guide will walk you through setting up and running the GapWalk mobile app on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

1. **Node.js** (v18 or newer)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **npm** (comes with Node.js)
   - Verify installation: `npm --version`

3. **Git** (optional, for version control)
   - Download from: https://git-scm.com/

### Development Environment

Choose one or more platforms to develop for:

#### For iOS Development (Mac only)
- **Xcode** (latest version from Mac App Store)
- **iOS Simulator** (comes with Xcode)
- **Expo Go app** (from iOS App Store) for testing on real device

#### For Android Development
- **Android Studio** with Android SDK
- **Android Emulator** (configured in Android Studio)
- **Expo Go app** (from Google Play Store) for testing on real device

#### For Web Development
- Any modern web browser (Chrome, Firefox, Safari, Edge)

## Step-by-Step Setup

### 1. Install Dependencies

Open your terminal and navigate to the GapWalk project folder:

```bash
cd path/to/GapWalk
```

Install all required packages:

```bash
npm install
```

This will install:
- Expo SDK and tooling
- React Native and React Navigation
- Database (expo-sqlite)
- State management (zustand)
- Notifications, location, maps
- Date utilities, ICS parser
- TypeScript and type definitions

**Expected time:** 2-5 minutes depending on your internet speed

### 2. Verify Installation

Check that everything installed correctly:

```bash
npm list --depth=0
```

You should see all the packages listed in `package.json` without errors.

### 3. Start the Development Server

Run the Expo development server:

```bash
npm start
```

Or use the shorthand:

```bash
npx expo start
```

You should see a QR code in your terminal and a Metro bundler interface.

### 4. Run on a Device or Simulator

You have several options:

#### Option A: iOS Simulator (Mac only)

Press `i` in the terminal or click "Run on iOS simulator" in the Expo Dev Tools.

The iOS Simulator will launch automatically and install the app.

#### Option B: Android Emulator

1. Start your Android emulator from Android Studio
2. Press `a` in the terminal or click "Run on Android device/emulator"

#### Option C: Physical Device (Recommended for best experience)

1. Install **Expo Go** app on your iOS or Android device
2. Ensure your phone and computer are on the same WiFi network
3. Scan the QR code with:
   - **iOS**: Camera app (will open in Expo Go)
   - **Android**: Expo Go app's built-in QR scanner

#### Option D: Web Browser (Limited functionality)

Press `w` in the terminal. Note: Notifications, location, and some native features won't work.

### 5. Test the App

Once the app loads:

1. You should see the **Intro Screen** with "GapWalk" title
2. Tap "Get Started Now!"
3. Try adding a schedule:
   - **Import**: Upload a .ics file from your calendar
   - **Manual**: Create a sample schedule (e.g., Work 9-5, Mon-Fri)
4. Set preferences or skip
5. View the Dashboard
6. Try starting a walk

## Troubleshooting

### Issue: Metro bundler fails to start

**Solution:**
```bash
# Clear cache and restart
npx expo start -c
```

### Issue: "Unable to resolve module"

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

### Issue: iOS simulator doesn't open

**Solution:**
- Ensure Xcode is installed and command line tools are configured:
  ```bash
  xcode-select --install
  ```
- Try opening simulator manually first, then run `npm run ios`

### Issue: Android emulator not detected

**Solution:**
- Ensure Android Studio SDK is installed
- Check that `ANDROID_HOME` environment variable is set
- Verify emulator is running before pressing `a`

### Issue: Notifications don't work

**Solutions:**
- Notifications don't work in simulators - use a real device
- Grant notification permissions when prompted
- Check system notification settings

### Issue: Location/Maps not showing

**Solutions:**
- Grant location permissions
- For iOS simulator: Features > Location > Custom Location
- For Android emulator: Extended controls > Location
- Maps work better on physical devices with GPS

### Issue: TypeScript errors

**Solution:**
```bash
# Check TypeScript configuration
npx tsc --noEmit
```

## Building for Production

### iOS (requires Mac + Apple Developer account)

1. Create an Expo account: https://expo.dev/signup
2. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
3. Login:
   ```bash
   eas login
   ```
4. Configure build:
   ```bash
   eas build:configure
   ```
5. Build for iOS:
   ```bash
   eas build --platform ios
   ```

### Android

1. Same setup as iOS (Expo account + EAS CLI)
2. Build for Android:
   ```bash
   eas build --platform android
   ```

## Google Calendar Integration Setup (Optional)

To enable Google Calendar integration:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable "Google Calendar API"
4. Create OAuth 2.0 credentials:
   - Application type: Web application (for Expo)
   - Authorized redirect URIs: Add your Expo redirect URI
5. Copy the Client ID
6. Edit `src/lib/googleCalendar.ts`:
   ```typescript
   const GOOGLE_CLIENT_ID = 'your-client-id-here.apps.googleusercontent.com';
   ```
7. Update `app.json` with the scheme:
   ```json
   "scheme": "gapwalk"
   ```

## Additional Configuration

### App Icons and Splash Screen

1. Create or design your app icon (1024x1024 PNG)
2. Create splash screen (2048x2048 PNG with transparency)
3. Place in `assets/` folder:
   - `icon.png`
   - `splash.png`
   - `adaptive-icon.png` (for Android)
4. Expo will automatically resize for all platforms

### Environment Variables (Optional)

Create `.env` file for sensitive data:
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Then install and configure:
```bash
npm install react-native-dotenv
```

## Development Tips

### Hot Reload
- Shake your device or press `Cmd + D` (iOS) / `Cmd + M` (Android)
- Select "Enable Fast Refresh"
- Code changes will appear instantly

### Debug Menu
- iOS: `Cmd + D` in simulator
- Android: `Cmd + M` or shake device
- Options: Reload, Debug, Performance Monitor, Inspector

### Logs
```bash
# View all logs
npx expo start

# iOS only logs
npx expo start --ios

# Android only logs
npx expo start --android
```

### Database Inspection

To view SQLite database during development, you can:
1. Use Expo's file system to locate the database
2. Pull the .db file from device
3. Open with DB Browser for SQLite

## Next Steps

Once the app is running successfully:

1. Test the complete user flow
2. Import your own calendar (.ics file)
3. Set realistic preferences
4. Try a real walking session
5. Check notification scheduling
6. Explore location tracking

## Support

If you encounter issues not covered here:

1. Check the main [README.md](./README.md)
2. Review Expo documentation: https://docs.expo.dev/
3. Search Expo forums: https://forums.expo.dev/
4. Check React Native docs: https://reactnative.dev/

## Summary Checklist

- [ ] Node.js installed (v18+)
- [ ] Project dependencies installed (`npm install`)
- [ ] Development server starts (`npm start`)
- [ ] App runs on at least one platform
- [ ] Intro screen visible
- [ ] Can navigate through onboarding
- [ ] Database initializes successfully
- [ ] Can add schedule (manual or import)
- [ ] Preferences save correctly
- [ ] Dashboard loads with stats
- [ ] Walk tracking works

Once all items are checked, you're ready to develop and customize GapWalk!
