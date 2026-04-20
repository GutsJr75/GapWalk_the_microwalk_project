import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { NudgePlan, NotificationTimerMode, NotificationStatsMode, Preferences } from '../types';
import { addHours, addMinutes, format, parseISO, subMinutes, isBefore } from 'date-fns';
import { timeUtils } from '../utils/time';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { preferencesRepo } from '../data/repositories/preferencesRepo';
import { plansRepo } from '../data/repositories/plansRepo';
import { androidExactNotifications } from './androidExactNotifications';

export const WALK_NUDGE_CATEGORY_ID = 'walk_nudge_actions';
export const WALK_NUDGE_ACTION_START = 'START_WALK';
export const WALK_NUDGE_ACTION_SKIP = 'SKIP_GAP';
export const WALK_NUDGE_NOTIFICATION_TYPE = 'walk_nudge';
export const WALK_MISSED_NOTIFICATION_TYPE = 'walk_missed';

// Two-phase walk notification (replaces single nudge)
export const WALK_ALERT_NOTIFICATION_TYPE = 'walk_alert'; // Phase 1: informational alert
export const WALK_READY_NOTIFICATION_TYPE = 'walk_ready'; // Phase 2: action prompt
export const WALK_READY_CATEGORY_ID = 'walk_ready_actions';
export const WALK_READY_ACTION_YES = 'YES_WALK_READY';
export const WALK_READY_ACTION_NOT_NOW = 'NOT_NOW_WALK_READY';

// Post-walk summary notification
export const WALK_SUMMARY_NOTIFICATION_TYPE = 'walk_summary';

// Alternative gap suggestion notification
export const ALT_GAP_CATEGORY_ID = 'alt_gap_suggestion';
export const ALT_GAP_ACTION_ACCEPT = 'ACCEPT_ALT_GAP';
export const ALT_GAP_ACTION_DECLINE = 'DECLINE_ALT_GAP';

// Walk session ongoing notification
export const WALK_SESSION_NOTIFICATION_ID = 'walk-session-timer';
export const WALK_SESSION_ACTIVE_CATEGORY = 'walk_session_active';
export const WALK_SESSION_PAUSED_CATEGORY = 'walk_session_paused';
export const WALK_SESSION_ACTION_PAUSE = 'PAUSE_WALK_SESSION';
export const WALK_SESSION_ACTION_RESUME = 'RESUME_WALK_SESSION';
export const WALK_SESSION_ACTION_END = 'END_WALK_SESSION';

// Android channel IDs
const ANDROID_CHANNEL_DEFAULT = 'gapwalk-nudges';
const ANDROID_CHANNEL_WALK_SESSION = 'walk-session';
const NOTIFICATION_RECOVERY_HORIZON_HOURS = 48;

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

let reminderVibrationEnabled = true;

const getDefaultAndroidChannelConfig = () => ({
  name: 'GapWalk Nudges',
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: reminderVibrationEnabled ? [0, 250, 250, 250] : [0],
  enableVibrate: reminderVibrationEnabled,
  lightColor: '#6366F1',
});

type ExpoExtraConfig = {
  eas?: {
    projectId?: string;
  };
  hasAndroidGoogleServices?: boolean;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;
const easProjectId =
  ((Constants as typeof Constants & { easConfig?: { projectId?: string } }).easConfig
    ?.projectId ??
    expoExtra.eas?.projectId ??
    '')
    .trim();

const hasAndroidRemotePushConfig =
  Platform.OS !== 'android' || expoExtra.hasAndroidGoogleServices === true;

export const getExpoPushProjectId = (): string | undefined => {
  return easProjectId || undefined;
};

export const getRemotePushRegistrationError = (): string | null => {
  if (!isNotificationsSupported) {
    return 'Remote push registration is unavailable in Expo Go or on web.';
  }

  if (!hasAndroidRemotePushConfig) {
    return 'Android remote push is not configured. Add google-services.json (or expo.android.googleServicesFile) and rebuild the app.';
  }

  return null;
};

export const isAndroidFirebaseInitializationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Default FirebaseApp is not initialized');
};

if (isNotificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const isWalkSession = data?.type === 'walk_session';
      // Suppress walk_ready when app is foregrounded — in-app prompt handles it instead
      const isWalkReady = data?.type === WALK_READY_NOTIFICATION_TYPE;
      return {
        shouldPlaySound: !isWalkSession && !isWalkReady,
        shouldSetBadge: false,
        shouldShowBanner: !isWalkSession && !isWalkReady,
        shouldShowList: !isWalkReady,
      };
    },
  });
}

const noopSubscription: Notifications.Subscription = {
  remove: () => {
    // no-op when notifications are unavailable (web / Expo Go)
  },
};

type PlanNotificationType =
  | typeof WALK_NUDGE_NOTIFICATION_TYPE
  | typeof WALK_MISSED_NOTIFICATION_TYPE
  | typeof WALK_ALERT_NOTIFICATION_TYPE
  | typeof WALK_READY_NOTIFICATION_TYPE
  | typeof WALK_SUMMARY_NOTIFICATION_TYPE;

type PlanNotificationSuppressionReason =
  | 'notifications_disabled'
  | 'past'
  | 'quiet_hours'
  | 'after_walk_start'
  | 'goal_reached';

type PlanNotificationWindow = {
  notificationId: string;
  triggerAt: Date;
  allowed: boolean;
  reason?: PlanNotificationSuppressionReason;
};

export type PlanNotificationWindowPolicy = {
  nudge: PlanNotificationWindow;
  missed: PlanNotificationWindow;
};

const IOS_PLAN_THREAD_PREFIX = 'walk-plan';

const normalizeNotificationDate = (value: Date): Date => {
  const normalized = new Date(value);
  normalized.setSeconds(0, 0);
  return normalized;
};

let recoverScheduledNotificationsInFlight: Promise<number> | null = null;
const NOTIFICATION_RECOVERY_DEBOUNCE_MS = 30_000;

