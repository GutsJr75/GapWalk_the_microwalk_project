import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Image, Platform, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from './src/data/db';
import { useAppStore } from './src/store';
import { preferencesRepo } from './src/data/repositories/preferencesRepo';
import { plansRepo } from './src/data/repositories/plansRepo';
import { scheduleSourceRepo } from './src/data/repositories/scheduleSourceRepo';
import { sessionsRepo } from './src/data/repositories/sessionsRepo';
import { appFontAssets, appFontFamily } from './src/theme';
import { getThemePalette } from './src/theme/palette';
import {
  isNotificationsSupported,
  notificationService,
  WALK_NUDGE_ACTION_SKIP,
  WALK_NUDGE_ACTION_START,
  ALT_GAP_ACTION_ACCEPT,
  ALT_GAP_ACTION_DECLINE,
} from './src/services/notifications';
import { recoverOrphanedSession } from './src/services/walkCheckpoint';
import { notificationPlanActions } from './src/services/notificationPlanActions';
import { crashReporting } from './src/services/crashReporting';
import { analyticsService } from './src/services/analytics';
import { androidWalkTracking } from './src/services/androidWalkTracking';
import { requestAllPermissions } from './src/services/permissions';
import { authStorage } from './src/data/authStorage';

// Screens
import { IntroScreen } from './src/screens/IntroScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ScheduleSetupScreen } from './src/screens/ScheduleSetupScreen';
import { ManualScheduleScreen } from './src/screens/ManualScheduleScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { WalkingScreen } from './src/screens/WalkingScreen';
import { ScheduleOverviewScreen } from './src/screens/ScheduleOverviewScreen';
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
    }
    | undefined;
  Preferences:
    | {
      skipScheduleSource?: boolean;
      manageMode?: boolean;
    }
    | undefined;
  Dashboard: { openMenu?: boolean; showPostWalkSummary?: boolean } | undefined;
  Walking: { planId?: string; prompt?: 'end_confirmation' } | undefined;
  ScheduleOverview: undefined;
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
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
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
    setHasLocationPermission,
    setHasNotificationPermission,
    setHasActivityPermission,
    setHasRequestedPermissions,
    hasRequestedPermissions,
    themeMode,
    setThemeMode,
    setLanguage,
    isAuthenticated,
    setIsAuthenticated,
    setAuthUser,
    setProfileDisplayName,
    setActiveWalkSnapshot,
    setPendingWalkPrompt,
  } = useAppStore();
  const pendingWalkPlanIdRef = useRef<string | null>(null);
  const pendingWalkRouteRef = useRef<{ planId?: string; prompt?: 'end_confirmation' } | null>(null);
  const lastHandledResponseRef = useRef<string | null>(null);
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

  // Hide native splash immediately so the app starts from our UI (no splash screen).
  useEffect(() => {
    if (Platform.OS !== 'web') {
      SplashScreen.hideAsync().catch(() => {});
    }
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

  const refreshDashboardSnapshot = useCallback(async () => {
    const mins = await sessionsRepo.getTodayMinutes();
    const notifiedCount = await plansRepo.getTodayNotifiedCount();
    const upcoming = await plansRepo.getUpcomingPlans(20);
    const stepsToday = await sessionsRepo.getTodaySteps();
    setTodayStats(mins, notifiedCount, stepsToday);
    setUpcomingPlans(upcoming);
  }, [setTodayStats, setTodaySteps, setUpcomingPlans]);

  const navigateToActiveWalk = useCallback((params: { planId?: string; prompt?: 'end_confirmation' }) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Walking', params);
      return;
    }
    pendingWalkRouteRef.current = params;
  }, []);

  const handleNotificationResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as { type?: string; planId?: string };
    if (!data.planId) return;

    const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (lastHandledResponseRef.current === responseKey) return;
    lastHandledResponseRef.current = responseKey;

    // Dismiss the notification from the tray on any action
    try {
      await Notifications.dismissNotificationAsync(response.notification.request.identifier);
    } catch { /* already dismissed */ }

    try {
      // Handle alternative gap suggestion responses
      if (data.type === 'alt_gap_suggestion') {
        const actionId = response.actionIdentifier;
        if (actionId === ALT_GAP_ACTION_ACCEPT) {
          await notificationPlanActions.acceptAlternativeGap(data.planId);
          await refreshDashboardSnapshot();
        } else {
          // "No" button, or tapping notification body — decline
          await notificationPlanActions.declineAlternativeGap(data.planId);
        }
        return;
      }

      // Handle walk nudge responses
      if (data.type !== 'walk_nudge') return;

      const actionId = response.actionIdentifier;
      if (actionId === WALK_NUDGE_ACTION_SKIP) {
        await notificationPlanActions.skipPlan(data.planId);
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
      if (__DEV__) console.error('Failed to process notification response:', error);
    }
  }, [refreshDashboardSnapshot]);

  useEffect(() => {
    if (!isNotificationsSupported) return;

    const responseSubscription = notificationService.addNotificationResponseListener((response) => {
      void handleNotificationResponse(response);
    });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          void handleNotificationResponse(response);
          const clearLastResponse = (Notifications as any).clearLastNotificationResponseAsync;
          if (typeof clearLastResponse === 'function') {
            void clearLastResponse();
          }
        }
      })
      .catch((error) => {
        if (__DEV__) console.error('Failed to read last notification response:', error);
      });

    const receivedSubscription = notificationService.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data as { type?: string; planId?: string };
      if (data.type !== 'walk_nudge' || !data.planId) return;

      try {
        await notificationPlanActions.markNotifiedIfPlanned(data.planId);
        await refreshDashboardSnapshot();
      } catch (error) {
        if (__DEV__) console.error('Failed to process foreground notification:', error);
      }
    });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [handleNotificationResponse, refreshDashboardSnapshot]);

  const initializeApp = async () => {
    try {
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
            pendingWalkRouteRef.current = {
              planId: snapshot.planId,
              prompt: snapshot.prompt,
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
          }
          if (isNotificationsSupported) {
            void notificationService.dismissWalkSessionNotification();
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('Failed to recover orphaned session:', e);
      }
      
      // Restore auth session if "remember me" was enabled
      try {
        const rememberMe = await authStorage.getRememberMe();
        if (rememberMe) {
          const storedToken = await authStorage.getToken();
          const storedUser = await authStorage.getUser();
          if (storedToken) {
            setIsAuthenticated(true);
            if (storedUser) setAuthUser(storedUser);
          }
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
      } catch (e) {
        if (__DEV__) console.warn('Failed to restore UI settings:', e);
      }

      // Check if user has completed onboarding (preferences saved).
      // If preferences exist but no schedule source (e.g. old install or edge case),
      // create a default manual source so we open to Dashboard.
      const prefsExist = await preferencesRepo.exists();
      let sourceExists = await scheduleSourceRepo.exists();
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

        // Request permissions (notifications + activity for steps; no location for now)
        if (!hasRequestedPermissions) {
          void (async () => {
            try {
              const permResults = await requestAllPermissions();
              setHasNotificationPermission(permResults.notifications);
              setHasActivityPermission(permResults.activityRecognition);
              setHasRequestedPermissions(true);
            } catch (e) {
              if (__DEV__) console.warn('Permission request during init failed:', e);
            }
          })();
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
          navigateToActiveWalk({ planId: snapshot.planId, prompt: snapshot.prompt });
        }
      })();
    });

    return () => subscription.remove();
  }, [navigateToActiveWalk, setActiveWalkSnapshot, setPendingWalkPrompt]);

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
              const pendingWalkRoute = pendingWalkRouteRef.current;
              if (pendingWalkRoute && navigationRef.isReady()) {
                navigationRef.navigate('Walking', pendingWalkRoute);
                pendingWalkRouteRef.current = null;
              }
              const pendingPlanId = pendingWalkPlanIdRef.current;
              if (pendingPlanId && navigationRef.isReady()) {
                navigationRef.navigate('Walking', { planId: pendingPlanId });
                pendingWalkPlanIdRef.current = null;
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
              }}
            >
              <Stack.Screen
                name="Intro"
                children={(props) => (
                  <IntroScreen
                    {...props}
                    isAuthenticated={isAuthenticated}
                    onAuthenticated={() => setIsAuthenticated(true)}
                  />
                )}
              />
              <Stack.Screen name="ScheduleSetup" component={ScheduleSetupScreen} />
              <Stack.Screen name="ManualSchedule" component={ManualScheduleScreen} />
              <Stack.Screen name="Preferences" component={PreferencesScreen} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ animation: 'fade_from_bottom' }} />
              <Stack.Screen name="Walking" component={WalkingScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="ScheduleOverview" component={ScheduleOverviewScreen} />
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
