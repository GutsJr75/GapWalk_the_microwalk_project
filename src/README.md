# Frontend Structure

This app's frontend stays at the repo root. The backend remains isolated in `backend/`.

## Folder map
- `src/components/`: reusable UI building blocks shared across screens
- `src/data/`: local persistence and database access
- `src/data/repositories/`: read/write access for app data models
- `src/hooks/`: reusable React hooks
- `src/i18n/`: translation literals and localization helpers
- `src/screens/`: top-level app screens
- `src/screens/dashboard/`: Dashboard-only view pieces
- `src/services/`: app services and integrations such as notifications, analytics, schedule sync, and external providers
- `src/store/`: global app state
- `src/theme/`: design tokens, palette, and screen chrome helpers
- `src/types/`: shared TypeScript types and domain models
- `src/utils/`: pure helpers such as formatting, parsing, copy helpers, and stats utilities

## Cleanup notes
- `src/components/ScheduleCard.tsx` was removed because nothing imported it.
- `src/lib/manualScheduleGenerator.ts` was removed because nothing imported it.
- The old catch-all `src/lib/` folder was split so each folder name now matches what it contains.
