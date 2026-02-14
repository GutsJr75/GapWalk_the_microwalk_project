import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { NudgePlan, Preferences } from './types';
import { parseISO, subMinutes, isBefore } from 'date-fns';

const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo';

const hasNativeNotificationApis =
  typeof Notifications.scheduleNotificationAsync === 'function' &&
  typeof Notifications.cancelAllScheduledNotificationsAsync === 'function' &&
  typeof Notifications.addNotificationResponseReceivedListener === 'function' &&
  typeof Notifications.addNotificationReceivedListener === 'function';

export const isNotificationsSupported =
  Platform.OS !== 'web' &&
  !isExpoGo &&
  hasNativeNotificationApis;

if (isNotificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const noopSubscription: Notifications.Subscription = {
  remove: () => {
    // no-op when notifications are unavailable (web / Expo Go)
  },
};

export const notificationService = {
  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    if (!isNotificationsSupported) return false;

    if (!Device.isDevice) {
      console.log('Must use physical device for notifications');
      return false;
    }
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') return false;
    
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'GapWalk Nudges',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      });
    }
    
    return true;
  },
  
  /**
   * Schedule a notification for a nudge plan.
   * Respects the user's whenToNotify preference and grace period.
   *
   * - "now" : schedule at walkStart (gap start + buffer + grace)
   * - "delay": schedule notifyDelayMinutes before walkStart (clamped to gap start)
   * - "next_gap": caller should handle; this just schedules at walkStart
   */
  async scheduleNudge(plan: NudgePlan, prefs?: Preferences): Promise<string | null> {
    if (!isNotificationsSupported) return null;

    try {
      let notifyTime = parseISO(plan.walkStart);

      // Apply "delay" as "minutes before walk start", never before gap start.
      if (prefs?.whenToNotify === 'delay') {
        notifyTime = subMinutes(notifyTime, prefs.notifyDelayMinutes ?? 5);
        const gapStart = parseISO(plan.gapStart);
        if (isBefore(notifyTime, gapStart)) {
          notifyTime = gapStart;
        }
      }

      const now = new Date();
      if (notifyTime <= now) return null;

      const walkStart = parseISO(plan.walkStart);
      const minutesUntilWalk = Math.max(0, Math.round((walkStart.getTime() - notifyTime.getTime()) / 60000));
      const bodyText = minutesUntilWalk > 0
        ? `You have ~${plan.suggestedDurationMinutes} min free. Walk starts in ${minutesUntilWalk} min.`
        : `You have ~${plan.suggestedDurationMinutes} min free. Want a quick walk?`;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Gap time! \uD83D\uDEB6',
          body: bodyText,
          data: {
            planId: plan.id,
            type: 'walk_nudge',
          },
          sound: true,
        },
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.floor((notifyTime.getTime() - Date.now()) / 1000),
          repeats: false,
        },
      });
      
      return notificationId;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  },
  
  /**
   * Schedule multiple nudges respecting preferences
   */
  async scheduleMultipleNudges(plans: NudgePlan[], prefs?: Preferences): Promise<void> {
    if (!isNotificationsSupported) return;

    for (const plan of plans) {
      await this.scheduleNudge(plan, prefs);
    }
  },
  
  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    if (!isNotificationsSupported) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
  
  /**
   * Cancel a specific notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    if (!isNotificationsSupported) return;
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  },
  
  /**
   * Show immediate notification (for testing or immediate alerts)
   */
  async showImmediateNotification(title: string, body: string): Promise<void> {
    if (!isNotificationsSupported) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  },

  /**
   * Show immediate walk nudge (when user taps "Notify Me" on dashboard).
   * Includes planId so tapping opens the Walking screen.
   */
  async showImmediateNudge(planId: string, durationMinutes: number): Promise<void> {
    if (!isNotificationsSupported) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time for a walk! \uD83D\uDEB6',
        body: `You have ${durationMinutes} min available. Tap to start your micro walk.`,
        data: { planId, type: 'walk_nudge' },
        sound: true,
      },
      trigger: null,
    });
  },
  
  /**
   * Add notification response listener
   */
  addNotificationResponseListener(
    handler: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    if (!isNotificationsSupported) return noopSubscription;
    return Notifications.addNotificationResponseReceivedListener(handler);
  },
  
  /**
   * Add notification received listener (for foreground notifications)
   */
  addNotificationReceivedListener(
    handler: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    if (!isNotificationsSupported) return noopSubscription;
    return Notifications.addNotificationReceivedListener(handler);
  },
};
