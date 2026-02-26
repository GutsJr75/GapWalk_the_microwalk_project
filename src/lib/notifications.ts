import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { NudgePlan, Preferences } from './types';
import { addMinutes, parseISO, subMinutes, isBefore } from 'date-fns';
import { timeUtils } from './time';
import { sessionsRepo } from './repositories/sessionsRepo';

export const WALK_NUDGE_CATEGORY_ID = 'walk_nudge_actions';
export const WALK_NUDGE_ACTION_START = 'START_WALK';
export const WALK_NUDGE_ACTION_SKIP = 'SKIP_GAP';

// Walk session ongoing notification
export const WALK_SESSION_NOTIFICATION_ID = 'walk-session-timer';
export const WALK_SESSION_ACTIVE_CATEGORY = 'walk_session_active';
export const WALK_SESSION_PAUSED_CATEGORY = 'walk_session_paused';
export const WALK_SESSION_ACTION_PAUSE = 'PAUSE_WALK_SESSION';
export const WALK_SESSION_ACTION_RESUME = 'RESUME_WALK_SESSION';
export const WALK_SESSION_ACTION_END = 'END_WALK_SESSION';

// Android channel IDs
const ANDROID_CHANNEL_DEFAULT = 'default';
const ANDROID_CHANNEL_WALK_SESSION = 'walk-session';

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

    // iOS simulator does not support local push reliably; Android emulators can.
    if (!Device.isDevice && Platform.OS === 'ios') {
      if (__DEV__) console.log('Use a physical iOS device for notifications');
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

    await Notifications.setNotificationCategoryAsync(WALK_NUDGE_CATEGORY_ID, [
      {
        identifier: WALK_NUDGE_ACTION_SKIP,
        buttonTitle: 'Not Now',
        options: {
          opensAppToForeground: true,
          isDestructive: true,
        },
      },
      {
        identifier: WALK_NUDGE_ACTION_START,
        buttonTitle: 'Yes',
        options: {
          opensAppToForeground: true,
        },
      },
    ]);
    
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
      const walkStart = parseISO(plan.walkStart);

      // Suppress notifications if daily goal or step goal already reached
      if (prefs) {
        try {
          const minsToday = await sessionsRepo.getTodayMinutes();
          if (minsToday >= prefs.dailyTargetMinutes) return null;

          if (prefs.stepGoalEnabled && prefs.stepGoal > 0) {
            const stepsToday = await sessionsRepo.getTodaySteps();
            if (stepsToday >= prefs.stepGoal) return null;
          }
        } catch { /* ok — schedule anyway if DB read fails */ }
      }

      let notifyTime = walkStart;

      // Apply "delay" as "minutes before walk start", never before gap start.
      if (prefs?.whenToNotify === 'delay') {
        notifyTime = subMinutes(notifyTime, prefs.notifyDelayMinutes ?? 5);
        const gapStart = parseISO(plan.gapStart);
        if (isBefore(notifyTime, gapStart)) {
          notifyTime = gapStart;
        }
      }

      if (prefs) {
        while (
          notifyTime.getTime() < walkStart.getTime() &&
          timeUtils.isInQuietHours(notifyTime, prefs.quietHoursStart, prefs.quietHoursEnd)
        ) {
          notifyTime = addMinutes(notifyTime, 1);
        }
        if (timeUtils.isInQuietHours(notifyTime, prefs.quietHoursStart, prefs.quietHoursEnd)) {
          return null;
        }
        if (notifyTime.getTime() > walkStart.getTime()) {
          return null;
        }
      }

      const now = new Date();
      if (notifyTime <= now) return null;

      // Build personalized, varied notification text
      const minutesUntilWalk = Math.max(0, Math.round((walkStart.getTime() - notifyTime.getTime()) / 60000));
      const dur = plan.suggestedDurationMinutes;
      const isStrict = prefs?.strictnessMode === 'no_excuses';

      let progressHint = '';
      try {
        const minsWalked = await sessionsRepo.getTodayMinutes();
        const target = prefs?.dailyTargetMinutes ?? 0;
        if (target > 0 && minsWalked > 0) {
          const remaining = Math.max(0, target - minsWalked);
          progressHint = remaining > 0
            ? `\n${minsWalked} of ${target} min done today, only ${remaining} to go!`
            : '';
        }
      } catch { /* ok */ }

      const titles = isStrict
        ? ['Time to get moving! \uD83D\uDCAA', 'Your walk is waiting for you \uD83D\uDEB6', 'Let\'s go for a walk! \uD83C\uDFC3']
        : ['You have a great walking window \uD83D\uDEB6', 'Perfect time for a walk \u2600\uFE0F', 'How about a quick walk? \uD83D\uDC63'];
      const titleHash = plan.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const title = titles[titleHash % titles.length];

      let bodyText: string;
      if (minutesUntilWalk > 0) {
        bodyText = isStrict
          ? `${dur} free minutes, starts in ${minutesUntilWalk} min. Let's make it count!${progressHint}`
          : `About ${dur} free minutes, starts in ${minutesUntilWalk} min. A perfect chance to stretch your legs!${progressHint}`;
      } else {
        bodyText = isStrict
          ? `${dur} free minutes right now. Let's make them count!${progressHint}`
          : `About ${dur} free minutes right now. How about a refreshing walk?${progressHint}`;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: bodyText,
          categoryIdentifier: WALK_NUDGE_CATEGORY_ID,
          data: {
            planId: plan.id,
            type: 'walk_nudge',
          },
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT } : {}),
        },
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.ceil((notifyTime.getTime() - Date.now()) / 1000)),
          repeats: false,
        },
      });
      
      return notificationId;
    } catch (error) {
      if (__DEV__) console.error('Failed to schedule notification:', error);
      return null;
    }
  },

  /**
   * Schedule a notification for a manually-created walk plan.
   * Bypasses quiet hours, goal suppression, and preferred period checks
   * because the user explicitly requested this walk.
   */
  async scheduleManualNudge(plan: NudgePlan): Promise<string | null> {
    if (!isNotificationsSupported) return null;

    try {
      const walkStart = parseISO(plan.walkStart);
      const now = new Date();
      if (walkStart <= now) return null;

      const dur = plan.suggestedDurationMinutes;
      const title = 'Time for your planned walk \uD83D\uDEB6';
      const body = `You scheduled a ${dur}-min walk. Ready to go?`;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          categoryIdentifier: WALK_NUDGE_CATEGORY_ID,
          data: {
            planId: plan.id,
            type: 'walk_nudge',
          },
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.ceil((walkStart.getTime() - Date.now()) / 1000)),
          repeats: false,
        },
      });

      return notificationId;
    } catch (error) {
      if (__DEV__) console.error('Failed to schedule manual nudge:', error);
      return null;
    }
  },

  /**
   * Schedule multiple nudges respecting preferences.
   * Ensures notification permission is granted before scheduling.
   */
  async scheduleMultipleNudges(plans: NudgePlan[], prefs?: Preferences): Promise<void> {
    if (!isNotificationsSupported) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const granted = await this.requestPermissions();
      if (!granted) return;
    }

    // Build a set of planIds that already have scheduled notifications
    // to avoid duplicate scheduling when dashboard re-loads.
    const alreadyScheduled = new Set<string>();
    try {
      const existing = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of existing) {
        const data = n.content.data as Record<string, unknown> | undefined;
        if (data?.type === 'walk_nudge' && typeof data?.planId === 'string') {
          alreadyScheduled.add(data.planId);
        }
      }
    } catch { /* ok — schedule all */ }

    for (const plan of plans) {
      if (!alreadyScheduled.has(plan.id)) {
        await this.scheduleNudge(plan, prefs);
      }
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
   * Cancel only walk-nudge notifications, preserving daily_summary
   * and any other non-nudge notifications.
   */
  async cancelWalkNudges(): Promise<void> {
    if (!isNotificationsSupported) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const data = n.content.data as Record<string, unknown> | undefined;
      // Only cancel notifications explicitly tagged as walk nudges
      if (data?.type === 'walk_nudge') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
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
      content: {
        title,
        body,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT } : {}),
      },
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
        title: 'Quick walk opportunity \uD83D\uDEB6',
        body: `You've got ${durationMinutes} free min right now. Ready for a quick walk?`,
        categoryIdentifier: WALK_NUDGE_CATEGORY_ID,
        data: { planId, type: 'walk_nudge' },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT } : {}),
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

  /**
   * Schedule (or reschedule) a daily summary notification.
   *
   * Fires at 20:30 local time with today's walking stats.
   * Uses a DATE trigger so the notification content is generated at
   * delivery time by the OS. We schedule a lightweight reminder
   * and re-schedule from the dashboard so stats stay reasonably current.
   * Respects quiet hours — if 20:30 falls inside quiet hours the summary
   * is skipped for that day.
   */
  async scheduleDailySummary(prefs: Preferences): Promise<void> {
    if (!isNotificationsSupported) return;

    // Cancel any previously scheduled daily summary
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if ((n.content.data as Record<string, unknown>)?.type === 'daily_summary') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    // Build the target delivery time: today at 20:30
    const now = new Date();
    const summaryTime = new Date(now);
    summaryTime.setHours(20, 30, 0, 0);

    // If it's already past 20:30, skip — we don't backfill.
    if (summaryTime <= now) return;

    // Respect quiet hours
    if (timeUtils.isInQuietHours(summaryTime, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return;
    }

    // Gather today's stats for an informative body
    let minutes = 0;
    let steps = 0;
    try {
      minutes = await sessionsRepo.getTodayMinutes();
      steps = await sessionsRepo.getTodaySteps();
    } catch { /* ok — send a generic summary */ }

    const target = prefs.dailyTargetMinutes;
    const pct = target > 0 ? Math.min(Math.round((minutes / target) * 100), 100) : 0;

    let title: string;
    let body: string;

    if (minutes === 0) {
      title = 'You still have time today';
      body = 'Even a short 5-minute walk can boost your mood. Try one before bed!';
    } else if (target > 0 && minutes >= target) {
      title = 'Goal reached! Great job today';
      body = `You walked ${minutes} min (${steps.toLocaleString()} steps), that's ${pct}% of your daily goal. Keep it up!`;
    } else {
      const remaining = Math.max(0, target - minutes);
      title = `${minutes} min walked today`;
      body = remaining > 0
        ? `Just ${remaining} more minutes to reach your ${target}-min goal. You've got this!`
        : `Nice work! ${minutes} min and ${steps.toLocaleString()} steps today.`;
    }

    const secondsUntil = Math.max(1, Math.ceil((summaryTime.getTime() - Date.now()) / 1000));

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'daily_summary' },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
        repeats: false,
      },
    });
  },

  /**
   * Set up notification categories for walk session actions.
   * Creates two categories: one for active (with Pause) and one for paused (with Resume).
   */
  async setupWalkSessionCategories(): Promise<void> {
    if (!isNotificationsSupported) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_WALK_SESSION, {
        name: 'Walk Session',
        importance: Notifications.AndroidImportance.LOW,
        vibrationPattern: [0],
        enableVibrate: false,
      });
    }

    // Pause/Resume must use opensAppToForeground: true because
    // expo-notifications only delivers response events when the app
    // is in the foreground. With `false`, the button press would be
    // silently swallowed and the user would see no effect.
    await Notifications.setNotificationCategoryAsync(WALK_SESSION_ACTIVE_CATEGORY, [
      {
        identifier: WALK_SESSION_ACTION_PAUSE,
        buttonTitle: 'Pause',
        options: { opensAppToForeground: true },
      },
      {
        identifier: WALK_SESSION_ACTION_END,
        buttonTitle: 'End Walk',
        options: { opensAppToForeground: true, isDestructive: true },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(WALK_SESSION_PAUSED_CATEGORY, [
      {
        identifier: WALK_SESSION_ACTION_RESUME,
        buttonTitle: 'Resume',
        options: { opensAppToForeground: true },
      },
      {
        identifier: WALK_SESSION_ACTION_END,
        buttonTitle: 'End Walk',
        options: { opensAppToForeground: true, isDestructive: true },
      },
    ]);
  },

  /**
   * Show or update the ongoing walk session notification.
   * Uses a fixed identifier so repeated calls replace the previous notification.
   */
  async showWalkSessionNotification(timeText: string, isPaused: boolean): Promise<void> {
    if (!isNotificationsSupported) return;

    try {
      const categoryId = isPaused ? WALK_SESSION_PAUSED_CATEGORY : WALK_SESSION_ACTIVE_CATEGORY;
      const statusEmoji = isPaused ? '\u23F8\uFE0F' : '\uD83D\uDEB6';
      const statusText = isPaused ? 'Paused' : 'Walking';

      await Notifications.scheduleNotificationAsync({
        identifier: WALK_SESSION_NOTIFICATION_ID,
        content: {
          title: `${statusEmoji} GapWalk: ${statusText}`,
          body: timeText,
          data: { type: 'walk_session' },
          categoryIdentifier: categoryId,
          sound: false,
          sticky: true,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_WALK_SESSION } : {}),
        },
        trigger: null,
      });
    } catch (e) {
      if (__DEV__) console.warn('Walk session notification failed:', e);
    }
  },

  /**
   * Dismiss the walk session notification.
   */
  async dismissWalkSessionNotification(): Promise<void> {
    if (!isNotificationsSupported) return;
    try {
      await Notifications.dismissNotificationAsync(WALK_SESSION_NOTIFICATION_ID);
    } catch {
      // ignore — notification may already be dismissed
    }
  },
};