type NotificationRecoverySnapshot = {
  digest: string;
  recoveredAtMs: number;
};

let lastNotificationRecoverySnapshot: NotificationRecoverySnapshot | null = null;

export const getWalkNudgeNotificationId = (planId: string): string =>
  `walk-nudge:${planId}`;

export const getWalkMissedNotificationId = (planId: string): string =>
  `walk-missed:${planId}`;

export const getWalkAlertNotificationId = (planId: string): string =>
  `walk-alert:${planId}`;

export const getWalkReadyNotificationId = (planId: string): string =>
  `walk-ready:${planId}`;

export const getWalkSummaryNotificationId = (id: string): string =>
  `walk-summary:${id}`;

type WalkPlanNotificationType =
  | typeof WALK_NUDGE_NOTIFICATION_TYPE
  | typeof WALK_MISSED_NOTIFICATION_TYPE
  | typeof WALK_ALERT_NOTIFICATION_TYPE
  | typeof WALK_READY_NOTIFICATION_TYPE;

type ParsedWalkPlanNotificationId = {
  type: WalkPlanNotificationType;
  planId: string;
};

const WALK_PLAN_NOTIFICATION_PREFIXES: Array<{
  prefix: string;
  type: WalkPlanNotificationType;
}> = [
  { prefix: 'walk-nudge:', type: WALK_NUDGE_NOTIFICATION_TYPE },
  { prefix: 'walk-missed:', type: WALK_MISSED_NOTIFICATION_TYPE },
  { prefix: 'walk-alert:', type: WALK_ALERT_NOTIFICATION_TYPE },
  { prefix: 'walk-ready:', type: WALK_READY_NOTIFICATION_TYPE },
];

const parseWalkPlanNotificationId = (
  notificationId: string,
): ParsedWalkPlanNotificationId | null => {
  for (const candidate of WALK_PLAN_NOTIFICATION_PREFIXES) {
    if (!notificationId.startsWith(candidate.prefix)) continue;
    const planId = notificationId.slice(candidate.prefix.length);
    if (!planId) return null;
    return { type: candidate.type, planId };
  }
  return null;
};

const isWalkPlanNotificationType = (value: unknown): value is WalkPlanNotificationType =>
  value === WALK_NUDGE_NOTIFICATION_TYPE ||
  value === WALK_MISSED_NOTIFICATION_TYPE ||
  value === WALK_ALERT_NOTIFICATION_TYPE ||
  value === WALK_READY_NOTIFICATION_TYPE;

const logPlanNotificationLifecycle = (
  stage: 'scheduled' | 'delivered' | 'dismissed',
  payload: {
    notificationId: string;
    type?: string;
    planId?: string;
    source?: string;
  },
): void => {
  if (!__DEV__) return;
  console.log('[notifications]', stage, payload);
};

const getPlanThreadIdentifier = (planId: string): string =>
  `${IOS_PLAN_THREAD_PREFIX}:${planId}`;

export const getPlanMissedNotifyTime = (plan: NudgePlan): Date =>
  normalizeNotificationDate(parseISO(plan.gapEnd));

const adjustNotifyTimeForQuietHours = (
  notifyTime: Date,
  walkStart: Date,
  prefs?: Preferences,
): Date => {
  if (!prefs) return notifyTime;

  let adjusted = notifyTime;
  while (
    adjusted.getTime() < walkStart.getTime() &&
    timeUtils.isInQuietHours(adjusted, prefs.quietHoursStart, prefs.quietHoursEnd)
  ) {
    adjusted = addMinutes(adjusted, 1);
    adjusted.setSeconds(0, 0);
  }
  return adjusted;
};

