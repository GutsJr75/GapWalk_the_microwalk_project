import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from './src/lib/db';
import { useAppStore } from './src/store';
import { preferencesRepo } from './src/lib/repositories/preferencesRepo';
import { plansRepo } from './src/lib/repositories/plansRepo';
import { scheduleSourceRepo } from './src/lib/repositories/scheduleSourceRepo';
import { sessionsRepo } from './src/lib/repositories/sessionsRepo';
import { getThemePalette } from './src/theme/palette';
import {
  isNotificationsSupported,
  notificationService,
  WALK_NUDGE_ACTION_SKIP,
  WALK_NUDGE_ACTION_START,
} from './src/lib/notifications';
import { recoverOrphanedSession } from './src/lib/walkCheckpoint';
import { notificationPlanActions } from './src/lib/notificationPlanActions';
import { crashReporting } from './src/lib/crashReporting';
import { analyticsService } from './src/lib/analytics';
import { requestAllPermissions } from './src/lib/permissions';

// Screens
import { IntroScreen } from './src/screens/IntroScreen';
import { ScheduleSetupScreen } from './src/screens/ScheduleSetupScreen';
import { ManualScheduleScreen } from './src/screens/ManualScheduleScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { WalkingScreen } from './src/screens/WalkingScreen';
import { ScheduleOverviewScreen } from './src/screens/ScheduleOverviewScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WeeklyDataScreen } from './src/screens/WeeklyDataScreen';

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
    }
    | undefined;
  Preferences:
    | {
      skipScheduleSource?: boolean;
      manageMode?: boolean;
    }
    | undefined;
  Dashboard: undefined;
  Walking: { planId?: string };
  ScheduleOverview: undefined;
  Settings: undefined;
  WeeklyData: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const {
    hasCompletedOnboarding,
    setHasCompletedOnboarding,
    setPreferences,
    setScheduleSource,
    setTodayStats,
    setTodaySteps,
    setUpcomingPlans,
    setHasLocationPermission,
    setHasNotificationPermission,
    setHasActivityPermission,
    setHasRequestedPermissions,
    hasRequestedPermissions,
    themeMode,
  } = useAppStore();
  const pendingWalkPlanIdRef = useRef<string | null>(null);
  const lastHandledResponseRef = useRef<string | null>(null);
  const [isBootstrapDone, setIsBootstrapDone] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Hide native splash immediately so the app starts from our UI (no splash screen).
  useEffect(() => {
    if (Platform.OS !== 'web') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  // Small pulse on the loading dot while bootstrap runs
  useEffect(() => {
    if (isBootstrapDone) return;
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
  }, [isBootstrapDone, pulseAnim]);

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

  const refreshDashboardSnapshot = useCallback(async () => {
    const mins = await sessionsRepo.getTodayMinutes();
    const notifiedCount = await plansRepo.getTodayNotifiedCount();
    const upcoming = await plansRepo.getUpcomingPlans(20);
    const stepsToday = await sessionsRepo.getTodaySteps();
    setTodayStats(mins, notifiedCount, stepsToday);
    setUpcomingPlans(upcoming);
  }, [setTodayStats, setTodaySteps, setUpcomingPlans]);

  const handleWalkNudgeResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as { type?: string; planId?: string };
    if (data.type !== 'walk_nudge' || !data.planId) return;

    const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (lastHandledResponseRef.current === responseKey) return;
    lastHandledResponseRef.current = responseKey;

    try {
      const actionId = response.actionIdentifier;
      if (actionId === WALK_NUDGE_ACTION_SKIP) {
        await notificationPlanActions.skipGap(data.planId);
        await refreshDashboardSnapshot();
        return;
      }

      if (
        actionId !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
        actionId !== WALK_NUDGE_ACTION_START
      ) {
        return;
      }

      const startCheck = await notificationPlanActions.canStartPlan(data.planId);
      await refreshDashboardSnapshot();
      if (!startCheck.allowed) return;

      if (navigationRef.isReady()) {
        navigationRef.navigate('Walking', { planId: data.planId });
      } else {
        pendingWalkPlanIdRef.current = data.planId;
      }
    } catch (error) {
      console.error('Failed to process notification response:', error);
    }
  }, [refreshDashboardSnapshot]);

  useEffect(() => {
    if (!isNotificationsSupported) return;

    const responseSubscription = notificationService.addNotificationResponseListener((response) => {
      void handleWalkNudgeResponse(response);
    });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          void handleWalkNudgeResponse(response);
          const clearLastResponse = (Notifications as any).clearLastNotificationResponseAsync;
          if (typeof clearLastResponse === 'function') {
            void clearLastResponse();
          }
        }
      })
      .catch((error) => {
        console.error('Failed to read last notification response:', error);
      });

    const receivedSubscription = notificationService.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data as { type?: string; planId?: string };
      if (data.type !== 'walk_nudge' || !data.planId) return;

      try {
        await notificationPlanActions.markNotifiedIfPlanned(data.planId);
        await refreshDashboardSnapshot();
      } catch (error) {
        console.error('Failed to process foreground notification:', error);
      }
    });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [handleWalkNudgeResponse, refreshDashboardSnapshot]);

  const initializeApp = async () => {
    try {
      // Initialize database
      await getDatabase();

      // Recover any walk session orphaned by a force-kill, and dismiss the
      // stale walk-session notification that would still be in the shade.
      try {
        const recovered = await recoverOrphanedSession();
        if (recovered) {
          analyticsService.track('walk_session_recovered', {
            activeSeconds: recovered.activeSeconds,
            distanceMeters: recovered.distanceMeters ?? 0,
            steps: recovered.steps ?? 0,
          });
        }
        // Always dismiss — in case the app was killed before cleanup ran
        if (isNotificationsSupported) {
          void notificationService.dismissWalkSessionNotification();
        }
      } catch (e) {
        if (__DEV__) console.warn('Failed to recover orphaned session:', e);
      }
      
      // Check if user has completed onboarding
      const prefsExist = await preferencesRepo.exists();
      const sourceExists = await scheduleSourceRepo.exists();
      
      if (prefsExist && sourceExists) {
        setHasCompletedOnboarding(true);
        
        // Load preferences and source into store
        const prefs = await preferencesRepo.get();
        const source = await scheduleSourceRepo.get();
        setPreferences(prefs);
        setScheduleSource(source);
        await refreshDashboardSnapshot();

        // Request all permissions on first launch after onboarding
        if (!hasRequestedPermissions) {
          void (async () => {
            try {
              const permResults = await requestAllPermissions();
              setHasLocationPermission(permResults.location);
              setHasNotificationPermission(permResults.notifications);
              setHasActivityPermission(permResults.activityRecognition);
              setHasRequestedPermissions(true);
            } catch (e) {
              console.warn('Permission request during init failed:', e);
            }
          })();
        }
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      analyticsService.track('app_init_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';

  // Fade in main app when bootstrap finishes
  useEffect(() => {
    if (!isBootstrapDone) return;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [isBootstrapDone, fadeAnim]);

  if (!isBootstrapDone) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SafeAreaProvider>
          <View style={[styles.bootRoot, { backgroundColor: palette.bgApp }]}>
            <Animated.View
              style={[
                styles.bootDot,
                {
                  backgroundColor: isDark ? '#2ee9a6' : '#16a34a',
                  opacity: pulseAnim.interpolate({
                    inputRange: [0.35, 1],
                    outputRange: [0.2, 0.7],
                  }),
                },
              ]}
            />
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
              const pendingPlanId = pendingWalkPlanIdRef.current;
              if (pendingPlanId && navigationRef.isReady()) {
                navigationRef.navigate('Walking', { planId: pendingPlanId });
                pendingWalkPlanIdRef.current = null;
              }
            }}
          >
            <Stack.Navigator
              key={hasCompletedOnboarding ? 'onboarded' : 'fresh'}
              initialRouteName={hasCompletedOnboarding ? 'Dashboard' : 'Intro'}
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.bgApp },
                animation: 'slide_from_right',
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="Intro" component={IntroScreen} />
              <Stack.Screen name="ScheduleSetup" component={ScheduleSetupScreen} />
              <Stack.Screen name="ManualSchedule" component={ManualScheduleScreen} />
              <Stack.Screen name="Preferences" component={PreferencesScreen} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="Walking" component={WalkingScreen} />
              <Stack.Screen name="ScheduleOverview" component={ScheduleOverviewScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="WeeklyData" component={WeeklyDataScreen} />
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
  },
  bootDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
