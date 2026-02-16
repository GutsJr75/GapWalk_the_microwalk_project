import React, { useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
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
import { notificationPlanActions } from './src/lib/notificationPlanActions';
import { crashReporting } from './src/lib/crashReporting';
import { analyticsService } from './src/lib/analytics';

// Screens
import { IntroScreen } from './src/screens/IntroScreen';
import { ScheduleSetupScreen } from './src/screens/ScheduleSetupScreen';
import { ManualScheduleScreen } from './src/screens/ManualScheduleScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { WalkingScreen } from './src/screens/WalkingScreen';
import { ScheduleOverviewScreen } from './src/screens/ScheduleOverviewScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

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
    setUpcomingPlans,
    themeMode,
  } = useAppStore();
  const pendingWalkPlanIdRef = useRef<string | null>(null);
  const lastHandledResponseRef = useRef<string | null>(null);

  useEffect(() => {
    crashReporting.install();
    initializeApp();
  }, []);

  const refreshDashboardSnapshot = useCallback(async () => {
    const mins = await sessionsRepo.getTodayMinutes();
    const notifiedCount = await plansRepo.getTodayNotifiedCount();
    const upcoming = await plansRepo.getUpcomingPlans(20);
    setTodayStats(mins, notifiedCount);
    setUpcomingPlans(upcoming);
  }, [setTodayStats, setUpcomingPlans]);

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
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      analyticsService.track('app_init_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const palette = getThemePalette(themeMode);

  return (
    <>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaProvider>
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
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </>
  );
}
