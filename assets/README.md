# Assets Folder

This folder contains app assets like icons and splash screens.

## App icon

- **icon.png** (1024×1024) – Main app icon (included). Used for both iOS and Android; Android uses it as the adaptive icon foreground with brand background `#6366F1`.

After changing the icon, regenerate native projects so the launcher icon updates:

```bash
npx expo prebuild --clean
```

Then build as usual (e.g. `cd android && ./gradlew assembleRelease` or EAS Build).

## Optional assets

- **splash.png** (2048×2048, transparent background) – Splash screen
- **adaptive-icon.png** (1024×1024) – Optional; if omitted, `icon.png` is used as the Android adaptive foreground
- **favicon.png** (48×48) – Web favicon
- **notification-icon.png** (96×96) – Android notification icon (optional)

## Design guidelines

- Use the GapWalk brand color (#6366F1 – Indigo)
- Keep the icon simple and recognizable
- iOS: no transparency; system applies rounded corners
- Android: adaptive icon uses `icon.png` on `#6366F1` background
