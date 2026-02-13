# Assets Folder

This folder contains app assets like icons and splash screens.

## Required Assets

For a production build, you'll need:

1. **icon.png** (1024x1024) - App icon
2. **splash.png** (2048x2048 with transparent background) - Splash screen
3. **adaptive-icon.png** (1024x1024) - Android adaptive icon
4. **favicon.png** (48x48) - Web favicon
5. **notification-icon.png** (96x96) - Android notification icon

## Temporary Placeholders

For development, Expo will use default placeholder assets if these files are missing.

To generate proper assets:
1. Create your icon design
2. Use Expo's asset generator or a tool like https://www.appicon.co/
3. Place the generated files in this folder

## Design Guidelines

- Use the GapWalk brand color (#6366F1 - Indigo)
- Icon should be simple and recognizable
- Follow platform-specific guidelines:
  - iOS: No transparency, rounded corners applied by system
  - Android: Can have transparency, adaptive icons recommended
