# GapWalk - Quick Start (5 Minutes)

Get GapWalk running on your machine in 5 minutes or less!

## Prerequisites ✅

- **Node.js v18+** installed ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)

## Quick Setup

### 1. Install Dependencies (2-3 minutes)

Open terminal in the GapWalk folder and run:

```bash
npm install
```

### 2. Start the App (30 seconds)

```bash
npm start
```

### 3. Open on Your Device

**Press the key for your platform:**
- `i` - iOS Simulator (Mac only)
- `a` - Android Emulator (requires Android Studio setup)
- `w` - Web browser (limited features)

**Or scan QR code with Expo Go app** on your phone

## First Run Experience

1. **Intro Screen** - Tap "Get Started Now!"
2. **Schedule Setup** - Choose an option:
   - **Quick test**: Select "Input Manually" → Add a sample event
   - **Real data**: Select "Import" → Upload your calendar .ics file
3. **Preferences** - Tap "Skip for now" → "Use recommended"
4. **Dashboard** - You're in! See your walking opportunities

## Testing the App

### Add a Manual Schedule
1. Go to Schedule Setup → "Input Manually"
2. Tap "+ Add Event"
3. Create a sample: "Work", Monday, 9:00 - 17:00
4. Tap "Done"

### Start a Walk
1. From Dashboard, tap "Start Manual Walk"
2. Watch the timer count up
3. Tap "Pause" to pause
4. Tap "End" to finish

### View Stats
Dashboard shows:
- Minutes walked today
- Notifications sent
- Next walking opportunities

## Commands Reference

```bash
# Start development server
npm start

# Start with cache cleared
npx expo start -c

# Specific platforms
npm run ios      # iOS
npm run android  # Android  
npm run web      # Web

# View help
npx expo --help
```

## Troubleshooting

**"Module not found" error:**
```bash
rm -rf node_modules
npm install
```

**Metro won't start:**
```bash
npx expo start -c
```

**Simulator doesn't open:**
- Make sure Xcode (iOS) or Android Studio (Android) is installed
- Try opening simulator manually first

## Platform-Specific Notes

### iOS (Mac only)
- Requires Xcode from Mac App Store
- First run may take 2-3 minutes to build
- Notifications require physical device

### Android
- Requires Android Studio and emulator setup
- Or use Expo Go on physical device (easier)

### Web
- Works but no notifications, location, or maps
- Good for UI testing only

## What's Next?

- **Import your real calendar**: Export .ics from Google/Outlook Calendar
- **Customize preferences**: Set your ideal walking target
- **Enable notifications**: Get nudges for walk opportunities
- **Try location tracking**: See your walking route on a map

## Need More Help?

- Full setup guide: [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- Project details: [README.md](./README.md)
- Expo docs: https://docs.expo.dev/

---

**You should be up and running in under 5 minutes!** 🚀

If something doesn't work, check SETUP_GUIDE.md for detailed troubleshooting.
