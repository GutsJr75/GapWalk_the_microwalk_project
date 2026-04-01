import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Image, Platform, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addMinutes, format, isAfter, parseISO } from 'date-fns';
import { getDatabase } from './src/data/db';
import { useAppStore } from './src/store';
import { WalkDisplayCard, ALL_WALK_DISPLAY_CARDS } from './src/types';
import { preferencesRepo } from './src/data/repositories/preferencesRepo';
import { plansRepo } from './src/data/repositories/plansRepo';
import { scheduleSourceRepo } from './src/data/repositories/scheduleSourceRepo';
import { sessionsRepo } from './src/data/repositories/sessionsRepo';
import { pauseEventsRepo } from './src/data/repositories/pauseEventsRepo';
import { eventsRepo } from './src/data/repositories/eventsRepo';
import { manualScheduleRepo } from './src/data/repositories/manualScheduleRepo';
import { appFontAssets, appFontFamily } from './src/theme';
import { getThemePalette } from './src/theme/palette';
import {
  isNotificationsSupported,
  notificationService,
  WALK_NUDGE_ACTION_SKIP,
  WALK_NUDGE_ACTION_START,
  ALT_GAP_ACTION_ACCEPT,
  WALK_ALERT_NOTIFICATION_TYPE,
  WALK_READY_NOTIFICATION_TYPE,
  WALK_READY_ACTION_YES,
  WALK_READY_ACTION_NOT_NOW,
  WALK_SUMMARY_NOTIFICATION_TYPE,
  getWalkAlertNotificationId,
} from './src/services/notifications';
import { recoverOrphanedSession } from './src/services/walkCheckpoint';
import { notificationPlanActions } from './src/services/notificationPlanActions';
import { crashReporting } from './src/services/crashReporting';
import { analyticsService } from './src/services/analytics';
import { AndroidQuickEndPayload, androidWalkTracking } from './src/services/androidWalkTracking';
import { androidExactNotifications } from './src/services/androidExactNotifications';
import { getNotificationPermissionState } from './src/services/permissions';
import { authStorage } from './src/data/authStorage';
import { GUIDANCE_KEYS, guidanceStorage, type GuidanceKey } from './src/data/guidanceStorage';
import { runBackendSync } from './src/services/backendSync';
import { registerCurrentDeviceForNotifications } from './src/services/deviceRegistration';
import {
  firebaseAuthService,
  requiresEmailVerification,
} from './src/services/firebaseAuth';
import {
  buildWalkSessionFromAndroidCompletion,
  persistCompletedWalkSession,
} from './src/services/walkSessionPersistence';

// Screens
import { IntroScreen } from './src/screens/IntroScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ScheduleSetupScreen } from './src/screens/ScheduleSetupScreen';
import { ManualScheduleScreen } from './src/screens/ManualScheduleScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { WalkingScreen } from './src/screens/WalkingScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WeeklyDataScreen } from './src/screens/WeeklyDataScreen';
import { AchievementsScreen } from './src/screens/AchievementsScreen';
import { AboutHelpScreen } from './src/screens/AboutHelpScreen';

