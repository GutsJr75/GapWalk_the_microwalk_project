# GapWalk - Micro-Walking Made Easy

GapWalk is a mobile app that helps you turn short gaps in your busy schedule into quick, healthy walks. No account needed, 100% free, and privacy-first.

## Features

- **Smart Schedule Integration**: Import .ics files, manually input your schedule, or link Google Calendar (coming soon)
- **Intelligent Gap Detection**: Automatically finds free gaps in your schedule
- **Customizable Preferences**: Set your daily target, buffer time, quiet hours, and notification count
- **Walk Tracking**: Timer-based tracking with optional location/distance tracking
- **Privacy-First**: All data stored locally on your device, no account required

## Tech Stack

- **Framework**: Expo & React Native
- **Language**: TypeScript
- **Navigation**: React Navigation (Native Stack)
- **State Management**: Zustand
- **Database**: Expo SQLite
- **Notifications**: expo-notifications
- **Location**: expo-location & react-native-maps
- **Date Handling**: date-fns
- **ICS Parsing**: ical.js

## Setup & Installation

### Prerequisites

- Node.js (v18 or newer)
- npm or yarn
- Expo CLI (installed automatically with the project)
- iOS Simulator (for Mac) or Android Emulator

### Installation Steps

1. **Clone or navigate to the project directory**:
   ```bash
   cd GapWalk
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```
   
   Or use specific platforms:
   ```bash
   npm run ios     # iOS simulator
   npm run android # Android emulator
   npm run web     # Web browser (limited functionality)
   ```

4. **Scan the QR code** with Expo Go app (iOS/Android) or press:
   - `i` for iOS simulator
   - `a` for Android emulator
   - `w` for web browser

## Project Structure

```
GapWalk/
├── App.tsx                 # Main app entry point with navigation
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Container.tsx
│   │   ├── Text.tsx
│   │   ├── Modal.tsx
│   │   ├── ScheduleCard.tsx
│   │   ├── StatCard.tsx
│   │   └── GapItem.tsx
│   ├── screens/            # App screens
│   │   ├── IntroScreen.tsx
│   │   ├── ScheduleSetupScreen.tsx
│   │   ├── ManualScheduleScreen.tsx
│   │   ├── PreferencesScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   └── WalkingScreen.tsx
│   ├── lib/                # Core business logic
│   │   ├── db.ts           # SQLite database initialization
│   │   ├── types.ts        # TypeScript type definitions
│   │   ├── gapEngine.ts    # Gap detection algorithm
│   │   ├── notifications.ts # Notification scheduling
│   │   ├── time.ts         # Time utility functions
│   │   ├── ics.ts          # ICS file parsing
│   │   └── repositories/   # Data access layer
│   │       ├── preferencesRepo.ts
│   │       ├── eventsRepo.ts
│   │       ├── sessionsRepo.ts
│   │       ├── plansRepo.ts
│   │       ├── scheduleSourceRepo.ts
│   │       └── manualScheduleRepo.ts
│   ├── store/              # Zustand state management
│   │   └── index.ts
│   └── theme/              # Design system (colors, spacing, typography)
│       └── index.ts
├── assets/                 # Images and icons
├── package.json
├── tsconfig.json
└── app.json               # Expo configuration
```

## How It Works

### 1. Onboarding Flow

1. **Intro Screen**: Learn about GapWalk and its benefits
2. **Schedule Setup**: Choose how to add your schedule (ICS import, manual, or Google Calendar)
3. **Preferences**: Set daily target, buffer time, notification count, and quiet hours
4. **Dashboard**: View your stats and upcoming walk opportunities

### 2. Gap Detection Algorithm

The `gapEngine.ts` module:
- Takes your busy events and preferences as input
- Filters events for the target day
- Removes all-day events and applies day boundaries
- Merges overlapping busy intervals
- Finds free gaps as the complement of busy times
- Excludes quiet hours
- Scores opportunities based on duration (prefers 8-15 min gaps)
- Selects top N gaps (up to `notificationCountPerDay`)
- Creates `NudgePlan` objects with walk start times (gap start + buffer)

### 3. Notification Scheduling

- Notifications are scheduled at `walkStart` time for each plan
- Respects quiet hours (no notifications during sleep time)
- Limits to max notifications per day
- Auto-cancels remaining nudges if daily target is met
- Uses `expo-notifications` for cross-platform support

### 4. Walk Tracking

- **Timer Mode**: Tracks active time and paused time
- **Location Mode** (optional): Tracks distance using GPS and displays route on map
- Calculates rough calorie estimate
- Saves session to database with all metrics

## Customization

### Default Preferences

You can modify defaults in `src/lib/types.ts`:

```typescript
export const DEFAULT_PREFERENCES: Preferences = {
  dailyTargetMinutes: 20,
  bufferMinutes: 2,
  notificationCountPerDay: 3,
  quietHoursStart: '23:00',
  quietHoursEnd: '06:00',
  minWalkMinutes: 6,
};
```

### Theme

Customize colors, spacing, and typography in `src/theme/index.ts`.

## Known Limitations & Future Enhancements

### Current Limitations

1. **Google Calendar**: Integration is stubbed (shows "Coming soon" alert)
2. **No Cloud Sync**: All data is local only
3. **No Account System**: Can't sync across devices
4. **Basic Manual Schedule**: Weekly template only (doesn't handle one-off events)

### Planned Features

- Full Google Calendar OAuth integration
- Settings screen to edit preferences and schedule source
- Walk history and statistics
- Export walk data
- Widgets for quick access
- Apple Health & Google Fit integration

## Troubleshooting

### Notifications not appearing

1. Ensure you've granted notification permissions
2. Check quiet hours settings
3. Verify you have upcoming plans on Dashboard
4. Test on a physical device (notifications don't work in some simulators)

### Location not tracking

1. Grant location permissions when prompted
2. Enable location services on your device
3. Test outdoors for better GPS signal
4. Check that react-native-maps is properly configured

### ICS import fails

1. Ensure the file is a valid .ics (iCalendar) format
2. Try exporting from your calendar app again
3. Check for special characters in event titles
4. Look at console logs for specific parsing errors

### Database errors

Reset the database by:
1. Uninstalling the app
2. Reinstalling and starting fresh

Or programmatically call `resetDatabase()` from `src/lib/db.ts`.

## Development Notes

### Adding a new screen

1. Create screen component in `src/screens/`
2. Add route to `RootStackParamList` in `App.tsx`
3. Add `Stack.Screen` in navigation stack

### Adding a new repository

1. Create new file in `src/lib/repositories/`
2. Follow pattern of existing repos (CRUD operations)
3. Export methods for use in screens/logic

### Testing Notifications

Schedule a test notification:

```typescript
import { notificationService } from './src/lib/notifications';

await notificationService.showImmediateNotification(
  'Test',
  'This is a test notification'
);
```

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Support

For questions or issues, please open an issue on the project repository.

---

**Made with ❤️ for healthier, more active lifestyles**
