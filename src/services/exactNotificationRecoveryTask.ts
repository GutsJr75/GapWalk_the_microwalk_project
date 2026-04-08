import { notificationService } from './notifications';
import { androidExactNotifications } from './androidExactNotifications';

interface TaskData {
  reason?: string;
}

/**
 * Headless JS task that re-seeds future walk reminders after Android lifecycle
 * events like reboot, timezone changes, or exact-alarm permission changes.
 */
export default async function exactNotificationRecoveryTask(
  data: TaskData,
): Promise<void> {
  try {
    await notificationService.recoverScheduledNotifications({
      requestPermissions: false,
      force: true,
    });
    await androidExactNotifications.clearRecoveryNeeded();
  } catch (error) {
    await androidExactNotifications.markRecoveryNeeded(data.reason ?? 'headless_recovery_failed');
    if (__DEV__) console.error('exactNotificationRecoveryTask error:', error);
  }
}