export type RootStackParamList = {
  Intro: undefined;
  ScheduleSetup: { manageMode?: boolean } | undefined;
  ManualSchedule:
  | {
    manageMode?: boolean;
    importedFilename?: string;
    importedEventCount?: number;
    prefillTemplate?: {
      id: string;
      title: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }[];
    requireSaveBeforeContinue?: boolean;
    startWithEmpty?: boolean;
    replayScheduleTour?: boolean;
  }
  | undefined;
  Preferences:
  | {
    skipScheduleSource?: boolean;
    manageMode?: boolean;
  }
  | undefined;
  Dashboard:
  | {
    openMenu?: boolean;
    showPostWalkSummary?: boolean;
    postWalkSessionId?: string;
    replayDashboardTour?: boolean;
    scrollToOpportunities?: boolean;
  }
  | undefined;
  Walking:
  | {
    planId?: string;
    prompt?: 'end_confirmation';
    startedFromNotification?: boolean;
    skipStartCountdown?: boolean;
  }
  | undefined;
  WalkingExpanded: undefined;
  Settings: undefined;
  WeeklyData: undefined;
  Achievements:
  | {
    source?: 'profile' | 'options';
  }
  | undefined;
  AboutHelp: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const ROOT_BACK_EXIT_WINDOW_MS = 1800;
const BOOT_GREETING_TYPING_MS = 52;
const BOOT_GREETING_HOLD_MS = 420;
const BOOT_BRAND_MARK = require('./assets/icons/brand-mark.png');
const BOOT_BRAND_TILE_DARK = '#071a2e';
const BOOT_BRAND_TILE_LIGHT = '#edf1f7';
const BOOT_BRAND_MARK_DARK = '#2ee9a6';
const BOOT_BRAND_MARK_LIGHT = '#047857';

type UnifiedNotificationPayload = {
  notificationId: string;
  actionIdentifier?: string;
  type?: string;
  planId?: string;
  sessionId?: string;
};

type PendingRootRoute =
  | {
      name: 'Dashboard';
      params: RootStackParamList['Dashboard'];
    }
  | {
      name: 'Walking';
      params: RootStackParamList['Walking'];
    };

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    crashReporting.logError(error, { kind: 'error_boundary' });
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <View style={errorStyles.root}>
            <Text style={errorStyles.title}>Something went wrong</Text>
            <Text style={errorStyles.body}>
              The app ran into an unexpected error. Please restart the app.
            </Text>
            <TouchableOpacity
              style={errorStyles.button}
              onPress={() => this.setState({ hasError: false })}
            >
              <Text style={errorStyles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220', padding: 32 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 12 },
  body: { fontSize: 15, color: '#8a95a8', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  button: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#3b82f6', borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
});

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const {
    hasCompletedOnboarding,
    setHasCompletedOnboarding,
    setHasSetPreferences,
    setPreferences,
    setScheduleSource,
    setTodayStats,
    setTodaySteps,
    setUpcomingPlans,
    themeMode,
    setThemeMode,
    setLanguage,
    isAuthenticated,
    setIsAuthenticated,
    setAuthUser,
    setProfileDisplayName,
    setActiveWalkSnapshot,
    setPendingWalkPrompt,
    setWalkDisplayCards,
    setNotificationTimerMode,
    setNotificationStatsMode,
    setEndWalkMode,
    setAllGuidanceSeen,
  } = useAppStore();
  const pendingRootRouteRef = useRef<PendingRootRoute | null>(null);
  const handledResponseKeysRef = useRef<Set<string>>(new Set());
  const handledResponseNotificationIdsRef = useRef<Set<string>>(new Set());
  const handledDeliveryIdsRef = useRef<Set<string>>(new Set());
  const [isBootstrapDone, setIsBootstrapDone] = useState(false);
  const [isBootGreetingDone, setIsBootGreetingDone] = useState(false);
  const [bootGreetingText, setBootGreetingText] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastAndroidRootBackPressRef = useRef(0);
  const bootGreetingTimerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasPlayedBootGreetingRef = useRef(false);

  const clearBootGreetingTimers = useCallback(() => {
    bootGreetingTimerIdsRef.current.forEach((timerId) => clearTimeout(timerId));
    bootGreetingTimerIdsRef.current = [];
  }, []);

  // Small pulse on the loading dot while bootstrap runs
  useEffect(() => {
    if (isBootstrapDone && isBootGreetingDone) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isBootGreetingDone, isBootstrapDone, pulseAnim]);

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) setIsBootstrapDone(true);
    }, 4500);

    crashReporting.install();
    initializeApp().finally(() => {
      if (!cancelled) {
        setIsBootstrapDone(true);
      }
      clearTimeout(fallbackTimer);
    });

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (!isBootstrapDone || hasPlayedBootGreetingRef.current) return;

    hasPlayedBootGreetingRef.current = true;

    clearBootGreetingTimers();
    setBootGreetingText('');
    setIsBootGreetingDone(false);

    const greetingText = 'GapWalk';
    let timelineMs = 120;

    for (let index = 1; index <= greetingText.length; index += 1) {
      timelineMs += BOOT_GREETING_TYPING_MS;
      const timerId = setTimeout(() => {
        setBootGreetingText(greetingText.slice(0, index));
      }, timelineMs);
      bootGreetingTimerIdsRef.current.push(timerId);
    }

    timelineMs += BOOT_GREETING_HOLD_MS;
    const doneTimerId = setTimeout(() => {
      setIsBootGreetingDone(true);
    }, timelineMs);
    bootGreetingTimerIdsRef.current.push(doneTimerId);

    return clearBootGreetingTimers;
  }, [clearBootGreetingTimers, isBootstrapDone]);

  useEffect(() => {
    const unsubscribe = firebaseAuthService.onAuthStateChanged((user) => {
      setAuthUser(user);
      if (user) {
        void authStorage.saveUser(user);
        if (requiresEmailVerification(user)) {
          setIsAuthenticated(false);
        }
      } else {
        void authStorage.clearAll();
        setIsAuthenticated(false);
      }
    });
    return unsubscribe;
  }, [setAuthUser, setIsAuthenticated]);

  const refreshDashboardSnapshot = useCallback(async () => {
    const mins = await sessionsRepo.getTodayMinutes();
    const notifiedCount = await plansRepo.getTodayNotifiedCount();
    const upcoming = await plansRepo.getUpcomingPlans(20);
    const stepsToday = await sessionsRepo.getTodaySteps();
    setTodayStats(mins, notifiedCount, stepsToday);
    setUpcomingPlans(upcoming);
  }, [setTodayStats, setTodaySteps, setUpcomingPlans]);

  const lastNotificationRecoveryAtRef = useRef<number>(0);
  const emptyGuidanceFlags = useRef(
    Object.fromEntries(GUIDANCE_KEYS.map((key) => [key, false])) as Record<GuidanceKey, boolean>,
  ).current;
  const resetIncompleteOnboarding = useCallback(async () => {
    if (isNotificationsSupported) {
      try {
        await notificationService.cancelAllNotifications();
      } catch (error) {
        if (__DEV__) console.warn('Failed to cancel notifications during onboarding reset:', error);
      }
    }

    if (androidExactNotifications.isSupported()) {
      try {
        await androidExactNotifications.clearRecoveryNeeded();
      } catch (error) {
        if (__DEV__) console.warn('Failed to clear exact-notification recovery state during onboarding reset:', error);
      }
    }

    await Promise.all([
      preferencesRepo.clear(),
      scheduleSourceRepo.clear(),
      eventsRepo.deleteAll(),
      manualScheduleRepo.deleteAll(),
      plansRepo.deleteAll(),
      guidanceStorage.resetAll(),
    ]);

    setPreferences(null);
    setScheduleSource(null);
    setHasCompletedOnboarding(false);
    setHasSetPreferences(false);
    setTodayStats(0, 0, 0);
    setTodaySteps(0);
    setUpcomingPlans([]);
    setAllGuidanceSeen(emptyGuidanceFlags);
  }, [
    emptyGuidanceFlags,
    setAllGuidanceSeen,
    setHasCompletedOnboarding,
    setHasSetPreferences,
    setPreferences,
    setScheduleSource,
    setTodayStats,
    setTodaySteps,
    setUpcomingPlans,
  ]);

  const runScheduledNotificationRecovery = useCallback(async (options?: {
    force?: boolean;
    refreshDashboard?: boolean;
    reason?: string;
  }) => {
    if (!isNotificationsSupported) return 0;

    const nativeRecoveryNeeded = androidExactNotifications.isSupported()
      ? await androidExactNotifications.isRecoveryNeeded()
      : false;
    const nowMs = Date.now();
    const recoveryThrottleMs = 5 * 60 * 1000;

    if (
      !options?.force &&
      !nativeRecoveryNeeded &&
      nowMs - lastNotificationRecoveryAtRef.current < recoveryThrottleMs
    ) {
      return 0;
    }

    const prefs = await preferencesRepo.get();
    if (!prefs) return 0;

    lastNotificationRecoveryAtRef.current = nowMs;

    try {
      await notificationPlanActions.reconcileExpiredPlansAndNotifications();
      const recoveredCount = await notificationService.recoverScheduledNotifications({
        prefs,
        requestPermissions: false,
      });
      if (androidExactNotifications.isSupported()) {
        await androidExactNotifications.clearRecoveryNeeded();
      }
      if (options?.refreshDashboard) {
        await refreshDashboardSnapshot();
      }
      return recoveredCount;
    } catch (error) {
      if (androidExactNotifications.isSupported()) {
        await androidExactNotifications.markRecoveryNeeded(
          options?.reason ?? 'app_notification_recovery_failed',
        );
      }
      if (__DEV__) {
        console.warn('Failed to recover scheduled notifications:', error);
      }
      return 0;
    }
  }, [refreshDashboardSnapshot]);

  const navigateToActiveWalk = useCallback((params: {
    planId?: string;
    prompt?: 'end_confirmation';
    startedFromNotification?: boolean;
    skipStartCountdown?: boolean;
  }) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Walking', params);
      return;
    }
    pendingRootRouteRef.current = {
      name: 'Walking',
      params,
    };
  }, []);

  const navigateToDashboard = useCallback((params: RootStackParamList['Dashboard']) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Dashboard', params);
      return;
    }
    pendingRootRouteRef.current = {
      name: 'Dashboard',
      params,
    };
  }, []);

  const resolveWalkPromptDetails = useCallback(async (planId?: string) => {
    if (!planId) return null;
    const plan = await plansRepo.getById(planId);
    if (!plan) return null;

    const walkStart = parseISO(plan.walkStart);
    const rawWalkEnd = addMinutes(walkStart, Math.max(1, plan.suggestedDurationMinutes));
    const gapEnd = parseISO(plan.gapEnd);
    const walkEnd = isAfter(rawWalkEnd, gapEnd) ? gapEnd : rawWalkEnd;

    return {
      planId: plan.id,
      walkStart: format(walkStart, 'h:mm a'),
      walkEnd: format(walkEnd, 'h:mm a'),
      duration: plan.suggestedDurationMinutes,
    };
  }, []);

  const handleUnifiedNotificationResponse = useCallback(async (payload: UnifiedNotificationPayload) => {
    const actionId = payload.actionIdentifier ?? Notifications.DEFAULT_ACTION_IDENTIFIER;
    const responseKey = `${payload.notificationId}:${actionId}`;
    if (handledResponseKeysRef.current.has(responseKey)) return;
    handledResponseKeysRef.current.add(responseKey);
    handledResponseNotificationIdsRef.current.add(payload.notificationId);

    try {
      await notificationService.dismissNotification(payload.notificationId);
    } catch {
      // notification may already be gone
    }

    try {
      if (payload.type === WALK_ALERT_NOTIFICATION_TYPE) {
        navigateToDashboard({ scrollToOpportunities: true });
        return;
      }

      if (payload.type === WALK_READY_NOTIFICATION_TYPE && payload.planId) {
        try {
          await notificationService.cancelNotification(getWalkAlertNotificationId(payload.planId));
          await notificationService.dismissNotification(getWalkAlertNotificationId(payload.planId));
        } catch {
          // Phase 1 may already be gone
        }

        if (actionId === WALK_READY_ACTION_YES) {
          const startCheck = await notificationPlanActions.canStartPlan(payload.planId);
          await refreshDashboardSnapshot();
          if (!startCheck.allowed) return;
          analyticsService.track('walk_ready_yes', { planId: payload.planId });
          navigateToActiveWalk({ planId: payload.planId, startedFromNotification: true });
          return;
        }

        if (actionId === WALK_READY_ACTION_NOT_NOW) {
          await notificationPlanActions.skipPlanSilently(payload.planId);
          await refreshDashboardSnapshot();
          analyticsService.track('walk_ready_not_now', { planId: payload.planId });
          return;
        }

        if (Platform.OS === 'android') {
          await notificationPlanActions.skipPlanSilently(payload.planId);
        }
        navigateToDashboard({ scrollToOpportunities: true });
        await refreshDashboardSnapshot();
        return;
      }

      if (payload.type === WALK_SUMMARY_NOTIFICATION_TYPE && payload.sessionId) {
        navigateToDashboard({
          showPostWalkSummary: true,
          postWalkSessionId: payload.sessionId,
        });
        return;
      }

      if (payload.type === 'alt_gap_suggestion' && payload.planId) {
        if (actionId === ALT_GAP_ACTION_ACCEPT) {
          await notificationPlanActions.acceptAlternativeGap(payload.planId);
          await refreshDashboardSnapshot();
        } else {
          await notificationPlanActions.declineAlternativeGap(payload.planId);
        }
        return;
      }

      if (payload.type !== 'walk_nudge' || !payload.planId) return;

      if (actionId === WALK_NUDGE_ACTION_SKIP) {
        await notificationPlanActions.skipPlan(payload.planId);
        await refreshDashboardSnapshot();
        return;
      }

      if (
        actionId !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
        actionId !== WALK_NUDGE_ACTION_START
      ) {
        return;
      }

      const startCheck = await notificationPlanActions.canStartPlan(payload.planId);
      await refreshDashboardSnapshot();
      if (!startCheck.allowed) return;

      analyticsService.track('nudge_action_start', { planId: payload.planId });
      analyticsService.track('app_foreground_from_nudge', { planId: payload.planId });
      navigateToActiveWalk({ planId: payload.planId, startedFromNotification: true });
    } catch (error) {
      if (__DEV__) console.error('Failed to process notification response:', error);
    }
  }, [navigateToActiveWalk, navigateToDashboard, refreshDashboardSnapshot]);

  const handleUnifiedNotificationDelivery = useCallback(async (payload: UnifiedNotificationPayload) => {
    if (handledDeliveryIdsRef.current.has(payload.notificationId)) return;
    if (handledResponseNotificationIdsRef.current.has(payload.notificationId)) return;
    handledDeliveryIdsRef.current.add(payload.notificationId);

    if (
      payload.planId &&
      (
        payload.type === WALK_ALERT_NOTIFICATION_TYPE ||
        payload.type === WALK_READY_NOTIFICATION_TYPE ||
        payload.type === 'walk_nudge'
      )
    ) {
      try {
        await notificationPlanActions.markNotifiedIfPlanned(payload.planId);
      } catch (error) {
        if (__DEV__) console.error('Failed to mark delivered plan as notified:', error);
      }
    }

    if (payload.type === WALK_READY_NOTIFICATION_TYPE && payload.planId) {
      try {
        await notificationService.cancelNotification(getWalkAlertNotificationId(payload.planId));
        await notificationService.dismissNotification(getWalkAlertNotificationId(payload.planId));
      } catch {
        // Phase 1 may not exist
      }

      const promptDetails = await resolveWalkPromptDetails(payload.planId);
      if (promptDetails) {
        const { setPendingInAppWalkPrompt } = useAppStore.getState();
        setPendingInAppWalkPrompt(promptDetails);
      }
      await refreshDashboardSnapshot();
      return;
    }

    if (payload.type === 'walk_nudge' && payload.planId) {
      await refreshDashboardSnapshot();
    }
  }, [refreshDashboardSnapshot, resolveWalkPromptDetails]);

  useEffect(() => {
    if (!isNotificationsSupported) return;

    const responseSubscription = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        planId?: string;
        sessionId?: string;
      };
      void handleUnifiedNotificationResponse({
        notificationId: response.notification.request.identifier,
        actionIdentifier: response.actionIdentifier,
        type: data.type,
        planId: data.planId,
        sessionId: data.sessionId,
      });
    });

    void Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        if (!response) return;
        const responseKey =
          `${response.notification.request.identifier}:${response.actionIdentifier}`;
        try {
          const storedKey = await authStorage.getLastHandledNotificationKey();
          if (storedKey === responseKey) return;
        } catch { /* proceed */ }

        const data = response.notification.request.content.data as {
          type?: string;
          planId?: string;
          sessionId?: string;
        };
        void handleUnifiedNotificationResponse({
          notificationId: response.notification.request.identifier,
          actionIdentifier: response.actionIdentifier,
          type: data.type,
          planId: data.planId,
          sessionId: data.sessionId,
        });
        void authStorage.saveLastHandledNotificationKey(responseKey);
        const clearLastResponse = (Notifications as any).clearLastNotificationResponseAsync;
        if (typeof clearLastResponse === 'function') {
          void clearLastResponse();
        }
      })
      .catch((error) => {
        if (__DEV__) console.error('Failed to read last notification response:', error);
      });

    const receivedSubscription = notificationService.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data as {
        type?: string;
        planId?: string;
        sessionId?: string;
      };
      void handleUnifiedNotificationDelivery({
        notificationId: notification.request.identifier,
        type: data.type,
        planId: data.planId,
        sessionId: data.sessionId,
      });
    });

    const exactResponseSubscription = androidExactNotifications.isSupported()
      ? androidExactNotifications.subscribe((payload) => {
          void handleUnifiedNotificationResponse({
            notificationId: payload.notificationId,
            actionIdentifier: payload.actionIdentifier,
            type: payload.type,
            planId: payload.planId,
            sessionId: payload.sessionId,
          });
        })
      : null;

    const exactDeliverySubscription = androidExactNotifications.isSupported()
      ? androidExactNotifications.subscribeToDelivery((payload) => {
          void handleUnifiedNotificationDelivery({
            notificationId: payload.notificationId,
            type: payload.type,
            planId: payload.planId,
            sessionId: payload.sessionId,
          });
        })
      : null;

    if (androidExactNotifications.isSupported()) {
      void (async () => {
        try {
          const pendingExactResponse = await androidExactNotifications.consumePendingResponse();
          if (pendingExactResponse) {
            await handleUnifiedNotificationResponse({
              notificationId: pendingExactResponse.notificationId,
              actionIdentifier: pendingExactResponse.actionIdentifier,
              type: pendingExactResponse.type,
              planId: pendingExactResponse.planId,
              sessionId: pendingExactResponse.sessionId,
            });
          }

          const pendingExactDeliveries = await androidExactNotifications.consumePendingDeliveries();
          for (const pendingExactDelivery of pendingExactDeliveries) {
            await handleUnifiedNotificationDelivery({
              notificationId: pendingExactDelivery.notificationId,
              type: pendingExactDelivery.type,
              planId: pendingExactDelivery.planId,
              sessionId: pendingExactDelivery.sessionId,
            });
          }
        } catch (error) {
          if (__DEV__) console.error('Failed to consume pending exact notifications:', error);
        }
      })();
    }

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
      exactResponseSubscription?.remove();
      exactDeliverySubscription?.remove();
    };
  }, [handleUnifiedNotificationDelivery, handleUnifiedNotificationResponse]);

  const handleAndroidQuickEndCompletion = useCallback(async (payload: AndroidQuickEndPayload) => {
    setActiveWalkSnapshot(null);
    setPendingWalkPrompt(null);

    const existingSession = await sessionsRepo.getById(payload.sessionId);
    if (existingSession) {
      return;
    }

    const [plan, pauseEvents] = await Promise.all([
      payload.planId ? plansRepo.getById(payload.planId) : Promise.resolve(null),
      pauseEventsRepo.getBySessionId(payload.sessionId),
    ]);

    const session = buildWalkSessionFromAndroidCompletion(payload, {
      plan,
      fallbackPlanId: payload.planId,
      pauseCount: pauseEvents.length,
    });
    const resolvedSession = await persistCompletedWalkSession(session, {
      hadWalkingSignal: payload.hadWalkingSignal,
    });

    if (isNotificationsSupported) {
      await notificationService.showPostWalkSummaryNotification({
        sessionId: resolvedSession.id,
        durationSeconds: resolvedSession.activeSeconds,
        steps: resolvedSession.steps ?? 0,
        distanceMeters: resolvedSession.distanceMeters ?? 0,
        distanceUnit: payload.distanceUnit,
      });
    }

    analyticsService.track('walk_quick_end_completed', {
      planId: resolvedSession.nudgePlanId || null,
      activeSeconds: resolvedSession.activeSeconds,
      steps: resolvedSession.steps ?? 0,
      distanceMeters: Math.round(resolvedSession.distanceMeters ?? 0),
    });

    await refreshDashboardSnapshot();

    if (navigationRef.isReady()) {
      const currentRoute = navigationRef.getCurrentRoute();
      if (currentRoute?.name === 'Walking') {
        navigationRef.navigate('Dashboard', {
          showPostWalkSummary: true,
          postWalkSessionId: resolvedSession.id,
        });
      }
    }
  }, [refreshDashboardSnapshot, setActiveWalkSnapshot, setPendingWalkPrompt]);

  const initializeApp = async () => {
    try {
      let hasRestoredAuthenticatedSession = false;

      try {
        await Font.loadAsync(appFontAssets);
      } catch (e) {
        if (__DEV__) console.warn('Failed to load app fonts:', e);
      }

      // Initialize database
      await getDatabase();

      // Recover any walk session orphaned by a force-kill, and dismiss the
      // stale walk-session notification that would still be in the shade.
      try {
        if (androidWalkTracking.isSupported()) {
          const snapshot = await androidWalkTracking.getSnapshot();
          if (snapshot) {
            setActiveWalkSnapshot(snapshot);
            setPendingWalkPrompt(snapshot.prompt ?? null);
            pendingRootRouteRef.current = {
              name: 'Walking',
              params: {
                planId: snapshot.planId,
                prompt: snapshot.prompt,
                startedFromNotification: snapshot.startedFromNotification ?? false,
              },
            };
          } else {
            if (isNotificationsSupported) {
              void notificationService.dismissWalkSessionNotification();
            }
          }
        } else {
          const recovered = await recoverOrphanedSession();
          if (recovered) {
            analyticsService.track('walk_session_recovered', {
              activeSeconds: recovered.activeSeconds,
              distanceMeters: recovered.distanceMeters ?? 0,
              steps: recovered.steps ?? 0,
            });
            // Sync the recovered session to the backend
            void runBackendSync();
          }
          if (isNotificationsSupported) {
            void notificationService.dismissWalkSessionNotification();
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('Failed to recover orphaned session:', e);
      }

      // Restore auth session.
      // Firebase persists the session natively. We still enforce a 30 day
      // re-authentication limit via local metadata.
      try {
        const storedUser = await authStorage.getUser();
        if (storedUser) setAuthUser(storedUser);

        await firebaseAuthService.waitForAuthReady();
        const currentUser = firebaseAuthService.getCurrentUser();
        if (currentUser) {
          setAuthUser(currentUser);
          await authStorage.saveUser(currentUser);
        }

        const lastLoginAt = await authStorage.getLastLoginAt();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const sessionExpired =
          !lastLoginAt ||
          Date.now() - new Date(lastLoginAt).getTime() > thirtyDaysMs;

        if (sessionExpired) {
          await firebaseAuthService.signOut();
          await authStorage.clearAll();
          setAuthUser(null);
        } else if (currentUser && !requiresEmailVerification(currentUser)) {
          setIsAuthenticated(true);
          hasRestoredAuthenticatedSession = true;
        } else {
          setIsAuthenticated(false);
        }
      } catch (e) {
        if (__DEV__) console.warn('Failed to restore auth session:', e);
      }

      try {
        const storedDisplayName = await authStorage.getProfileDisplayName();
        if (storedDisplayName) {
          setProfileDisplayName(storedDisplayName);
        }
      } catch (e) {
        if (__DEV__) console.warn('Failed to restore profile display name:', e);
      }

      // Restore UI settings (theme + language)
      try {
        const storedTheme = await authStorage.getThemeMode();
        if (storedTheme) setThemeMode(storedTheme);
        const storedLang = await authStorage.getLanguage();
        if (storedLang) setLanguage(storedLang);
        const storedNotificationTimerMode = await authStorage.getNotificationTimerMode();
        if (storedNotificationTimerMode) setNotificationTimerMode(storedNotificationTimerMode);
        const storedNotificationStatsMode = await authStorage.getNotificationStatsMode();
        if (storedNotificationStatsMode) setNotificationStatsMode(storedNotificationStatsMode);
        const storedEndWalkMode = await authStorage.getEndWalkMode();
        if (storedEndWalkMode) {
          setEndWalkMode(storedEndWalkMode);
          if (Platform.OS === 'android' && androidWalkTracking.isSupported()) {
            void androidWalkTracking.setEndWalkMode(storedEndWalkMode);
          }
        }
        const storedCards = await authStorage.getWalkDisplayCards();
        if (storedCards && storedCards.length >= 2) {
          const valid = storedCards.filter((c): c is WalkDisplayCard =>
            ALL_WALK_DISPLAY_CARDS.includes(c as WalkDisplayCard),
          );
          if (valid.length >= 2) setWalkDisplayCards(valid);
        }
      } catch (e) {
        if (__DEV__) console.warn('Failed to restore UI settings:', e);
      }

      // Load guidance "seen" flags so hint cards render correctly on first frame
      let guidanceFlags = emptyGuidanceFlags;
      try {
        const flags = await guidanceStorage.loadAll();
        guidanceFlags = flags;
        setAllGuidanceSeen(flags);
      } catch (e) {
        if (__DEV__) console.warn('Failed to load guidance flags:', e);
      }

      // Check if user has completed onboarding (preferences saved).
      // If preferences exist but no schedule source (e.g. old install or edge case),
      // create a default manual source so we open to Dashboard.
      const prefsExist = await preferencesRepo.exists();
      let sourceExists = await scheduleSourceRepo.exists();
      const shouldResetIncompleteOnboarding =
        Platform.OS !== 'web' &&
        !guidanceFlags.dashboard_welcome &&
        (prefsExist || sourceExists);

      if (shouldResetIncompleteOnboarding) {
        await resetIncompleteOnboarding();
        return;
      }

      if (prefsExist && !sourceExists) {
        await scheduleSourceRepo.save({
          type: 'manual',
          lastImportedAt: new Date().toISOString(),
        });
        sourceExists = true;
      }

      if (prefsExist && sourceExists) {
        setHasCompletedOnboarding(true);
        setHasSetPreferences(true);

        // Load preferences and source into store
        const prefs = await preferencesRepo.get();
        const source = await scheduleSourceRepo.get();
        setPreferences(prefs);
        setScheduleSource(source);
        await refreshDashboardSnapshot();
        void runScheduledNotificationRecovery({
          force: true,
          refreshDashboard: true,
          reason: 'app_init',
        });
        if (hasRestoredAuthenticatedSession) {
          const notificationPermission = await getNotificationPermissionState();
          if (notificationPermission.granted) {
            void registerCurrentDeviceForNotifications();
          }
        }
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to initialize app:', error);
      analyticsService.track('app_init_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';
  const canOpenDashboard = isAuthenticated && hasCompletedOnboarding;
  const showBootScreen = !isBootstrapDone || !isBootGreetingDone;

  // Fade in main app when bootstrap finishes
  useEffect(() => {
    if (showBootScreen) return;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, showBootScreen]);

  // Android: require a double-press to exit only when already at app root.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigationRef.isReady()) return false;
      if (navigationRef.canGoBack()) return false;

      const routeName = navigationRef.getCurrentRoute()?.name;
      if (routeName !== 'Intro' && routeName !== 'Dashboard') return false;

      const now = Date.now();
      if (now - lastAndroidRootBackPressRef.current < ROOT_BACK_EXIT_WINDOW_MS) {
        lastAndroidRootBackPressRef.current = 0;
        return false;
      }

      lastAndroidRootBackPressRef.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!androidWalkTracking.isSupported()) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;

      void (async () => {
        const snapshot = await androidWalkTracking.getSnapshot();
        setActiveWalkSnapshot(snapshot);
        setPendingWalkPrompt(snapshot?.prompt ?? null);
        if (snapshot) {
          navigateToActiveWalk({
            planId: snapshot.planId,
            prompt: snapshot.prompt,
            startedFromNotification: snapshot.startedFromNotification ?? false,
          });
        }
      })();
    });

    return () => subscription.remove();
  }, [navigateToActiveWalk, setActiveWalkSnapshot, setPendingWalkPrompt]);

  // Listen for Android quick-end walk events (End Walk from notification in quick mode)
  useEffect(() => {
    if (!androidWalkTracking.isSupported()) return;

    void (async () => {
      try {
        const pendingQuickEnd = await androidWalkTracking.consumePendingQuickEndCompletion();
        if (pendingQuickEnd) {
          await handleAndroidQuickEndCompletion(pendingQuickEnd);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to consume pending quick-end completion:', error);
      }
    })();

    const subscription = androidWalkTracking.subscribeToQuickEnd((payload) => {
      void handleAndroidQuickEndCompletion(payload);
    });

    return () => subscription.remove();
  }, [handleAndroidQuickEndCompletion]);

  // Sync unsynchronised local data to the backend whenever the app comes to foreground.
  // Throttled to at most once every 5 minutes to avoid hammering the API.
  const lastSyncAtRef = useRef<number>(0);
  useEffect(() => {
    const SYNC_THROTTLE_MS = 5 * 60 * 1000;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const now = Date.now();
      if (now - lastSyncAtRef.current < SYNC_THROTTLE_MS) return;
      lastSyncAtRef.current = now;
      void runScheduledNotificationRecovery({
        reason: 'app_foreground',
      });
      void runBackendSync();
    });
    return () => subscription.remove();
  }, [runScheduledNotificationRecovery]);

  if (showBootScreen) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SafeAreaProvider>
          <View style={[styles.bootRoot, { backgroundColor: palette.bgApp }]}>
            <Animated.View
              style={[
                styles.bootHero,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [0.35, 1],
                    outputRange: [0.82, 1],
                  }),
                  transform: [{
                    scale: pulseAnim.interpolate({
                      inputRange: [0.35, 1],
                      outputRange: [0.985, 1.015],
                    }),
                  }],
                },
              ]}
            >
              <View
                style={[
                  styles.bootLogoTile,
                  {
                    backgroundColor: isDark ? BOOT_BRAND_TILE_DARK : BOOT_BRAND_TILE_LIGHT,
                    borderColor: isDark ? 'rgba(46,233,166,0.24)' : 'rgba(15,23,42,0.14)',
                    shadowColor: isDark ? BOOT_BRAND_MARK_DARK : '#0f172a',
                  },
                ]}
              >
                <Image
                  source={BOOT_BRAND_MARK}
                  resizeMode="contain"
                  style={[
                    styles.bootLogoMark,
                    {
                      tintColor: isDark ? BOOT_BRAND_MARK_DARK : BOOT_BRAND_MARK_LIGHT,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.bootGreeting, { color: palette.textPrimary }]}>
                {bootGreetingText || ' '}
              </Text>
            </Animated.View>
          </View>
        </SafeAreaProvider>
      </>
    );
  }

  return (
    <>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaProvider>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <NavigationContainer
            ref={navigationRef}
            onReady={() => {
              const pendingRoute = pendingRootRouteRef.current;
              if (pendingRoute && navigationRef.isReady()) {
                if (pendingRoute.name === 'Walking') {
                  navigationRef.navigate('Walking', pendingRoute.params);
                } else {
                  navigationRef.navigate('Dashboard', pendingRoute.params);
                }
                pendingRootRouteRef.current = null;
              }
            }}
          >
            <Stack.Navigator
              key={
                canOpenDashboard
                  ? 'authed-onboarded'
                  : isAuthenticated
                    ? 'authed-fresh'
                    : 'guest'
              }
              initialRouteName={
                canOpenDashboard ? 'Dashboard' : 'Intro'
              }
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.bgApp },
                animation: 'slide_from_right',
                gestureEnabled: true,
                freezeOnBlur: true,
              }}
            >
              <Stack.Screen
                name="Intro"
                children={(props) => (
                  <IntroScreen
                    {...props}
                    isAuthenticated={isAuthenticated}
                    onAuthenticated={() => {
                      setIsAuthenticated(true);
                      // Register device + timezone with backend on fresh login
                      void registerCurrentDeviceForNotifications();
                    }}
                  />
                )}
              />
              <Stack.Screen name="ScheduleSetup" component={ScheduleSetupScreen} />
              <Stack.Screen name="ManualSchedule" component={ManualScheduleScreen} />
              <Stack.Screen name="Preferences" component={PreferencesScreen} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ animation: 'fade_from_bottom' }} />
              <Stack.Screen name="Walking" component={WalkingScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="WeeklyData" component={WeeklyDataScreen} />
              <Stack.Screen name="Achievements" component={AchievementsScreen} />
              <Stack.Screen name="AboutHelp" component={AboutHelpScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </Animated.View>
      </SafeAreaProvider>
    </>
  );
}

const styles = StyleSheet.create({
  bootRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  bootHero: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 164,
    width: '100%',
  },
  bootLogoTile: {
    width: 82,
    height: 82,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  bootLogoMark: {
    width: 36,
    height: 36,
  },
  bootGreeting: {
    marginTop: 20,
    minHeight: 38,
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 36,
    fontFamily: appFontFamily.semibold,
    letterSpacing: 0.2,
  },
});
