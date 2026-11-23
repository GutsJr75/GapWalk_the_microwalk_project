# GapWalk resume bullets: evidence and notes

Drafted 2026-11-23. The bullets are in [gapwalk-bullets.tex](gapwalk-bullets.tex).

## Format used

A recruiter's formula, picking whichever version reads stronger:

- "Accomplished [X], as measured by [Y], by doing [Z]."
- "[Action + how], resulting in [measurable outcome]."

When the measurable outcome is big, lead with it (bullet 2 does).

## Who built what

- **Me:** the Figma design and the whole mobile app (React Native client plus native Android Kotlin).
- **Teammate:** the NestJS backend and cloud connection, Firebase sign-in, most of the Google Calendar OAuth code, and the Play Store release.

## Where each number comes from

These are also the answers to "how did you measure that?" in an interview.

| Claim | Evidence |
| ----- | -------- |
| **91% of the client, 36K of 39K lines** | `git blame` over `src/**/*.ts(x)`: 35,710 of 39,138 surviving lines are mine (2026-11-23). |
| **11 screens** | `src/screens/`: About/Help, Achievements, Dashboard, Intro, Manual Schedule, Preferences, Profile, Schedule Setup, Settings, Walking, Weekly Data. |
| **Ownership of key files** | `gapEngine.ts` 100%, `permissions.ts` 100%, `notifications.ts` 97%, `WalkingScreen.native.tsx` ~93%, `WalkTrackingService.kt` ~94%. |
| **5 think-aloud sessions, 7 tasks** | My own usability study. |
| **2 reminders a day** | `DEFAULT_PREFERENCES` in `src/types/index.ts`: `notificationCountPerDay: 2`, `notificationMinGapMinutes: 60`. |
| **Up to 12 a day on wearables** | Apple Watch prompts at :50 each hour you haven't stood, toward a 12-hour Stand goal. Fitbit / Pixel Watch prompt at :50 each hour if you're under 250 steps. |
| **83%** | (12 − 2) / 12. This compares default settings, not a measurement from real users. If pushed, say "by default." |
| **At most 30 s lost** | `walkCheckpoint.ts` saves the walk to SQLite about every 30 s and restores it on the next launch. |
| **80 m outlier filter** | The walk screen throws away GPS jumps over 80 m. |
| **~3K lines of Kotlin** | `android/app/src/main/java/com/gapwalk/app/`: ~2,950 lines (foreground service, accelerometer motion detector, exact-alarm notification receivers). |

## How the gap engine works (30-second version)

1. Gets busy events from an ICS import, Google Calendar, or a manual weekly schedule.
2. Finds the free windows between events, then drops any that are too short (under 6 min by default), inside quiet hours, or outside preferred walking periods. Adds a buffer after each meeting.
3. Scores each window by length, time of day, and how close the next meeting is.
4. Keeps the top 2 (at least 60 minutes apart) and schedules local notifications with Start / Later buttons. All of this runs on the phone, with no server.

## What I left out on purpose

- **Sign-in and troubleshooting work from the old bullet.** Firebase auth and the Google Calendar OAuth code are mostly my teammate's. Claiming them could hurt me in an interview.
- **"First" or "only" claims.** Calendar-aware break apps already exist: BreakMode (iPhone), Recess (Mac), BreakBot (Google Calendar add-on). Comparing against wearables holds up better.
- **The duplicate-notification fixes.** Those commits are my teammate's.

## Still to collect (would make the bullets stronger)

- [ ] **Installs or active users** from the Play Console. The public listing didn't load when checked.
- [ ] **A usability result:** task success before vs. after, or how many issues the 5 sessions found and I fixed. With that, bullet 1 can end on an outcome.

## Sources

- [Fitbit / Google Health: Reminders to move](https://support.google.com/fitbit/answer/14225534)
- [9to5Google: Pixel Watch hourly reminders](https://9to5google.com/?p=531679)
- [Apple Community: Stand reminder timing](https://discussions.apple.com/thread/251080286)
- [MacRumors: Turn off stand reminders](https://macrumors.com/how-to/turn-off-time-to-stand-reminders-apple-watch)
- [BreakMode (App Store)](https://apps.apple.com/us/app/breakmode/id6759118105)
- [Recess: Step Away (App Store)](https://apps.apple.com/us/app/id6781438428)
- [BreakBot (Google Workspace Marketplace)](https://workspace.google.com/marketplace/app/breakbot/936119306796)