export const getPlanNotificationWindowPolicy = (
  plan: NudgePlan,
  prefs?: Preferences,
  now: Date = new Date(),
): PlanNotificationWindowPolicy => {
  const walkStart = normalizeNotificationDate(parseISO(plan.walkStart));
  const missedTime = getPlanMissedNotifyTime(plan);
  const baseNotifyTime = normalizeNotificationDate(getPlanNotifyTime(plan, prefs));
  const nudgeTime = adjustNotifyTimeForQuietHours(baseNotifyTime, walkStart, prefs);

  const nudge: PlanNotificationWindow = {
    notificationId: getWalkNudgeNotificationId(plan.id),
    triggerAt: nudgeTime,
    allowed: true,
  };
  const missed: PlanNotificationWindow = {
    notificationId: getWalkMissedNotificationId(plan.id),
    triggerAt: missedTime,
    allowed: true,
  };

  if (plan.notificationsEnabled === false) {
    nudge.allowed = false;
    nudge.reason = 'notifications_disabled';
    missed.allowed = false;
    missed.reason = 'notifications_disabled';
    return { nudge, missed };
  }

  if (prefs && timeUtils.isInQuietHours(nudgeTime, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    nudge.allowed = false;
    nudge.reason = 'quiet_hours';
  } else if (nudgeTime.getTime() > walkStart.getTime()) {
    nudge.allowed = false;
    nudge.reason = 'after_walk_start';
  } else if (nudgeTime <= now || walkStart <= now) {
    nudge.allowed = false;
    nudge.reason = 'past';
  }

  if (prefs && timeUtils.isInQuietHours(missedTime, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    missed.allowed = false;
    missed.reason = 'quiet_hours';
  } else if (missedTime <= now) {
    missed.allowed = false;
    missed.reason = 'past';
  }

  return { nudge, missed };
};

function buildNudgeTitle(walkStart: Date, _isManual = false): string {
  const startTime = format(walkStart, 'h:mm a');
  return `Your ${startTime} walk`;
}

const NUDGE_BODIES_NOW_RELAXED = [
  (dur: number) => `It is a great time for a ${dur} minute walk if you are up for it.`,
  (dur: number) => `Your ${dur} minute walk window is open.`,
  (dur: number) => `A quick ${dur} minute walk can give your day a nice boost.`,
  (dur: number) => `If now works for you, this is a good moment for your ${dur} minute walk.`,
  (dur: number) => `Fresh air break. ${dur} minutes can make a real difference.`,
  (dur: number) => `Your next ${dur} minute walk is ready when you are.`,
];

const NUDGE_BODIES_NOW_STRICT = [
  (dur: number, time: string) => `Your ${dur} minute walk is scheduled for ${time}.`,
  (dur: number) => `You have a ${dur} minute walk planned right now.`,
  (dur: number, time: string) => `It is ${time}. This is your planned ${dur} minute walk window.`,
  (dur: number) => `Your ${dur} minute walk is ready to start.`,
];

const NUDGE_BODIES_SOON_RELAXED = [
  (dur: number, time: string, mins: number) => `Your ${dur} minute walk starts in ${mins} minutes at ${time}.`,
  (dur: number, time: string, mins: number) => `In ${mins} minutes you have a ${dur} minute walk at ${time}.`,
  (dur: number, time: string, _mins: number) => `Heads up. Your ${dur} minute walk window opens at ${time}.`,
  (dur: number, time: string, mins: number) => `${mins} minute reminder for your ${dur} minute walk at ${time}.`,
];

const NUDGE_BODIES_SOON_STRICT = [
  (dur: number, time: string, mins: number) => `Your ${dur} minute walk starts at ${time} in ${mins} minutes.`,
  (dur: number, time: string, mins: number) => `${mins} minutes until your ${dur} minute walk at ${time}.`,
];

function pickVariant<T>(variants: T[], walkStart: Date): T {
  // Rotate by day-of-month so it changes daily but is deterministic within a day
  return variants[walkStart.getDate() % variants.length];
}

function buildNudgeBody(params: {
  walkStart: Date;
  durationMinutes: number;
  notifyTime: Date;
  isStrict: boolean;
  progressHint?: string;
}): string {
  const { walkStart, durationMinutes, notifyTime, isStrict, progressHint = '' } = params;
  const startTime = format(walkStart, 'h:mm a');
  const minutesUntilWalk = Math.max(0, Math.round((walkStart.getTime() - notifyTime.getTime()) / 60000));

  if (minutesUntilWalk > 0) {
    const body = isStrict
      ? pickVariant(NUDGE_BODIES_SOON_STRICT, walkStart)(durationMinutes, startTime, minutesUntilWalk)
      : pickVariant(NUDGE_BODIES_SOON_RELAXED, walkStart)(durationMinutes, startTime, minutesUntilWalk);
    return `${body}${progressHint}`;
  }

  const body = isStrict
    ? pickVariant(NUDGE_BODIES_NOW_STRICT, walkStart)(durationMinutes, startTime)
    : pickVariant(NUDGE_BODIES_NOW_RELAXED, walkStart)(durationMinutes);
  return `${body}${progressHint}`;
}

function buildMissedWalkTitle(walkStart: Date): string {
  return `You missed your ${format(walkStart, 'h:mm a')} walk`;
}

function buildMissedWalkBody(params: {
  walkStart: Date;
  gapEnd: Date;
  durationMinutes: number;
}): string {
  const { walkStart, gapEnd, durationMinutes } = params;
  return `Your ${durationMinutes} minute walk window that started at ${format(walkStart, 'h:mm a')} closed at ${format(gapEnd, 'h:mm a')}.`;
}

export const MANUAL_NOTIFY_LEAD_MINUTE_OPTIONS = [0, 5, 10] as const;

export type ManualNotifyLeadMinutes = typeof MANUAL_NOTIFY_LEAD_MINUTE_OPTIONS[number];

export const normalizeManualNotifyLeadMinutes = (
  minutes?: number | null,
): ManualNotifyLeadMinutes => {
  if (minutes === 10) return 10;
  if (minutes === 5) return 5;
  return 0;
};

export const getPlanNotifyTime = (plan: NudgePlan, prefs?: Preferences): Date => {
  const walkStart = parseISO(plan.walkStart);

  if (plan.reason === 'manual') {
    return subMinutes(walkStart, normalizeManualNotifyLeadMinutes(plan.manualNotifyLeadMinutes));
  }

  let notifyTime = walkStart;
  if (prefs?.whenToNotify === 'delay') {
    notifyTime = subMinutes(notifyTime, prefs.notifyDelayMinutes ?? 5);
    const gapStart = parseISO(plan.gapStart);
    if (isBefore(notifyTime, gapStart)) {
      notifyTime = gapStart;
    }
  }

  return notifyTime;
};

const buildPlanNotificationSuppressedMessage = (
  reason: PlanNotificationSuppressionReason | undefined,
  prefs?: Preferences,
): string | null => {
  switch (reason) {
    case 'notifications_disabled':
      return 'This walk will be saved without reminders.';
    case 'quiet_hours':
      return prefs
        ? `This walk will be saved without reminders because it falls in your quiet hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        : 'This walk will be saved without reminders because it falls in your quiet hours.';
    case 'past':
      return 'This walk will be saved without reminders because the reminder time has already passed.';
    case 'after_walk_start':
      return 'This walk will be saved without reminders because GapWalk cannot place the reminder before the walk starts.';
    default:
      return null;
  }
};

const getPolicySuppressionReason = (
  policy: PlanNotificationWindowPolicy,
): PlanNotificationSuppressionReason | undefined => {
  if (!policy.nudge.allowed) return policy.nudge.reason;
  if (!policy.missed.allowed) return policy.missed.reason;
  return undefined;
};

const shouldUseExactAndroidPlanNotifications = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !androidExactNotifications.isSupported()) {
    return false;
  }
  return androidExactNotifications.canScheduleExactAlarms();
};

const hasMetNotificationGoals = async (prefs?: Preferences): Promise<boolean> => {
  if (!prefs) return false;

  try {
    const minsToday = await sessionsRepo.getTodayMinutes();
    if (minsToday >= prefs.dailyTargetMinutes) {
      return true;
    }

    if (prefs.stepGoalEnabled && prefs.stepGoal > 0) {
      const stepsToday = await sessionsRepo.getTodaySteps();
      if (stepsToday >= prefs.stepGoal) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
};

const scheduleExpoPlanNotification = async (input: {
  notificationId: string;
  planId: string;
  type: PlanNotificationType;
  title: string;
  body: string;
  triggerAt: Date;
  categoryIdentifier?: string;
  extraData?: Record<string, unknown>;
}): Promise<string> => {
  const content: Notifications.NotificationContentInput & { threadIdentifier?: string } = {
    title: input.title,
    body: input.body,
    categoryIdentifier: input.categoryIdentifier,
    data: {
      planId: input.planId,
      type: input.type,
      ...input.extraData,
    },
    sound: true,
    ...(Platform.OS === 'android'
      ? {
          channelId: ANDROID_CHANNEL_DEFAULT,
          priority: Notifications.AndroidNotificationPriority.MAX,
        }
      : {
          threadIdentifier: getPlanThreadIdentifier(input.planId),
        }),
  };

  return Notifications.scheduleNotificationAsync({
    identifier: input.notificationId,
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.triggerAt,
    },
  });
};

const schedulePlanNotification = async (input: {
  notificationId: string;
  planId: string;
  type: PlanNotificationType;
  title: string;
  body: string;
  triggerAt: Date;
  categoryIdentifier?: string;
  extraData?: Record<string, unknown>;
}): Promise<string | null> => {
  const useExactAndroid = await shouldUseExactAndroidPlanNotifications();
  if (useExactAndroid) {
    try {
      const scheduled = await androidExactNotifications.scheduleNotification({
        notificationId: input.notificationId,
        planId: input.planId,
        type: input.type,
        title: input.title,
        body: input.body,
        scheduledAtMs: input.triggerAt.getTime(),
      });
      if (scheduled) {
        logPlanNotificationLifecycle('scheduled', {
          notificationId: input.notificationId,
          type: input.type,
          planId: input.planId,
          source: 'android_exact',
        });
        return input.notificationId;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('Exact Android notification scheduling failed, falling back to Expo:', error);
      }
    }
  }

  try {
    const notificationId = await scheduleExpoPlanNotification(input);
    logPlanNotificationLifecycle('scheduled', {
      notificationId,
      type: input.type,
      planId: input.planId,
      source: 'expo_local',
    });
    return notificationId;
  } catch (error) {
    if (__DEV__) console.error('Failed to schedule Expo plan notification:', error);
    return null;
  }
};

const getExistingScheduledNotificationIds = async (): Promise<Set<string>> => {
  const scheduledIds = new Set<string>();
  if (!isNotificationsSupported) return scheduledIds;

  try {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    for (const scheduled of existing) {
      scheduledIds.add(scheduled.identifier);
    }
  } catch {
    // fall through - exact Android alarms can still replace existing entries by identifier
  }

  return scheduledIds;
};

const buildNotificationRecoveryDigest = (
  plans: NudgePlan[],
  prefs?: Preferences | null,
): string => {
  const prefsDigest = prefs
    ? [
        prefs.whenToNotify,
        prefs.notifyDelayMinutes,
        prefs.quietHoursStart,
        prefs.quietHoursEnd,
        prefs.dailyTargetMinutes,
        prefs.stepGoalEnabled ? 1 : 0,
        prefs.stepGoal,
      ].join('|')
    : 'no-prefs';

  const plansDigest = plans
    .map((plan) =>
      [
        plan.id,
        plan.walkStart,
        plan.gapStart,
        plan.gapEnd,
        plan.suggestedDurationMinutes,
        plan.manualNotifyLeadMinutes ?? 0,
        plan.notificationsEnabled === false ? 0 : 1,
      ].join('|'),
    )
    .join('||');

  return `${prefsDigest}##${plansDigest}`;
};

const shouldSkipRecoveryByDebounce = (
  digest: string,
  now: Date,
  force: boolean,
): boolean => {
  if (force) return false;
  if (!lastNotificationRecoverySnapshot) return false;
  if (lastNotificationRecoverySnapshot.digest !== digest) return false;
  return now.getTime() - lastNotificationRecoverySnapshot.recoveredAtMs < NOTIFICATION_RECOVERY_DEBOUNCE_MS;
};

const canAttemptNotificationRecovery = async (requestPermissions: boolean): Promise<boolean> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' || requestPermissions;
  } catch {
    // Preserve existing behavior when permission probing fails unexpectedly.
    return true;
  }
};

export const notificationService = {
  async setReminderVibrationEnabled(enabled: boolean): Promise<void> {
    reminderVibrationEnabled = enabled;
    if (isNotificationsSupported && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(
        ANDROID_CHANNEL_DEFAULT,
        getDefaultAndroidChannelConfig(),
      );
    }
    if (Platform.OS === 'android' && androidExactNotifications.isSupported()) {
      await androidExactNotifications.setReminderVibrationEnabled(enabled);
    }
  },

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
      await Notifications.setNotificationChannelAsync(
        ANDROID_CHANNEL_DEFAULT,
        getDefaultAndroidChannelConfig(),
      );
    }

    await Notifications.setNotificationCategoryAsync(WALK_NUDGE_CATEGORY_ID, [
      {
        identifier: WALK_NUDGE_ACTION_START,
        buttonTitle: 'Start walk',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: WALK_NUDGE_ACTION_SKIP,
        buttonTitle: 'Not right now',
        options: {
          opensAppToForeground: true,
          isDestructive: true,
        },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(ALT_GAP_CATEGORY_ID, [
      {
        identifier: ALT_GAP_ACTION_ACCEPT,
        buttonTitle: 'Add it',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: ALT_GAP_ACTION_DECLINE,
        buttonTitle: 'Not now',
        options: {
          opensAppToForeground: false,
          isDestructive: true,
        },
      },
    ]);

    // Phase 2 walk ready prompt — "Yes" / "Not Now"
    // iOS: opensAppToForeground must be true because expo-notifications only
    // delivers response events when the app is foregrounded.
    // Android: false works because the native BroadcastReceiver can handle it.
    await Notifications.setNotificationCategoryAsync(WALK_READY_CATEGORY_ID, [
      {
        identifier: WALK_READY_ACTION_NOT_NOW,
        buttonTitle: 'Not Now',
        options: {
          opensAppToForeground: false,
          isDestructive: true,
        },
      },
      {
        identifier: WALK_READY_ACTION_YES,
        buttonTitle: 'Yes',
        options: {
          opensAppToForeground: Platform.OS === 'ios',
        },
      },
    ]);

    return true;
  },

  async getPlanNotificationSuppressedMessage(
    plan: NudgePlan,
    prefs?: Preferences,
  ): Promise<string | null> {
    const resolvedPrefs = prefs ?? (await preferencesRepo.get()) ?? undefined;
    const staticPolicy = getPlanNotificationWindowPolicy(plan, resolvedPrefs);
    const staticSuppressionReason = getPolicySuppressionReason(staticPolicy);
    if (staticSuppressionReason) {
      return buildPlanNotificationSuppressedMessage(staticSuppressionReason, resolvedPrefs);
    }

    if (await hasMetNotificationGoals(resolvedPrefs)) {
      return "This walk will be saved without reminders because today's goal is already complete.";
    }

    return null;
  },

  async schedulePlanNotifications(
    plan: NudgePlan,
    prefs?: Preferences,
    existingScheduledIds?: Set<string>,
  ): Promise<{ nudgeId: string | null; missedId: string | null }> {
    if (!isNotificationsSupported) {
      return { nudgeId: null, missedId: null };
    }

    const resolvedPrefs = prefs ?? (await preferencesRepo.get()) ?? undefined;
    const windowPolicy = getPlanNotificationWindowPolicy(plan, resolvedPrefs);
    const goalReached = await hasMetNotificationGoals(resolvedPrefs);

    const nudgePolicy: PlanNotificationWindow = goalReached
      ? { ...windowPolicy.nudge, allowed: false, reason: 'goal_reached' }
      : windowPolicy.nudge;
    const missedPolicy: PlanNotificationWindow = goalReached
      ? { ...windowPolicy.missed, allowed: false, reason: 'goal_reached' }
      : windowPolicy.missed;

    let nudgeId: string | null = null;
    let missedId: string | null = null;

    if (
      plan.status === 'planned' &&
      nudgePolicy.allowed &&
      !existingScheduledIds?.has(nudgePolicy.notificationId)
    ) {
      try {
        const walkStart = parseISO(plan.walkStart);
        const walkEnd = parseISO(plan.gapEnd);
        const durationMinutes = plan.suggestedDurationMinutes;
        const alertTime = nudgePolicy.triggerAt;
        const readyTime = normalizeNotificationDate(walkStart);
        const alertId = getWalkAlertNotificationId(plan.id);
        const readyId = getWalkReadyNotificationId(plan.id);

        // Phase 1 (Alert) — informational, no action buttons
        // Only schedule if alert time is meaningfully before walk start (> 1 min gap)
        const alertAndReadyAreDifferent =
          Math.abs(alertTime.getTime() - readyTime.getTime()) > 60_000;

        if (alertAndReadyAreDifferent && !existingScheduledIds?.has(alertId)) {
          const phase1Id = await schedulePlanNotification({
            notificationId: alertId,
            planId: plan.id,
            type: WALK_ALERT_NOTIFICATION_TYPE,
            title: `Upcoming MicroWalk at ${format(walkStart, 'h:mm a')}`,
            body: `${durationMinutes} min walk coming up`,
            triggerAt: alertTime,
            // No categoryIdentifier — purely informational
          });
          if (phase1Id) {
            existingScheduledIds?.add(phase1Id);
          }
        }

        // Phase 2 (Ready) — action prompt with Yes / Not Now
        if (!existingScheduledIds?.has(readyId)) {
          const walkStartFormatted = format(walkStart, 'h:mm a');
          const walkEndFormatted = format(walkEnd, 'h:mm a');
          nudgeId = await schedulePlanNotification({
            notificationId: readyId,
            planId: plan.id,
            type: WALK_READY_NOTIFICATION_TYPE,
            title: `Ready now for your ${walkStartFormatted} - ${walkEndFormatted} MicroWalk session?`,
            body: `${durationMinutes} min walk window is open.`,
            triggerAt: readyTime,
            categoryIdentifier: WALK_READY_CATEGORY_ID,
            extraData: {
              walkStart: plan.walkStart,
              walkEnd: plan.gapEnd,
              duration: durationMinutes,
            },
          });
          if (nudgeId) {
            existingScheduledIds?.add(nudgeId);
          }
        }

        // Also schedule the old nudge ID so existing clear logic still works
        // (kept for backward compat during transition)
        existingScheduledIds?.add(nudgePolicy.notificationId);
      } catch (error) {
        if (__DEV__) console.error('Failed to schedule two-phase walk notifications:', error);
      }
    }

    if (
      (plan.status === 'planned' || plan.status === 'notified') &&
      missedPolicy.allowed &&
      !existingScheduledIds?.has(missedPolicy.notificationId)
    ) {
      try {
        const walkStart = parseISO(plan.walkStart);
        const gapEnd = parseISO(plan.gapEnd);
        missedId = await schedulePlanNotification({
          notificationId: missedPolicy.notificationId,
          planId: plan.id,
          type: WALK_MISSED_NOTIFICATION_TYPE,
          title: buildMissedWalkTitle(walkStart),
          body: buildMissedWalkBody({
            walkStart,
            gapEnd,
            durationMinutes: plan.suggestedDurationMinutes,
          }),
          triggerAt: missedPolicy.triggerAt,
        });
        if (missedId) {
          existingScheduledIds?.add(missedId);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to schedule missed-walk notification:', error);
      }
    }

    return { nudgeId, missedId };
  },

  /**
   * Schedule plan notifications for a nudge plan.
   * Returns the nudge identifier when a nudge was scheduled.
   */
  async scheduleNudge(plan: NudgePlan, prefs?: Preferences): Promise<string | null> {
    const { nudgeId } = await this.schedulePlanNotifications(plan, prefs);
    return nudgeId;
  },

  /**
   * Schedule plan notifications for a manually-created walk plan.
   * Manual walks follow the same notification rules as the rest of the app.
   */
  async scheduleManualNudge(plan: NudgePlan, prefs?: Preferences): Promise<string | null> {
    const { nudgeId } = await this.schedulePlanNotifications(plan, prefs);
    return nudgeId;
  },

  /**
   * Schedule multiple nudges respecting preferences.
   * Ensures notification permission is granted before scheduling.
   */
  async scheduleMultipleNudges(
    plans: NudgePlan[],
    prefs?: Preferences,
    options?: { requestPermissions?: boolean },
  ): Promise<void> {
    if (!isNotificationsSupported) return;

    const { status } = await Notifications.getPermissionsAsync();
    const shouldRequestPermissions = options?.requestPermissions !== false;
    if (status !== 'granted') {
      if (!shouldRequestPermissions) {
        return;
      }
      const granted = await this.requestPermissions();
      if (!granted) return;
    }

    const existingScheduledIds = await getExistingScheduledNotificationIds();
    const resolvedPrefs = prefs ?? (await preferencesRepo.get()) ?? undefined;

    for (const plan of plans) {
      await this.schedulePlanNotifications(plan, resolvedPrefs, existingScheduledIds);
    }
  },

  async recoverScheduledNotifications(options?: {
    prefs?: Preferences | null;
    requestPermissions?: boolean;
    now?: Date;
    force?: boolean;
  }): Promise<number> {
    if (!isNotificationsSupported) return 0;
    if (recoverScheduledNotificationsInFlight) {
      return recoverScheduledNotificationsInFlight;
    }

    recoverScheduledNotificationsInFlight = (async () => {
      const resolvedPrefs = options?.prefs ?? (await preferencesRepo.get());
      const recoveryNow = options?.now ?? new Date();
      if (!resolvedPrefs) {
        await this.cancelWalkNudges();
        return 0;
      }

      const recoveryCutoff = addHours(recoveryNow, NOTIFICATION_RECOVERY_HORIZON_HOURS);
      const futurePlans = await plansRepo.getUpcomingPlansThrough(
        recoveryCutoff.toISOString(),
        300,
      );

      const shouldRequestPermissions = options?.requestPermissions === true;
      const recoveryDigest = buildNotificationRecoveryDigest(futurePlans, resolvedPrefs);
      if (shouldSkipRecoveryByDebounce(recoveryDigest, recoveryNow, options?.force === true)) {
        return futurePlans.length;
      }

      const canRecoverNow = await canAttemptNotificationRecovery(shouldRequestPermissions);
      if (!canRecoverNow) {
        return futurePlans.length;
      }

      await this.cancelWalkNudges();

      if (futurePlans.length === 0) {
        lastNotificationRecoverySnapshot = {
          digest: recoveryDigest,
          recoveredAtMs: recoveryNow.getTime(),
        };
        return 0;
      }

      await this.scheduleMultipleNudges(futurePlans, resolvedPrefs, {
        requestPermissions: shouldRequestPermissions,
      });

      lastNotificationRecoverySnapshot = {
        digest: recoveryDigest,
        recoveredAtMs: recoveryNow.getTime(),
      };

      return futurePlans.length;
    })();

    try {
      return await recoverScheduledNotificationsInFlight;
    } finally {
      recoverScheduledNotificationsInFlight = null;
    }
  },
  
  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    if (!isNotificationsSupported) return;
    if (Platform.OS === 'android' && androidExactNotifications.isSupported()) {
      await androidExactNotifications.cancelAllPlanNotifications();
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  /**
   * Cancel scheduled walk plan notifications, preserving other notification types.
   */
  async cancelWalkNudges(): Promise<void> {
    if (!isNotificationsSupported) return;
    if (Platform.OS === 'android' && androidExactNotifications.isSupported()) {
      await androidExactNotifications.cancelAllPlanNotifications();
    }
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const data = n.content.data as Record<string, unknown> | undefined;
      if (
        data?.type === WALK_NUDGE_NOTIFICATION_TYPE ||
        data?.type === WALK_MISSED_NOTIFICATION_TYPE ||
        data?.type === WALK_ALERT_NOTIFICATION_TYPE ||
        data?.type === WALK_READY_NOTIFICATION_TYPE
      ) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  },
  
  /**
   * Cancel a specific notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    if (!isNotificationsSupported) return;
    if (Platform.OS === 'android' && androidExactNotifications.isSupported()) {
      await androidExactNotifications.cancelNotification(notificationId);
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // ignore - notification may be managed by the native exact-alarm path
    }
  },

  async dismissNotification(notificationId: string): Promise<void> {
    if (!isNotificationsSupported) return;
    if (Platform.OS === 'android' && androidExactNotifications.isSupported()) {
      await androidExactNotifications.dismissNotification(notificationId);
    }
    try {
      await Notifications.dismissNotificationAsync(notificationId);
    } catch {
      // ignore - notification may already be gone or be managed natively
    }
    const parsed = parseWalkPlanNotificationId(notificationId);
    if (parsed) {
      logPlanNotificationLifecycle('dismissed', {
        notificationId,
        type: parsed.type,
        planId: parsed.planId,
        source: 'notification_service',
      });
    }
  },

  async dismissWalkReminderNotification(planId: string): Promise<void> {
    await this.dismissNotification(getWalkNudgeNotificationId(planId));
    await this.dismissNotification(getWalkAlertNotificationId(planId));
    await this.dismissNotification(getWalkReadyNotificationId(planId));
  },

  /**
   * Cancel any still-scheduled local alert/ready for a plan and dismiss any
   * that have already been presented. Intended to be called when the
   * server-side walk_nudge push arrives so the user doesn't see the server
   * push *and* the local two-phase pair for the same plan.
   * Does NOT touch walk-missed (it still needs to fire at gapEnd).
   */
  async clearLocalWalkDuplicates(planId: string): Promise<void> {
    const alertId = getWalkAlertNotificationId(planId);
    const readyId = getWalkReadyNotificationId(planId);
    await this.cancelNotification(alertId);
    await this.cancelNotification(readyId);
    await this.dismissNotification(alertId);
    await this.dismissNotification(readyId);
  },

  async clearPlanNotifications(
    planId: string,
    options?: { dismissMissed?: boolean },
  ): Promise<void> {
    const dismissMissed = options?.dismissMissed !== false;
    const nudgeId = getWalkNudgeNotificationId(planId);
    const missedId = getWalkMissedNotificationId(planId);
    const alertId = getWalkAlertNotificationId(planId);
    const readyId = getWalkReadyNotificationId(planId);

    await this.cancelNotification(nudgeId);
    await this.cancelNotification(missedId);
    await this.cancelNotification(alertId);
    await this.cancelNotification(readyId);
    await this.dismissNotification(nudgeId);
    await this.dismissNotification(alertId);
    await this.dismissNotification(readyId);
    if (dismissMissed) {
      await this.dismissNotification(missedId);
    }
  },

  async cleanupPresentedPlanNotifications(plans: NudgePlan[] = []): Promise<void> {
    if (!isNotificationsSupported) return;

    const now = new Date();
    const todayKey = format(now, 'yyyy-MM-dd');
    const plansById = new Map<string, NudgePlan>(plans.map((plan) => [plan.id, plan]));
    const planCache = new Map<string, NudgePlan | null>();

    const resolvePlanById = async (planId: string): Promise<NudgePlan | null> => {
      if (plansById.has(planId)) return plansById.get(planId) ?? null;
      if (planCache.has(planId)) return planCache.get(planId) ?? null;
      const plan = await plansRepo.getById(planId);
      planCache.set(planId, plan);
      return plan;
    };

    const shouldDismissNotification = (
      notificationType: WalkPlanNotificationType,
      plan: NudgePlan | null,
    ): boolean => {
      if (!plan) return true; // Orphaned notification.

      const isMissedPlan = plan.status === 'cancelled' && plan.reason === 'missed';
      const isTerminal =
        plan.status === 'cancelled' ||
        plan.status === 'completed' ||
        plan.status === 'skipped';
      const isExpired = parseISO(plan.gapEnd) <= now;
      const isCurrentDayMissed = isMissedPlan && plan.date === todayKey;

      if (notificationType === WALK_MISSED_NOTIFICATION_TYPE) {
        // Keep missed cards only for active "missed" state in the current day.
        if (plan.notificationsEnabled === false) return true;
        return !isCurrentDayMissed;
      }

      if (plan.notificationsEnabled === false) return true;
      if (isMissedPlan || isTerminal || isExpired) return true;
      return false;
    };

    try {
      const presented = await Notifications.getPresentedNotificationsAsync();
      for (const notification of presented) {
        const notificationId = notification.request.identifier;
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const dataType = typeof data?.type === 'string' ? data.type : undefined;
        const dataPlanId = typeof data?.planId === 'string' ? data.planId : undefined;
        const parsedId = parseWalkPlanNotificationId(notificationId);

        const notificationType: WalkPlanNotificationType | null =
          (dataType && isWalkPlanNotificationType(dataType))
            ? dataType
            : (parsedId?.type ?? null);
        if (!notificationType) continue;

        const planId = dataPlanId || parsedId?.planId || null;
        const plan = planId ? await resolvePlanById(planId) : null;
        if (shouldDismissNotification(notificationType, plan)) {
          await this.dismissNotification(notificationId);
        }
      }
      return;
    } catch {
      // Fall back to plan-based cleanup if presented notification APIs fail.
    }

    for (const plan of plans) {
      const isMissedPlan = plan.status === 'cancelled' && plan.reason === 'missed';
      const isTerminal = plan.status === 'cancelled' || plan.status === 'completed' || plan.status === 'skipped';
      const isExpired = parseISO(plan.gapEnd) <= now;
      const shouldKeepMissed = isMissedPlan && plan.date === todayKey && plan.notificationsEnabled !== false;

      if (isMissedPlan || isTerminal || isExpired || plan.notificationsEnabled === false) {
        await this.dismissNotification(getWalkNudgeNotificationId(plan.id));
        await this.dismissNotification(getWalkAlertNotificationId(plan.id));
        await this.dismissNotification(getWalkReadyNotificationId(plan.id));
      }

      if (!shouldKeepMissed) {
        await this.dismissNotification(getWalkMissedNotificationId(plan.id));
      }
    }
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
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT, priority: Notifications.AndroidNotificationPriority.MAX } : {}),
      },
      trigger: null,
    });
  },

  /**
   * Show immediate walk nudge (when user taps "Notify Me" on dashboard).
   * Includes planId so tapping opens the Walking screen.
   */
  async showImmediateNudge(planId: string, durationMinutes: number, walkStart?: string, walkEnd?: string): Promise<void> {
    if (!isNotificationsSupported) return;
    const now = new Date();
    const walkStartFormatted = walkStart ? format(parseISO(walkStart), 'h:mm a') : format(now, 'h:mm a');
    const walkEndFormatted = walkEnd ? format(parseISO(walkEnd), 'h:mm a') : '';
    const title = walkEnd
      ? `Ready now for your ${walkStartFormatted} - ${walkEndFormatted} MicroWalk session?`
      : `Ready for a quick ${durationMinutes} min MicroWalk?`;
    await Notifications.scheduleNotificationAsync({
      identifier: getWalkReadyNotificationId(planId),
      content: {
        title,
        body: `${durationMinutes} min walk window is open.`,
        categoryIdentifier: WALK_READY_CATEGORY_ID,
        data: {
          planId,
          type: WALK_READY_NOTIFICATION_TYPE,
          walkStart: walkStart ?? now.toISOString(),
          walkEnd: walkEnd ?? '',
          duration: durationMinutes,
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT, priority: Notifications.AndroidNotificationPriority.MAX } : {}),
      },
      trigger: null,
    });
  },

  /**
   * Show a post-walk summary notification after a quick-end walk.
   * Body tap navigates to Dashboard with post-walk summary overlay.
   */
  async showPostWalkSummaryNotification(options: {
    sessionId: string;
    durationSeconds: number;
    steps: number;
    distanceMeters: number;
    distanceUnit: 'km' | 'mi';
  }): Promise<void> {
    if (!isNotificationsSupported) return;
    const { sessionId, durationSeconds, steps, distanceMeters, distanceUnit } = options;
    const minutes = Math.floor(durationSeconds / 60);
    const distance = distanceUnit === 'km'
      ? (distanceMeters / 1000).toFixed(2)
      : (distanceMeters / 1609.34).toFixed(2);

    await Notifications.scheduleNotificationAsync({
      identifier: getWalkSummaryNotificationId(sessionId),
      content: {
        title: 'MicroWalk Complete',
        body: `${minutes} min | ${steps.toLocaleString()} steps | ${distance} ${distanceUnit}`,
        data: { sessionId, type: WALK_SUMMARY_NOTIFICATION_TYPE },
        sound: true,
        ...(Platform.OS === 'android'
          ? { channelId: ANDROID_CHANNEL_DEFAULT, priority: Notifications.AndroidNotificationPriority.DEFAULT }
          : {}),
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
   * Respects quiet hours - if 20:30 falls inside quiet hours the summary
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

    // If it's already past 20:30, skip - we don't backfill.
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
    } catch { /* ok - send a generic summary */ }

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

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'daily_summary' },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: summaryTime,
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
        buttonTitle: 'End walk',
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
        buttonTitle: 'End walk',
        options: { opensAppToForeground: true, isDestructive: true },
      },
    ]);
  },

  /**
   * Show or update the ongoing walk session notification.
   * Uses a fixed identifier so repeated calls replace the previous notification.
   */
  async showWalkSessionNotification(options: {
    elapsedSeconds: number;
    isPaused: boolean;
    targetDurationMinutes?: number | null;
    startedFromNotification?: boolean;
    timerMode?: NotificationTimerMode;
    statsMode?: NotificationStatsMode;
    steps?: number;
    distanceMeters?: number;
    distanceUnit?: 'km' | 'mi';
  }): Promise<void> {
    if (!isNotificationsSupported) return;

    try {
      const {
        elapsedSeconds,
        isPaused,
        targetDurationMinutes = null,
        startedFromNotification = false,
        timerMode = 'smart',
        statsMode = 'all',
        steps = 0,
        distanceMeters = 0,
        distanceUnit = 'mi',
      } = options;
      const categoryId = isPaused ? WALK_SESSION_PAUSED_CATEGORY : WALK_SESSION_ACTIVE_CATEGORY;
      
      const elapsedMinutes = Math.max(0, Math.floor(elapsedSeconds / 60));
      const elapsedRemainderSeconds = Math.max(0, Math.floor(elapsedSeconds % 60));
      
      const targetSeconds = (targetDurationMinutes ?? 0) * 60;
      let showRemaining = false;
      if (timerMode === 'remaining') {
        showRemaining = targetDurationMinutes !== null && elapsedSeconds < targetSeconds;
      } else if (timerMode === 'smart') {
        showRemaining = startedFromNotification && targetDurationMinutes !== null && elapsedSeconds < targetSeconds;
      }

      let timerLine = `Walk Duration: ${elapsedMinutes} min ${elapsedRemainderSeconds} seconds`;
      if (showRemaining) {
        const remainingSecondsTotal = Math.max(0, targetSeconds - elapsedSeconds);
        const remainingMinutes = Math.floor(remainingSecondsTotal / 60);
        const remainingSecondsRemainder = Math.floor(remainingSecondsTotal % 60);
        timerLine = `Remaining time: ${remainingMinutes} min ${remainingSecondsRemainder} seconds`;
      }

      const normalizedUnit = distanceUnit === 'km' ? 'km' : 'mi';
      const normalizedDistance = normalizedUnit === 'km'
        ? Math.max(0, distanceMeters) / 1000
        : Math.max(0, distanceMeters) / 1609.34;
      
      const title = 'MicroWalk Session';
      
      const bodyLines = [timerLine];
      if (statsMode === 'all' || statsMode === 'steps') {
        bodyLines.push(`Steps: ${Math.max(0, steps).toLocaleString()}`);
      }
      if (statsMode === 'all' || statsMode === 'distance') {
        bodyLines.push(`Distance: ${normalizedDistance.toFixed(2)} ${normalizedUnit}`);
      }
      const body = bodyLines.join('\n');

      await Notifications.scheduleNotificationAsync({
        identifier: WALK_SESSION_NOTIFICATION_ID,
        content: {
          title,
          body,
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
   * Show an immediate notification suggesting an alternative gap after a skip/miss.
   * Actions (Yes/No) do not open the app - acceptance is handled in the background.
   */
  async scheduleAlternativeGapNotification(
    planId: string,
    gapStartTime: Date,
    _gapEndTime: Date,
    suggestedDurationMinutes: number
  ): Promise<string | null> {
    if (!isNotificationsSupported) return null;

    try {
      const timeStr = format(gapStartTime, 'h:mm a');
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'We found another walk window',
          body: `There is a ${suggestedDurationMinutes} min window at ${timeStr}. Want to add it?`,
          categoryIdentifier: ALT_GAP_CATEGORY_ID,
          data: {
            planId,
            type: 'alt_gap_suggestion',
          },
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_DEFAULT, priority: Notifications.AndroidNotificationPriority.MAX } : {}),
        },
        trigger: null,
      });

      return notificationId;
    } catch (error) {
      if (__DEV__) console.error('Failed to schedule alt gap notification:', error);
      return null;
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
      // ignore - notification may already be dismissed
    }
  },
};
