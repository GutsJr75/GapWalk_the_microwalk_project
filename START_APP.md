# 🚀 How to Run GapWalk

## Quick Start (Choose One Method)

### Method 1: Web Browser (Fastest - Good for Testing)
```bash
npx expo start --web
```
- Opens automatically in your browser
- Limited features (no notifications/location)
- Good for testing UI and navigation

### Method 2: Mobile Device with Expo Go (Recommended)
```bash
npx expo start
```
Then:
1. Install **Expo Go** app on your phone (App Store or Google Play)
2. Scan the QR code that appears in terminal
3. Wait for app to load

### Method 3: iOS Simulator (Mac Only)
```bash
npx expo start
```
Then press `i` in the terminal

### Method 4: Android Emulator  
```bash
npx expo start
```
Then press `a` in the terminal

---

## Current Status

The Expo dev server is running. You have several options:

### Option A: Open in Browser
Your terminal should show something like:
```
Metro waiting on http://localhost:8081
```

Just open your browser and go to: **http://localhost:8081**

### Option B: Use Expo Go on Your Phone
1. Download "Expo Go" from:
   - iOS: App Store
   - Android: Google Play

2. Make sure phone and computer are on same WiFi

3. In the terminal, you'll see a QR code - scan it with:
   - iOS: Camera app
   - Android: Expo Go app

### Option C: View in Your Current Terminal
The server should be running. Check this file for the QR code:
```
C:\Users\69mah\.cursor\projects\c-Users-69mah-Downloads-GapWalk\terminals\
```
Look for the latest .txt file

---

## If Server Isn't Running

Open PowerShell in the GapWalk folder and run:

```powershell
# Kill any stuck processes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Start fresh
npx expo start
```

---

## Troubleshooting

### "Port already in use"
```powershell
npx expo start --port 8082
```

### "Can't find module"
```powershell
npm install
npx expo start
```

### Clear cache and restart
```powershell
npx expo start -c
```

---

## What You'll See

1. **Intro Screen** - "Get Started Now" button
2. **Schedule Setup** - Choose Import/Manual/Google Calendar
3. **Preferences** - Set targets or skip
4. **Dashboard** - Your walking opportunities!

---

## Need Help?

- Press `?` in the terminal for help menu
- Press `r` to reload the app
- Press `m` to toggle menu
- Press Ctrl+C to stop the server

---

**The app is ready! Just choose your preferred method above.** 🎉
