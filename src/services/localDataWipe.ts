import { androidExactNotifications } from './androidExactNotifications';
import { getDatabase, withTransaction } from '../data/db';
import { guidanceStorage } from '../data/guidanceStorage';
import { isNotificationsSupported, notificationService } from './notifications';

const PERSONAL_DATA_TABLES = [
  'schedule_source',
  'busy_events',
  'preferences',
  'manual_schedule_entries',
  'nudge_plans',
  'walk_sessions',
  'walk_routes',
  'walk_pause_events',
  'analytics_events',
  'crash_reports',
  'achievements',
  'walk_checkpoint',
] as const;

/**
 * Remove locally persisted personal/user data from the device.
 * Keeps device-level settings (theme/language/UI preferences) intact.
 */
export const wipeLocalPersonalData = async (): Promise<void> => {
  if (isNotificationsSupported) {
    try {
      await notificationService.cancelAllNotifications();
    } catch (error) {
      if (__DEV__) console.warn('Failed to cancel notifications during local data wipe:', error);
    }
  }

  if (androidExactNotifications.isSupported()) {
    try {
      await androidExactNotifications.clearRecoveryNeeded();
    } catch (error) {
      if (__DEV__) console.warn('Failed to clear exact-notification recovery state during local data wipe:', error);
    }
  }

  await getDatabase();
  await withTransaction(async (db) => {
    for (const table of PERSONAL_DATA_TABLES) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });

  await guidanceStorage.resetAll();
};

