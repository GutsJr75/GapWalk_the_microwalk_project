import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Animated, Easing, LayoutAnimation, useWindowDimensions, Platform, InteractionManager, Dimensions, AppState } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { StatCard } from '../components/StatCard';
import { GapItem } from '../components/GapItem';
import { Card } from '../components/Card';
import { AppIcon } from '../components/AppIcon';
import { WalkCompletionSummary } from '../components/WalkCompletionSummary';
import { theme } from '../theme';
import { withAlpha } from '../theme/colorUtils';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { preferencesRepo } from '../data/repositories/preferencesRepo';
import { plansRepo } from '../data/repositories/plansRepo';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { eventsRepo } from '../data/repositories/eventsRepo';
import { achievementsRepo, type UnlockedAchievement, type AchievementId } from '../data/repositories/achievementsRepo';
import { gapEngine } from '../services/gapEngine';
import {
  getPlanNotifyTime,
  isNotificationsSupported,
  normalizeManualNotifyLeadMinutes,
  notificationService,
} from '../services/notifications';
import { notificationPlanActions } from '../services/notificationPlanActions';
import { analyticsService } from '../services/analytics';
import { NudgePlan, Preferences, WalkSession } from '../types';
import { calculateStreak, calculateWeeklyStats, getMotivationalMessage, StreakData, WeeklyStats } from '../utils/statsUtils';
import { addMinutes, format, isAfter, isBefore, parseISO, subMinutes, subDays } from 'date-fns';
import { timeUtils } from '../utils/time';
import {
  getNotificationPermissionState,
  openAppSettings,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../services/permissions';
import { toUserFriendlyError } from '../utils/errorMessages';
import { authStorage } from '../data/authStorage';
import { firebaseAuthService } from '../services/firebaseAuth';
import { guidanceStorage } from '../data/guidanceStorage';
import { SuccessToast } from '../components/SuccessToast';
import { Modal as AppModal } from '../components/Modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { androidExactNotifications } from '../services/androidExactNotifications';
import { registerCurrentDeviceForNotifications } from '../services/deviceRegistration';

// Extracted dashboard components
import { StreakCard } from './dashboard/StreakCard';
import { YesterdayCard } from './dashboard/YesterdayCard';
import { WeeklyStatsCard } from './dashboard/WeeklyStatsCard';
import { CelebrationOverlay } from './dashboard/CelebrationOverlay';
import { AchievementsSection } from './dashboard/AchievementsSection';
import { CompletedPlansSection } from './dashboard/CompletedPlansSection';
import { MissedPlansSection } from './dashboard/MissedPlansSection';
import { BadgeUnlockedModal } from './dashboard/BadgeUnlockedModal';
import { SideMenu, type SideMenuItem } from './dashboard/SideMenu';
import { WalkTimeModal } from './dashboard/WalkTimeModal';
import { DASHBOARD_TOUR_STEPS, TourOverlay, TourTargetRef } from '../tour';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

/** Convert "HH:mm" 24-hour string to "h:mm AM/PM" */
const formatTime12 = (t: string): string => {
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts.length > 1 ? parts[1] : '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m} ${period}`;
};

interface PlanOpportunity {
  key: string;
  plan: NudgePlan;
  timeRange: string;
  walkWindowLabel: string;
  notifyLabel: string;
}

type TimePeriod = 'AM' | 'PM';
type ManualReminderChoice = 'atTime' | '5min' | '10min';

const MENU_WIDTH_RATIO = 0.78;
const MENU_MAX_WIDTH = 360;

const MANUAL_REMINDER_OPTIONS: Array<{ value: ManualReminderChoice; label: string }> = [
  { value: 'atTime', label: 'At walk time' },
  { value: '5min', label: '5 minutes before' },
  { value: '10min', label: '10 minutes before' },
];

const getManualReminderChoiceFromLead = (leadMinutes?: number | null): ManualReminderChoice => {
  const normalizedLead = normalizeManualNotifyLeadMinutes(leadMinutes);
  if (normalizedLead === 10) return '10min';
  if (normalizedLead === 5) return '5min';
  return 'atTime';
};

const getManualReminderLeadFromChoice = (choice: ManualReminderChoice): number => {
  if (choice === '10min') return 10;
  if (choice === '5min') return 5;
  return 0;
};

const getDefaultManualReminderChoice = (prefs?: Preferences | null): ManualReminderChoice => {
  if (prefs?.whenToNotify === 'delay') {
    return getManualReminderChoiceFromLead(prefs.notifyDelayMinutes);
  }
  return 'atTime';
};

const getPlanWalkEnd = (plan: NudgePlan): Date => {
  const walkStart = parseISO(plan.walkStart);
  const rawWalkEnd = addMinutes(walkStart, Math.max(1, plan.suggestedDurationMinutes));
  const gapEnd = parseISO(plan.gapEnd);
  return isAfter(rawWalkEnd, gapEnd) ? gapEnd : rawWalkEnd;
};

const to12HourParts = (iso: string): { hour: string; minute: string; period: TimePeriod } => {
  const date = parseISO(iso);
  const period: TimePeriod = date.getHours() >= 12 ? 'PM' : 'AM';
  const hour12 = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  return {
    hour: String(hour12).padStart(2, '0'),
    minute: String(date.getMinutes()).padStart(2, '0'),
    period,
  };
};

const BurgerIcon = ({
  onPress,
  testID,
}: {
  onPress: () => void;
  testID?: string;
}) => (
  <IconButton
    onPress={onPress}
    iconName="menu"
    variant="secondary"
    size="icon"
    testID={testID}
    accessibilityLabel={testID ?? 'Open menu'}
  />
);



const DashboardScreenInner: React.FC<Props> = ({ navigation, route }) => {
  const {
    preferences, setPreferences, hasSetPreferences, setHasSetPreferences,
    todayMinutesWalked, todayNotificationCount, upcomingPlans,
    todaySteps, setTodaySteps,
    setTodayStats, setUpcomingPlans,
    themeMode, language,
    authUser,
    profileDisplayName,
    isAuthenticated,
    hasCompletedOnboarding,
    setIsAuthenticated,
    setAuthUser,
    guidanceSeen,
    setGuidanceSeen,
    pendingInAppWalkPrompt,
    setPendingInAppWalkPrompt,
    activeWalkSnapshot,
    distanceUnit,
  } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuSlide = useRef(new Animated.Value(0)).current;
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({
    weekStart: '', weekEnd: '', totalMinutes: 0, totalSteps: 0,
    totalSessions: 0, totalDistance: 0, totalCalories: 0, daysActive: 0,
  });
  const prevWeeklyStatsRef = useRef<WeeklyStats | null>(null);
  const [prevWeeklyStats, setPrevWeeklyStats] = useState<WeeklyStats | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationAnim = useRef(new Animated.Value(0)).current;
  const previousMinutesRef = useRef<number | null>(null);
  const lastCelebratedDateRef = useRef<string | null>(null);
  const { width, height } = useWindowDimensions();
  const menuPanelWidth = Math.min(Math.round(width * MENU_WIDTH_RATIO), MENU_MAX_WIDTH);
  const dashboardScrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const [unlockedAchievements, setUnlockedAchievements] = useState<UnlockedAchievement[]>([]);
  const [newBadgeIds, setNewBadgeIds] = useState<AchievementId[]>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [showDashboardTour, setShowDashboardTour] = useState(false);
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const [yesterdayMinutes, setYesterdayMinutes] = useState<number | null>(null);
  const [completedPlans, setCompletedPlans] = useState<NudgePlan[]>([]);
  const [missedPlans, setMissedPlans] = useState<NudgePlan[]>([]);
  // Staggered card entrance animations
  const cardAnims = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;

  // Post-walk summary highlight glow
  const postWalkGlowAnim = useRef(new Animated.Value(0)).current;
  const tourMenuRef = useRef<View>(null);
  const tourStreakRef = useRef<View>(null);
  const quickStatusRef = useRef<View>(null);
  const tourOpportunitiesRef = useRef<View>(null);
  const tourManualWalkRef = useRef<View>(null);
  const tourTargets = useMemo<TourTargetRef[]>(
    () => [
      { ref: tourMenuRef, stepIndex: 0 },
      { ref: tourStreakRef, stepIndex: 1 },
      { ref: quickStatusRef, stepIndex: 2 },
      { ref: tourOpportunitiesRef, stepIndex: 3 },
      { ref: tourManualWalkRef, stepIndex: 4 },
    ],
    [],
  );
  const dashboardTourLaunchAttemptedRef = useRef(false);

  // ── Change walk modal state ──
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<PlanOpportunity | null>(null);
  const [changeHour, setChangeHour] = useState('');
  const [changeMinute, setChangeMinute] = useState('');
  const [changePeriod, setChangePeriod] = useState<TimePeriod>('AM');
  const [changeDuration, setChangeDuration] = useState('');
  const [changeNotifyChoice, setChangeNotifyChoice] = useState<ManualReminderChoice>('atTime');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [savingChange, setSavingChange] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState('');
  const [changeInitialState, setChangeInitialState] = useState<{
    hour: string; minute: string; period: TimePeriod; duration: string; notifyChoice: ManualReminderChoice;
  } | null>(null);
  const [changeQuietHoursBypass, setChangeQuietHoursBypass] = useState(false);
  const hasChangeDraft =
    !!changeInitialState &&
    (changeHour !== changeInitialState.hour || changeMinute !== changeInitialState.minute ||
      changePeriod !== changeInitialState.period || changeDuration !== changeInitialState.duration ||
      changeNotifyChoice !== changeInitialState.notifyChoice);

  // ── In-app walk prompt state ──
  const [walkCountdown, setWalkCountdown] = useState<number | null>(null);
  const walkCountdownScaleAnim = useRef(new Animated.Value(0)).current;
  const [postWalkSummarySession, setPostWalkSummarySession] = useState<WalkSession | null>(null);

  // ── Themed dialog state ──
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmText: string; confirmStyle: 'default' | 'destructive'; onConfirm: () => void } | null>(null);
  const showMessage = (title: string, message: string) => setMessageDialog({ title, message });
  const showBinaryConfirm = (title: string, message: string, confirmText: string, onConfirm: () => void, style: 'default' | 'destructive' = 'default') =>
    setConfirmDialog({ title, message, confirmText, confirmStyle: style, onConfirm });
  const [notificationPermissionState, setNotificationPermissionState] = useState<NotificationPermissionState | null>(null);
  const [isRepairingNotifications, setIsRepairingNotifications] = useState(false);
  const lastNotificationPermissionGrantedRef = useRef<boolean | null>(null);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const hasActiveWalkSession = !!activeWalkSnapshot?.sessionId;
  const walkActionTitle = hasActiveWalkSession
    ? (activeWalkSnapshot?.paused ? 'Resume Walk Session' : 'Go to Walk Session')
    : 'Start Manual Walk';
  const walkActionHint = hasActiveWalkSession
    ? 'Your walk is still running in the background. Jump back in anytime.'
    : 'Your privacy matters. So does your health.';

  // ── Add walk modal state ──
  const [showAddWalkModal, setShowAddWalkModal] = useState(false);
  const [addWalkHour, setAddWalkHour] = useState('');
  const [addWalkMinute, setAddWalkMinute] = useState('');
  const [addWalkPeriod, setAddWalkPeriod] = useState<TimePeriod>('AM');
  const [addWalkDuration, setAddWalkDuration] = useState('10');
  const [addNotifyChoice, setAddNotifyChoice] = useState<ManualReminderChoice>('atTime');
  const [addWalkError, setAddWalkError] = useState<string | null>(null);
  const [savingAddWalk, setSavingAddWalk] = useState(false);
  const [addWalkInitialState, setAddWalkInitialState] = useState<{
    hour: string; minute: string; period: TimePeriod; duration: string; notifyChoice: ManualReminderChoice;
  } | null>(null);
  const [quietHoursBypass, setQuietHoursBypass] = useState(false);

  useEffect(() => {
    if (isAuthenticated || hasCompletedOnboarding) return;
    navigation.reset({ index: 0, routes: [{ name: 'Intro' }] });
  }, [hasCompletedOnboarding, isAuthenticated, navigation]);

  // Mark that the user has reached the dashboard at least once.
  // The schedule editor tour should continue to show until this happens.
  useEffect(() => {
    if (!hasCompletedOnboarding) return;
    if (guidanceSeen.dashboard_welcome) return;
    setGuidanceSeen('dashboard_welcome', true);
    void guidanceStorage.markSeen('dashboard_welcome');
  }, [hasCompletedOnboarding, guidanceSeen.dashboard_welcome, setGuidanceSeen]);

  const areTourTargetsMeasurable = useCallback(async (): Promise<boolean> => {
    const canMeasure = (ref: React.RefObject<View | null>) =>
      new Promise<boolean>((resolve) => {
        const node = ref.current;
        if (!node) {
          resolve(false);
          return;
        }
        node.measure((_x, _y, width, height) => {
          resolve(width > 0 && height > 0);
        });
      });

    const checks = await Promise.all([
      canMeasure(tourMenuRef),
      canMeasure(tourStreakRef),
      canMeasure(quickStatusRef),
      canMeasure(tourOpportunitiesRef),
      canMeasure(tourManualWalkRef),
    ]);
    return checks.every(Boolean);
  }, []);

  const smoothScrollTo = useCallback((toY: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      const scrollView = dashboardScrollRef.current;
      if (!scrollView) {
        resolve();
        return;
      }

      const fromY = scrollYRef.current;
      const clampedTargetY = Math.max(0, toY);
      if (Math.abs(clampedTargetY - fromY) < 2) {
        resolve();
        return;
      }

      const driver = new Animated.Value(fromY);
      const listenerId = driver.addListener(({ value }) => {
        scrollYRef.current = value;
        scrollView.scrollTo({ y: value, animated: false });
      });

      Animated.timing(driver, {
        toValue: clampedTargetY,
        duration: 520,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        driver.removeListener(listenerId);
        scrollYRef.current = clampedTargetY;
        scrollView.scrollTo({ y: clampedTargetY, animated: false });
        resolve();
      });
    });
  }, []);

  const launchTourWhenReady = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ready = await areTourTargetsMeasurable();
      if (ready) {
        setShowDashboardTour(true);
        return true;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 180);
      });
    }
    return false;
  }, [areTourTargetsMeasurable]);

  useEffect(() => {
    if (!hasCompletedOnboarding || !hasSetPreferences || !preferences) return;
    if (guidanceSeen.dashboard_tour || showDashboardTour) return;
    if (dashboardTourLaunchAttemptedRef.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        void (async () => {
          if (cancelled) return;
          const launched = await launchTourWhenReady();
          if (launched) dashboardTourLaunchAttemptedRef.current = true;
        })();
      }, 600);
    });

    return () => {
      cancelled = true;
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [
    hasCompletedOnboarding,
    hasSetPreferences,
    preferences,
    guidanceSeen.dashboard_tour,
    showDashboardTour,
    launchTourWhenReady,
  ]);

  useEffect(() => {
    if (!route.params?.replayDashboardTour) return;
    if (!hasSetPreferences || !preferences) return;

    navigation.setParams({ replayDashboardTour: undefined });
    dashboardTourLaunchAttemptedRef.current = true;

    const task = InteractionManager.runAfterInteractions(() => {
      void launchTourWhenReady();
    });

    return () => task.cancel();
  }, [
    route.params?.replayDashboardTour,
    hasSetPreferences,
    preferences,
    navigation,
    launchTourWhenReady,
  ]);

  const resolvedDisplayName = useMemo(() => {
    const localName = profileDisplayName?.trim();
    if (localName) return localName;
    const authName = authUser?.name?.trim();
    if (authName && !authName.includes('@')) return authName;
    return 'GapWalker';
  }, [authUser?.name, profileDisplayName]);

  // ── Data loading ──
  const reconcileTodayPlans = useCallback(async (prefs: NonNullable<typeof preferences>, minutesWalked: number) => {
    const now = new Date();
    const todaysPlans = await plansRepo.getTodayPlans();
    const activePlans = todaysPlans.filter(
      (plan) => (plan.status === 'planned' || plan.status === 'notified') && isAfter(parseISO(plan.gapEnd), now)
    );
    const autoPlans = activePlans.filter((plan) => plan.reason !== 'manual');

    const remainingTargetMinutes = Math.max(0, prefs.dailyTargetMinutes - minutesWalked);
    if (remainingTargetMinutes <= 0) {
      for (const plan of autoPlans) await plansRepo.updateStatus(plan.id, 'cancelled');
      if (isNotificationsSupported) {
        await notificationService.recoverScheduledNotifications({
          prefs,
          requestPermissions: false,
        });
      }
      return;
    }

    const events = await eventsRepo.getAll();
    const planningPrefs = { ...prefs, dailyTargetMinutes: remainingTargetMinutes };
    const rebuilt = await gapEngine.generatePlansForDate(now, events, planningPrefs);

    const normalize = (plan: NudgePlan): string =>
      `${plan.gapStart}|${plan.gapEnd}|${plan.walkStart}|${plan.suggestedDurationMinutes}`;
    const existingKeys = autoPlans.map(normalize).sort();
    const rebuiltKeys = rebuilt.map(normalize).sort();
    const samePlanShape = existingKeys.length === rebuiltKeys.length && existingKeys.every((key, idx) => key === rebuiltKeys[idx]);
    const hasInvalidDuration = autoPlans.some((plan) => plan.suggestedDurationMinutes <= 0);
    const exceedsPlanCount = autoPlans.length > prefs.notificationCountPerDay;
    const hasCustomizedPlan = autoPlans.some((plan) => plan.reason === 'customized');

    if (!hasCustomizedPlan && (!samePlanShape || hasInvalidDuration || exceedsPlanCount)) {
      for (const plan of autoPlans) await plansRepo.updateStatus(plan.id, 'cancelled');
      if (rebuilt.length > 0) await plansRepo.saveMany(rebuilt);
    }

    if (isNotificationsSupported) {
      await notificationService.recoverScheduledNotifications({
        prefs,
        requestPermissions: false,
      });
    }
  }, []);

  const load = useCallback(async (): Promise<NudgePlan[]> => {
    const prefsFromDb = await preferencesRepo.get();
    if (prefsFromDb) { setPreferences(prefsFromDb); setHasSetPreferences(true); }
    const mins = await sessionsRepo.getTodayMinutes();
    const stepsToday = await sessionsRepo.getTodaySteps();
    setTodaySteps(stepsToday);
    if (prefsFromDb) await reconcileTodayPlans(prefsFromDb, mins);
    await notificationPlanActions.expireStaleNotifiedPlans();
    const cnt = await plansRepo.getTodayNotifiedCount();
    setTodayStats(mins, cnt);
    const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
    setUpcomingPlans(refreshedUpcoming);
    const allTodayPlans = await plansRepo.getTodayPlans();
    setCompletedPlans(allTodayPlans.filter((p) => p.status === 'completed'));
    setMissedPlans(allTodayPlans.filter((p) => p.status === 'cancelled' && p.reason === 'missed'));
    const allSessions = await sessionsRepo.getAll();
    setStreak(calculateStreak(allSessions));
    const newWeekly = calculateWeeklyStats(allSessions);
    setPrevWeeklyStats(prevWeeklyStatsRef.current);
    setWeeklyStats(newWeekly);
    prevWeeklyStatsRef.current = newWeekly;
    const yesterday = subDays(new Date(), 1);
    const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
    const yesterdayMins = allSessions
      .filter((s) => format(parseISO(s.start), 'yyyy-MM-dd') === yesterdayKey)
      .reduce((sum, s) => sum + Math.floor(s.activeSeconds / 60), 0);
    setYesterdayMinutes(yesterdayMins);
    const dailyTarget = prefsFromDb?.dailyTargetMinutes;
    const newIds = await achievementsRepo.evaluate(dailyTarget);
    const allUnlocked = await achievementsRepo.getAll();
    setUnlockedAchievements(allUnlocked);
    if (newIds.length > 0) {
      setNewBadgeIds(newIds);
      setShowBadgeModal(true);
      badgeAnim.setValue(0);
      Animated.spring(badgeAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }).start();
    }
    if (prefsFromDb && isNotificationsSupported) {
      notificationService.scheduleDailySummary(prefsFromDb).catch((e) => {
        if (__DEV__) console.warn('Daily summary scheduling failed:', e);
      });
    }
    return refreshedUpcoming;
  }, [reconcileTodayPlans, setHasSetPreferences, setPreferences, setTodayStats, setUpcomingPlans]);

  const applyNotificationPermissionGrant = useCallback(async () => {
    const resolvedPrefs = preferencesRef.current ?? (await preferencesRepo.get());

    if (resolvedPrefs && isNotificationsSupported) {
      try {
        await notificationPlanActions.reconcileExpiredPlansAndNotifications();
        await notificationService.recoverScheduledNotifications({
          prefs: resolvedPrefs,
          requestPermissions: false,
        });
        if (androidExactNotifications.isSupported()) {
          await androidExactNotifications.clearRecoveryNeeded();
        }
      } catch (error) {
        if (androidExactNotifications.isSupported()) {
          await androidExactNotifications.markRecoveryNeeded('dashboard_permission_repair_failed');
        }
        if (__DEV__) console.warn('Failed to recover notifications after permission grant:', error);
      }
    }

    await registerCurrentDeviceForNotifications();
    await load();
  }, [load]);

  const refreshNotificationPermissionState = useCallback(async (
    options: { syncOnGrantTransition?: boolean } = {},
  ): Promise<NotificationPermissionState | null> => {
    if (!isNotificationsSupported) {
      setNotificationPermissionState(null);
      return null;
    }

    const nextState = await getNotificationPermissionState();
    const wasGranted = lastNotificationPermissionGrantedRef.current;
    setNotificationPermissionState(nextState);
    lastNotificationPermissionGrantedRef.current = nextState.granted;

    if (options.syncOnGrantTransition && nextState.granted && wasGranted === false) {
      await applyNotificationPermissionGrant();
    }

    return nextState;
  }, [applyNotificationPermissionGrant]);

  const handleRepairNotifications = useCallback(async () => {
    if (isRepairingNotifications || !notificationPermissionState) return;

    setIsRepairingNotifications(true);
    try {
      if (!notificationPermissionState.canAskAgain) {
        await openAppSettings();
        return;
      }

      const nextState = await requestNotificationPermission();
      setNotificationPermissionState(nextState);
      lastNotificationPermissionGrantedRef.current = nextState.granted;

      if (nextState.granted) {
        await applyNotificationPermissionGrant();
      }
    } catch (error) {
      if (__DEV__) console.warn('Notification repair failed:', error);
    } finally {
      setIsRepairingNotifications(false);
    }
  }, [applyNotificationPermissionGrant, isRepairingNotifications, notificationPermissionState]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => console.error('Dashboard load failed:', e));
      void refreshNotificationPermissionState({ syncOnGrantTransition: true });
      // Stagger card entrance animations
      cardAnims.forEach((a) => a.setValue(0));
      Animated.stagger(
        80,
        cardAnims.map((a) =>
          Animated.timing(a, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ).start();
    }, [load, refreshNotificationPermissionState])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshNotificationPermissionState({ syncOnGrantTransition: true });
      }
    });
    return () => subscription.remove();
  }, [refreshNotificationPermissionState]);

  // ── Celebration trigger ──
  useEffect(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    if (lastCelebratedDateRef.current && lastCelebratedDateRef.current !== todayKey) lastCelebratedDateRef.current = null;
    const target = preferences?.dailyTargetMinutes ?? 0;
    if (target <= 0) { previousMinutesRef.current = todayMinutesWalked; return; }
    const previousMinutes = previousMinutesRef.current;
    const reachedNow = todayMinutesWalked >= target && todayMinutesWalked > 0;
    if (previousMinutes !== null) {
      const reachedBefore = previousMinutes >= target && previousMinutes > 0;
      if (reachedNow && !reachedBefore && lastCelebratedDateRef.current !== todayKey) {
        triggerCelebration();
        lastCelebratedDateRef.current = todayKey;
      }
    }
    previousMinutesRef.current = todayMinutesWalked;
  }, [todayMinutesWalked, preferences?.dailyTargetMinutes]);

  // Hide scrollbar on web
  useEffect(() => {
    if (Platform.OS === 'web') {
      const doc = (globalThis as any).document;
      if (doc) {
        const styleId = 'gapwalk-dashboard-scrollbar';
        if (!doc.getElementById(styleId)) {
          const el = doc.createElement('style');
          el.id = styleId;
          el.textContent = `[data-gapwalk-dashboard-scroll]::-webkit-scrollbar { display: none; }\n[data-gapwalk-dashboard-scroll] { scrollbar-width: none; }`;
          doc.head.appendChild(el);
        }
      }
      const t = setTimeout(() => {
        const node = (dashboardScrollRef.current as any)?.getScrollableNode?.();
        if (node) node.setAttribute('data-gapwalk-dashboard-scroll', 'true');
      }, 100);
      return () => clearTimeout(t);
    }
  }, []);

  const triggerCelebration = () => {
    setShowCelebration(true);
    Animated.sequence([
      Animated.timing(celebrationAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(celebrationAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setShowCelebration(false));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      await refreshNotificationPermissionState({ syncOnGrantTransition: true });
    } catch (e) {
      if (__DEV__) console.error('Dashboard refresh failed:', e);
    }
    finally { setRefreshing(false); }
  }, [load, refreshNotificationPermissionState]);

  const handleWalkActionPress = useCallback(() => {
    if (hasActiveWalkSession && activeWalkSnapshot) {
      navigation.navigate('Walking', {
        planId: activeWalkSnapshot.planId,
        prompt: activeWalkSnapshot.prompt,
        startedFromNotification: activeWalkSnapshot.startedFromNotification ?? false,
      });
      return;
    }

    navigation.navigate('Walking', {});
  }, [activeWalkSnapshot, hasActiveWalkSession, navigation]);

  // ── Cancel / change opportunity handlers ──
  const cancelOpportunity = useCallback((opportunity: PlanOpportunity) => {
    const performCancel = async () => {
      try {
        const now = new Date();
        const todayKey = format(now, 'yyyy-MM-dd');
        const todayPlans = await plansRepo.getTodayPlans();
        const sameGapActivePlans = todayPlans.filter(
          (plan) => (plan.status === 'planned' || plan.status === 'notified') &&
            plan.gapStart === opportunity.plan.gapStart && plan.gapEnd === opportunity.plan.gapEnd &&
            isAfter(parseISO(plan.walkStart), now)
        );
        if (sameGapActivePlans.length > 0) {
          for (const plan of sameGapActivePlans) await plansRepo.updateStatus(plan.id, 'cancelled');
        } else {
          await plansRepo.updateStatus(opportunity.plan.id, 'cancelled');
        }
        const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
        setUpcomingPlans(refreshedUpcoming);
        if (isNotificationsSupported && preferences) {
          await notificationService.recoverScheduledNotifications({
            prefs: preferences,
            requestPermissions: false,
          });
        }
        const remainingToday = refreshedUpcoming
          .filter((plan) => plan.date === todayKey)
          .filter((plan) => plan.status === 'planned' || plan.status === 'notified')
          .sort((a, b) => a.walkStart.localeCompare(b.walkStart));
        if (!preferences || remainingToday.length === 0) {
          showMessage('No walk windows today', 'No walk windows are available today.');
          return;
        }
        const next = remainingToday[0];
        const nextWalkStart = parseISO(next.walkStart);
        const nextNotify = getPlanNotifyTime(next, preferences);
        const nextEndRaw = addMinutes(parseISO(next.walkStart), next.suggestedDurationMinutes);
        const nextGapEnd = parseISO(next.gapEnd);
        const nextEnd = isAfter(nextEndRaw, nextGapEnd) ? nextGapEnd : nextEndRaw;
        showMessage('Next walk window selected',
          `Walk time: ${format(nextWalkStart, 'h:mm a')} - ${format(nextEnd, 'h:mm a')}\nNotification time: ${format(nextNotify, 'h:mm a')}`);
      } catch (error) {
        if (__DEV__) console.error('Failed to cancel walk opportunity:', error);
        showMessage('Could Not Cancel', toUserFriendlyError(error));
      }
    };
    const isManualPlan = opportunity.plan.reason === 'manual';
    const confirmTitle = isManualPlan ? 'Cancel this walk?' : 'Cancel this walk window';
    const confirmMessage = isManualPlan
      ? 'Are you sure you want to cancel this personally scheduled walk?'
      : 'If you cancel, GapWalk will move to the next best walk window today.';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${confirmTitle}\n\n${confirmMessage}`)) void performCancel();
      return;
    }
    showBinaryConfirm(confirmTitle, confirmMessage, 'Yes, cancel', () => { void performCancel(); }, 'destructive');
  }, [preferences, setUpcomingPlans]);

  // ── In-app walk prompt handlers ──
  const handleWalkPromptYes = useCallback(async () => {
    const prompt = pendingInAppWalkPrompt;
    if (!prompt) return;
    setPendingInAppWalkPrompt(null);

    // Run 3-2-1 countdown
    for (let i = 3; i >= 1; i--) {
      setWalkCountdown(i);
      walkCountdownScaleAnim.setValue(0);
      Animated.spring(walkCountdownScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
    setWalkCountdown(null);

    navigation.navigate('Walking', {
      planId: prompt.planId,
      startedFromNotification: false,
      skipStartCountdown: true,
    });
  }, [navigation, pendingInAppWalkPrompt, setPendingInAppWalkPrompt, walkCountdownScaleAnim]);

  const handleWalkPromptNotNow = useCallback(async () => {
    const prompt = pendingInAppWalkPrompt;
    if (!prompt) return;
    setPendingInAppWalkPrompt(null);

    await notificationPlanActions.skipPlanSilently(prompt.planId);
    // Animate the list change when opportunities update
    LayoutAnimation.configureNext(LayoutAnimation.create(
      300,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ));
    const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
    setUpcomingPlans(refreshedUpcoming);
    analyticsService.track('walk_ready_not_now_inapp', { planId: prompt.planId });
  }, [pendingInAppWalkPrompt, setPendingInAppWalkPrompt, setUpcomingPlans]);

  const handleWalkPromptDismiss = useCallback(() => {
    if (!pendingInAppWalkPrompt) return;
    setPendingInAppWalkPrompt(null);
    // Scroll to opportunities section
    setTimeout(() => {
      tourOpportunitiesRef.current?.measureInWindow((_x: number, y: number) => {
        void smoothScrollTo(Math.max(0, y + scrollYRef.current - 80));
      });
    }, 200);
  }, [pendingInAppWalkPrompt, setPendingInAppWalkPrompt, smoothScrollTo]);

  const closePostWalkSummary = useCallback(() => {
    setPostWalkSummarySession(null);
  }, []);

  // ── Change walk handlers ──
  const openChangeOpportunity = (opportunity: PlanOpportunity) => {
    const parts = to12HourParts(opportunity.plan.walkStart);
    const initialDuration = String(opportunity.plan.suggestedDurationMinutes);
    const initialNotifyChoice =
      opportunity.plan.reason === 'manual'
        ? getManualReminderChoiceFromLead(opportunity.plan.manualNotifyLeadMinutes)
        : getDefaultManualReminderChoice(preferences);
    setEditingOpportunity(opportunity);
    setChangeHour(parts.hour); setChangeMinute(parts.minute);
    setChangePeriod(parts.period); setChangeDuration(initialDuration);
    setChangeNotifyChoice(initialNotifyChoice);
    setChangeInitialState({
      hour: parts.hour,
      minute: parts.minute,
      period: parts.period,
      duration: initialDuration,
      notifyChoice: initialNotifyChoice,
    });
    setChangeQuietHoursBypass(false); setChangeError(null); setShowChangeModal(true);
  };

  const closeChangeModal = () => {
    if (savingChange) return;
    const closeNow = () => {
      setShowChangeModal(false);
      setEditingOpportunity(null);
      setChangeError(null);
      setChangeInitialState(null);
      setChangeQuietHoursBypass(false);
    };
    if (!hasChangeDraft) { closeNow(); return; }
    const title = 'Cancel this update?';
    const message = 'Your unsaved walk updates will be lost. Do you want to close this editor?';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${title}\n\n${message}`)) closeNow();
      return;
    }
    showBinaryConfirm(title, message, 'Yes', closeNow, 'destructive');
  };

  const shouldAllowChangeQuietHoursBypass = useCallback((opportunity: PlanOpportunity) => {
    if (!preferences) return false;
    if (opportunity.plan.reason === 'manual') return true;
    const currentStart = parseISO(opportunity.plan.walkStart);
    const currentEnd = getPlanWalkEnd(opportunity.plan);
    return (
      timeUtils.isInQuietHours(currentStart, preferences.quietHoursStart, preferences.quietHoursEnd) ||
      timeUtils.isInQuietHours(currentEnd, preferences.quietHoursStart, preferences.quietHoursEnd)
    );
  }, [preferences]);

  const validateChangedWalkQuietHours = useCallback((nextStart: Date, walkEnd: Date): boolean => {
    if (!editingOpportunity || !preferences) return true;
    const inQuietHours =
      timeUtils.isInQuietHours(nextStart, preferences.quietHoursStart, preferences.quietHoursEnd) ||
      timeUtils.isInQuietHours(walkEnd, preferences.quietHoursStart, preferences.quietHoursEnd);

    if (!inQuietHours) {
      if (changeQuietHoursBypass) setChangeQuietHoursBypass(false);
      return true;
    }

    if (shouldAllowChangeQuietHoursBypass(editingOpportunity)) {
      if (!changeQuietHoursBypass) {
        setChangeQuietHoursBypass(true);
        setChangeError(`This walk is inside your quiet hours (${formatTime12(preferences.quietHoursStart)} – ${formatTime12(preferences.quietHoursEnd)}). Change the time, or tap "Update anyway" to bypass.`);
        return false;
      }
      return true;
    }

    setChangeError('Pick a time outside your quiet hours.');
    return false;
  }, [changeQuietHoursBypass, editingOpportunity, preferences, shouldAllowChangeQuietHoursBypass]);

  const applyWalkChange = async () => {
    if (!editingOpportunity || !preferences || savingChange) return;
    const hour = parseInt(changeHour, 10); const minute = parseInt(changeMinute, 10);
    const duration = parseInt(changeDuration, 10);
    const isManualPlan = editingOpportunity.plan.reason === 'manual';
    const manualNotifyLeadMinutes = isManualPlan
      ? getManualReminderLeadFromChoice(changeNotifyChoice)
      : editingOpportunity.plan.manualNotifyLeadMinutes ?? 0;
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setChangeError('Please enter a valid start time.'); return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setChangeError('Set duration between 1 and 180 minutes.'); return;
    }
    const nextStart = parseISO(editingOpportunity.plan.walkStart);
    let hour24 = hour % 12; if (changePeriod === 'PM') hour24 += 12;
    nextStart.setHours(hour24, minute, 0, 0);
    if (!isAfter(nextStart, new Date())) { setChangeError('Choose a future time for this walk.'); return; }
    const oldGapStart = parseISO(editingOpportunity.plan.gapStart);
    const oldGapEnd = parseISO(editingOpportunity.plan.gapEnd);
    const walkEnd = addMinutes(nextStart, duration);
    if (!validateChangedWalkQuietHours(nextStart, walkEnd)) return;
    if (isManualPlan) {
      const manualNotifyTime = subMinutes(nextStart, manualNotifyLeadMinutes);
      if (manualNotifyTime <= new Date()) {
        setChangeError('Reminder time would be in the past. Choose a later walk time or a shorter reminder lead time.');
        return;
      }
    } else {
      const notifyLeadMinutes = preferences.whenToNotify === 'delay' ? Math.max(0, preferences.notifyDelayMinutes ?? 5) : 0;
      const earliestForNotify = subMinutes(nextStart, notifyLeadMinutes);
      if (isBefore(earliestForNotify, oldGapStart)) {
        const gapStartFmt = format(oldGapStart, 'h:mm a');
        setChangeError(`Notification would fall before the gap start (${gapStartFmt}). Move the walk later or reduce the notification lead time.`);
        return;
      }
      if (isAfter(walkEnd, oldGapEnd)) {
        const gapEndFmt = format(oldGapEnd, 'h:mm a');
        setChangeError(`Walk would finish after the gap ends at ${gapEndFmt}. Choose an earlier start or shorter duration.`);
        return;
      }
    }
    const nextGapStart = isManualPlan ? nextStart : oldGapStart;
    const nextGapEnd = isManualPlan ? walkEnd : oldGapEnd;
    try {
      setSavingChange(true);
      const nextReason = isManualPlan ? 'manual' : 'customized';
      await plansRepo.updateTiming(editingOpportunity.plan.id, {
        gapStart: nextGapStart.toISOString(), gapEnd: nextGapEnd.toISOString(),
        walkStart: nextStart.toISOString(), suggestedDurationMinutes: duration,
        manualNotifyLeadMinutes,
        reason: nextReason, status: 'planned',
      });
      if (isNotificationsSupported) {
        await notificationService.recoverScheduledNotifications({
          prefs: preferences,
          requestPermissions: false,
        });
      }
      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
      setShowChangeModal(false); setEditingOpportunity(null); setChangeError(null); setChangeInitialState(null); setChangeQuietHoursBypass(false);
      setSaveToastMessage('Walk time updated');
      setShowSaveToast(true);
    } catch (error) {
      if (__DEV__) console.error('Failed to update walk window:', error);
      showMessage('Could Not Update', toUserFriendlyError(error));
    } finally { setSavingChange(false); }
  };

  const requestSaveWalkChange = () => {
    if (savingChange || !hasChangeDraft) return;
    const hour = parseInt(changeHour, 10); const minute = parseInt(changeMinute, 10);
    const duration = parseInt(changeDuration, 10);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setChangeError('Please enter a valid start time.'); return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setChangeError('Set duration between 1 and 180 minutes.'); return;
    }
    if (editingOpportunity) {
      const previewStart = parseISO(editingOpportunity.plan.walkStart);
      const isManualPlan = editingOpportunity.plan.reason === 'manual';
      let hour24 = hour % 12; if (changePeriod === 'PM') hour24 += 12;
      previewStart.setHours(hour24, minute, 0, 0);
      const previewEnd = addMinutes(previewStart, duration);
      if (!isAfter(previewStart, new Date())) { setChangeError('Choose a future time for this walk.'); return; }
      if (isManualPlan) {
        const previewNotifyTime = subMinutes(previewStart, getManualReminderLeadFromChoice(changeNotifyChoice));
        if (previewNotifyTime <= new Date()) {
          setChangeError('Reminder time would be in the past. Choose a later walk time or a shorter reminder lead time.');
          return;
        }
      } else {
        const previewGapStart = parseISO(editingOpportunity.plan.gapStart);
        const previewGapEnd = parseISO(editingOpportunity.plan.gapEnd);
        const notifyLead = preferences?.whenToNotify === 'delay' ? Math.max(0, preferences.notifyDelayMinutes ?? 5) : 0;
        const previewNotifyStart = subMinutes(previewStart, notifyLead);
        if (isBefore(previewNotifyStart, previewGapStart)) {
          setChangeError(`Notification would fall before the gap start (${format(previewGapStart, 'h:mm a')}). Move the walk later or reduce the notification lead time.`);
          return;
        }
        if (isAfter(previewEnd, previewGapEnd)) {
          setChangeError(`Walk would finish after the gap ends at ${format(previewGapEnd, 'h:mm a')}. Choose an earlier start or shorter duration.`);
          return;
        }
      }
      if (!validateChangedWalkQuietHours(previewStart, previewEnd)) return;
    }
    setChangeError(null);
    const baseMessage = 'Are you sure you want to update this walk time and duration?';
    const quietMessage = 'This walk is inside your quiet hours.\n\nDo you still want to update it and keep the reminder?';
    const message = changeQuietHoursBypass ? quietMessage : baseMessage;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`Update this walk?\n\n${message}`)) void applyWalkChange();
      return;
    }
    showBinaryConfirm('Update this walk?', message, 'Yes, Update', () => { void applyWalkChange(); });
  };

  // ── Add walk handlers ──
  const openAddWalkModal = () => {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
    nextHour.setMinutes(0, 0, 0);
    const h = nextHour.getHours();
    const initialHour = String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0');
    const initialMinute = '00';
    const initialPeriod: TimePeriod = h >= 12 ? 'PM' : 'AM';
    const initialDuration = '10';
    const initialNotifyChoice = getDefaultManualReminderChoice(preferences);
    setAddWalkHour(initialHour); setAddWalkMinute(initialMinute);
    setAddWalkPeriod(initialPeriod); setAddWalkDuration(initialDuration);
    setAddNotifyChoice(initialNotifyChoice);
    setAddWalkInitialState({
      hour: initialHour,
      minute: initialMinute,
      period: initialPeriod,
      duration: initialDuration,
      notifyChoice: initialNotifyChoice,
    });
    setAddWalkError(null); setQuietHoursBypass(false); setShowAddWalkModal(true);
    if (!guidanceSeen.dashboard_manual_walk_hint) dismissGuidance('dashboard_manual_walk_hint');
  };

  const closeAddWalkModal = () => {
    if (savingAddWalk) return;
    const hasDraftChanges = !!addWalkInitialState &&
      (addWalkHour !== addWalkInitialState.hour || addWalkMinute !== addWalkInitialState.minute ||
        addWalkPeriod !== addWalkInitialState.period || addWalkDuration !== addWalkInitialState.duration ||
        addNotifyChoice !== addWalkInitialState.notifyChoice);
    const closeNow = () => { setShowAddWalkModal(false); setAddWalkError(null); setAddWalkInitialState(null); };
    if (!hasDraftChanges) { closeNow(); return; }
    const title = 'Cancel this walk setup?';
    const message = 'Your unsaved walk details will be lost. Do you want to close this form?';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${title}\n\n${message}`)) closeNow();
      return;
    }
    showBinaryConfirm(title, message, 'Yes', closeNow, 'destructive');
  };

  const saveManualWalk = async (bypassQuiet = false) => {
    if (!preferences || savingAddWalk) return;
    const hour = parseInt(addWalkHour, 10); const minute = parseInt(addWalkMinute, 10);
    const duration = parseInt(addWalkDuration, 10);
    const manualNotifyLeadMinutes = getManualReminderLeadFromChoice(addNotifyChoice);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setAddWalkError('Please enter a valid time.'); return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setAddWalkError('Set duration between 1 and 180 minutes.'); return;
    }
    let hour24 = hour % 12; if (addWalkPeriod === 'PM') hour24 += 12;
    const walkStart = new Date(); walkStart.setHours(hour24, minute, 0, 0);
    if (!isAfter(walkStart, new Date())) { setAddWalkError('Choose a future time.'); return; }
    const walkEnd = addMinutes(walkStart, duration);
    if (!bypassQuiet && (timeUtils.isInQuietHours(walkStart, preferences.quietHoursStart, preferences.quietHoursEnd) ||
      timeUtils.isInQuietHours(walkEnd, preferences.quietHoursStart, preferences.quietHoursEnd))) {
      setQuietHoursBypass(true);
      setAddWalkError(`This falls within your quiet hours (${formatTime12(preferences.quietHoursStart)} – ${formatTime12(preferences.quietHoursEnd)}). Change the time, or tap "Save anyway" to bypass.`);
      return;
    }
    try {
      setSavingAddWalk(true);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const plan: NudgePlan = {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        date: todayStr, gapStart: walkStart.toISOString(), gapEnd: walkEnd.toISOString(),
        walkStart: walkStart.toISOString(), suggestedDurationMinutes: duration,
        manualNotifyLeadMinutes,
        status: 'planned', reason: 'manual', createdAt: new Date().toISOString(),
      };
      if (getPlanNotifyTime(plan) <= new Date()) {
        setAddWalkError('Reminder time would be in the past. Choose a later walk time or a shorter reminder lead time.');
        return;
      }
      await plansRepo.save(plan);
      if (isNotificationsSupported) await notificationService.scheduleManualNudge(plan);
      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
      setShowAddWalkModal(false); setAddWalkError(null); setAddWalkInitialState(null);
      setSaveToastMessage('Walk added');
      setShowSaveToast(true);
    } catch (error) {
      if (__DEV__) console.error('Failed to create manual walk:', error);
      setAddWalkError(toUserFriendlyError(error));
    } finally { setSavingAddWalk(false); }
  };

  const requestSaveManualWalk = () => {
    if (savingAddWalk) return;
    const hour = parseInt(addWalkHour, 10);
    const minute = parseInt(addWalkMinute, 10);
    const duration = parseInt(addWalkDuration, 10);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setAddWalkError('Please enter a valid time.'); return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setAddWalkError('Set duration between 1 and 180 minutes.'); return;
    }
    let hour24 = hour % 12; if (addWalkPeriod === 'PM') hour24 += 12;
    const previewStart = new Date();
    previewStart.setHours(hour24, minute, 0, 0);
    if (!isAfter(previewStart, new Date())) { setAddWalkError('Choose a future time.'); return; }
    const previewPlan: NudgePlan = {
      id: 'preview-manual-plan',
      date: format(previewStart, 'yyyy-MM-dd'),
      gapStart: previewStart.toISOString(),
      gapEnd: addMinutes(previewStart, duration).toISOString(),
      walkStart: previewStart.toISOString(),
      suggestedDurationMinutes: duration,
      manualNotifyLeadMinutes: getManualReminderLeadFromChoice(addNotifyChoice),
      status: 'planned',
      reason: 'manual',
      createdAt: new Date().toISOString(),
    };
    if (getPlanNotifyTime(previewPlan) <= new Date()) {
      setAddWalkError('Reminder time would be in the past. Choose a later walk time or a shorter reminder lead time.');
      return;
    }
    setAddWalkError(null);
    const baseMessage = 'Do you want to save this walk and schedule a notification?';
    const quietMessage = `This walk is inside your quiet hours.\n\nDo you still want to save it and schedule a notification?`;
    const message = quietHoursBypass ? quietMessage : baseMessage;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(message)) void saveManualWalk(quietHoursBypass);
      return;
    }
    showBinaryConfirm('Save this walk?', message, 'Yes, save', () => { void saveManualWalk(quietHoursBypass); });
  };

  // ── Menu handlers ──
  const closeMenu = () => {
    Animated.timing(menuSlide, { toValue: 0, duration: 320, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true })
      .start(() => setMenuVisible(false));
  };

  const openMenu = useCallback(() => {
    if (menuVisible) return;
    menuSlide.setValue(0); setMenuVisible(true);
    requestAnimationFrame(() => {
      Animated.spring(menuSlide, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }).start();
    });
  }, [menuSlide, menuVisible]);

  useEffect(() => {
    if (!route.params?.openMenu) return;
    openMenu();
    navigation.setParams({ openMenu: undefined });
  }, [navigation, openMenu, route.params?.openMenu]);

  // Post-walk summary: scroll to Quick Status and pulse a highlight glow
  useEffect(() => {
    if (!route.params?.showPostWalkSummary) return;
    const requestedSessionId = route.params?.postWalkSessionId;
    navigation.setParams({
      showPostWalkSummary: undefined,
      postWalkSessionId: undefined,
    });

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const triggerQuickStatusHighlight = () => {
      timer = setTimeout(() => {
        quickStatusRef.current?.measureInWindow((_x, y) => {
          dashboardScrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
        });

        postWalkGlowAnim.setValue(0);
        Animated.sequence([
          Animated.timing(postWalkGlowAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(postWalkGlowAnim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(postWalkGlowAnim, { toValue: 0.8, duration: 300, useNativeDriver: true }),
          Animated.timing(postWalkGlowAnim, { toValue: 0, duration: 800, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }, 500);
    };

    if (!requestedSessionId) {
      triggerQuickStatusHighlight();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    void (async () => {
      const session = await sessionsRepo.getById(requestedSessionId);
      if (cancelled) return;
      if (session) {
        setPostWalkSummarySession(session);
        return;
      }
      triggerQuickStatusHighlight();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [route.params?.postWalkSessionId, route.params?.showPostWalkSummary, navigation, postWalkGlowAnim]);

  // Scroll to walking opportunities when navigated with scrollToOpportunities param
  useEffect(() => {
    if (!route.params?.scrollToOpportunities) return;
    navigation.setParams({ scrollToOpportunities: undefined });
    const timer = setTimeout(() => {
      tourOpportunitiesRef.current?.measureInWindow((_x: number, y: number) => {
        void smoothScrollTo(Math.max(0, y + scrollYRef.current - 80));
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [route.params?.scrollToOpportunities, navigation, smoothScrollTo]);

  const navigateToManageSchedule = () => { closeMenu(); navigation.navigate('ManualSchedule', { manageMode: true }); };
  const navigateToProfile = () => { closeMenu(); navigation.navigate('Profile'); };
  const navigateToPreferences = () => { closeMenu(); navigation.push('Preferences', { manageMode: true }); };
  const navigateToSettings = () => { closeMenu(); navigation.navigate('Settings'); };
  const navigateToWeeklyData = () => { closeMenu(); navigation.navigate('WeeklyData'); };
  const navigateToAchievements = () => { closeMenu(); navigation.navigate('Achievements', { source: 'options' }); };
  const navigateToAboutHelp = () => { closeMenu(); navigation.navigate('AboutHelp'); };

  const menuItems: SideMenuItem[] = [
    { key: 'profile', label: 'Profile', icon: 'person', onPress: navigateToProfile, testID: 'dashboard-menu-profile' },
    { key: 'schedule', label: 'Manage schedule', icon: 'calendar', onPress: navigateToManageSchedule, testID: 'dashboard-menu-schedule' },
    { key: 'preferences', label: 'Preferences', icon: 'adjust', onPress: navigateToPreferences, testID: 'dashboard-menu-preferences' },
    { key: 'weekly-data', label: 'Weekly Data', icon: 'calendar', onPress: navigateToWeeklyData, testID: 'dashboard-menu-weekly-data' },
    { key: 'achievements', label: 'Achievements', icon: 'trophy', onPress: navigateToAchievements, testID: 'dashboard-menu-achievements' },
    { key: 'settings', label: 'Settings', icon: 'settings', onPress: navigateToSettings, testID: 'dashboard-menu-settings' },
    { key: 'about-help', label: 'About & Help', icon: 'info', onPress: navigateToAboutHelp, testID: 'dashboard-menu-about-help' },
  ];

  const handleLogoutFromMenu = () => {
    const doLogout = async () => {
      await firebaseAuthService.signOut();
      await authStorage.clearAll();
      setIsAuthenticated(false); setAuthUser(null);
      closeMenu();
      navigation.reset({ index: 0, routes: [{ name: 'Intro' }] });
    };
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm('Are you sure you want to log out?')) void doLogout();
      return;
    }
    showBinaryConfirm('Log out', 'Are you sure you want to log out?', 'Log out', () => { void doLogout(); }, 'destructive');
  };

  // ── Guidance helpers ──
  const dismissGuidance = useCallback((key: Parameters<typeof setGuidanceSeen>[0]) => {
    setGuidanceSeen(key, true);
    void guidanceStorage.markSeen(key);
  }, [setGuidanceSeen]);

  const handleDashboardTourFinish = useCallback(() => {
    setShowDashboardTour(false);
    setGuidanceSeen('dashboard_tour', true);
    void guidanceStorage.markSeen('dashboard_tour');
  }, [setGuidanceSeen]);

  const handleBeforeTourStep = useCallback(async (stepIndex: number): Promise<void> => {
    const refs: Array<React.RefObject<View | null>> = [
      tourMenuRef,
      tourStreakRef,
      quickStatusRef,
      tourOpportunitiesRef,
      tourManualWalkRef,
    ];
    const targetRef = refs[stepIndex];
    if (!targetRef?.current || !dashboardScrollRef.current) return;

    // Step 0 is in the fixed header. Reset scroll so header/menu are always
    // consistently visible regardless of prior user scrolling.
    if (stepIndex === 0) {
      await smoothScrollTo(0);
      return;
    }

    const screenHeight = Dimensions.get('window').height;
    const desiredScreenY = screenHeight * 0.28;
    const safeTop = 60;
    const safeBottom = screenHeight - 100;

    const scrollToTargetAndVerify = async (): Promise<boolean> => {
      const screenY = await new Promise<number>((resolve) => {
        targetRef.current?.measureInWindow((_x, y) => resolve(y));
      });

      const contentY = screenY + scrollYRef.current;
      const targetScrollY = contentY - desiredScreenY;
      await smoothScrollTo(targetScrollY);

      const finalY = await new Promise<number>((resolve) => {
        targetRef.current?.measureInWindow((_x, y) => resolve(y));
      });

      return finalY >= safeTop && finalY <= safeBottom;
    };

    let visible = await scrollToTargetAndVerify();
    if (!visible) {
      visible = await scrollToTargetAndVerify();
    }
  }, [smoothScrollTo]);

  // ── Computed values ──
  const today = new Date();
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  const dayNameRaw = today.toLocaleDateString(locale, { weekday: 'long' });
  const dayName = dayNameRaw.charAt(0).toUpperCase() + dayNameRaw.slice(1);
  const monthDay = today.toLocaleDateString(locale, { month: 'long', day: 'numeric' });
  const todayKey = format(today, 'yyyy-MM-dd');
  const goalReached = !!preferences && todayMinutesWalked >= preferences.dailyTargetMinutes;
  const showStepGoalCard = !!preferences && (preferences.strictnessMode === 'no_excuses' || preferences.stepGoalEnabled);
  const readyPrompt = getMotivationalMessage({
    currentMinutes: todayMinutesWalked,
    targetMinutes: preferences?.dailyTargetMinutes ?? 0,
    streak: streak.currentStreak,
    strictnessMode: preferences?.strictnessMode,
    now: today,
  });

  const yesterdayTarget = preferences?.dailyTargetMinutes ?? 0;
  const missedYesterday = yesterdayMinutes !== null && yesterdayTarget > 0 && yesterdayMinutes < yesterdayTarget && yesterdayMinutes > 0;
  const missedYesterdayCompletely = yesterdayMinutes !== null && yesterdayTarget > 0 && yesterdayMinutes === 0 && streak.currentStreak === 0 && streak.longestStreak > 0;
  const yesterdayMessage = missedYesterday
    ? `Yesterday you walked ${yesterdayMinutes} of ${yesterdayTarget} min — so close! Today is a fresh start.`
    : missedYesterdayCompletely
      ? streak.longestStreak > 1
        ? `Your ${streak.longestStreak}-day streak ended, but every champion has rest days. Let's go again!`
        : `Yesterday was a rest day. Today you get to start fresh!`
      : null;

  const activeTodayPlans = useMemo(
    () => upcomingPlans
      .filter((plan) => plan.date === todayKey)
      .filter((plan) => plan.status === 'planned' || plan.status === 'notified')
      .sort((a, b) => a.walkStart.localeCompare(b.walkStart)),
    [todayKey, upcomingPlans]
  );

  const opportunities = useMemo<PlanOpportunity[]>(() => {
    if (!preferences) return [];
    return activeTodayPlans
      .filter((plan) => !goalReached || plan.reason === 'manual')
      .map((plan) => {
        const walkStart = parseISO(plan.walkStart);
        const walkEnd = getPlanWalkEnd(plan);
        const gapStart = parseISO(plan.gapStart);
        const gapEnd = parseISO(plan.gapEnd);
        const notifyAt = getPlanNotifyTime(plan, preferences);
        const isManual = plan.reason === 'manual';
        return {
          key: plan.id, plan,
          timeRange: `${format(walkStart, 'h:mm a')} - ${format(walkEnd, 'h:mm a')}`,
          walkWindowLabel: isManual ? 'Personally scheduled walk' : `Available window: ${format(gapStart, 'h:mm a')} - ${format(gapEnd, 'h:mm a')}`,
          notifyLabel: `Notification time: ${format(notifyAt, 'h:mm a')}`,
        };
      });
  }, [activeTodayPlans, goalReached, preferences]);

  const horizontalPadding = width >= 768 ? 32 : width >= 480 ? 20 : 16;
  const verticalPadding = Math.max(height * 0.05, 16);
  const palette = getThemePalette(themeMode);
  const topGlowColor = withAlpha(palette.accentPrimary, themeMode === 'dark' ? 0.08 : 0.13);
  const bottomGlowColor = themeMode === 'dark' ? 'rgba(56,189,248,0.09)' : 'rgba(56,189,248,0.11)';

  const renderBackdrop = (
    <View style={styles.backdrop} pointerEvents="none">
      <View style={[styles.glow, styles.glowTop, { backgroundColor: topGlowColor }]} />
      <View style={[styles.glow, styles.glowBottom, { backgroundColor: bottomGlowColor }]} />
    </View>
  );
  const resolvedDashboardHeading = `Welcome, ${resolvedDisplayName}`;
  const dashboardHeadingStyle = resolvedDashboardHeading.length > 14 ? styles.headingCompact : styles.heading;
  const showNotificationPermissionCard =
    isNotificationsSupported &&
    notificationPermissionState !== null &&
    !notificationPermissionState.granted;
  const notificationRepairLabel =
    notificationPermissionState?.canAskAgain
      ? 'Allow notifications'
      : 'Open settings';

  // ── Variant A: no preferences ──
  if (!hasSetPreferences || !preferences) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
        {renderBackdrop}
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingHorizontal: horizontalPadding, paddingTop: verticalPadding, paddingBottom: verticalPadding }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accentPrimary} />}
        >
          <View style={styles.emptyStateStack}>
            <Text variant="title" style={dashboardHeadingStyle}>{resolvedDashboardHeading}</Text>
            <Text variant="body" color={palette.textMuted} style={styles.headingSub}>{dayName}, {monthDay}</Text>
            <Card elevated style={styles.promptCard}>
              <Text variant="body" style={styles.promptTitle}>Get started</Text>
              <Text variant="bodySmall" color={palette.textMuted} style={styles.promptText}>Set up your preferences so GapWalk can find the best walking windows in your schedule.</Text>
              <Button title="Set up preferences" onPress={() => navigation.navigate('Preferences', {})} />
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Variant B: preferences set ──
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
      {renderBackdrop}
      <View style={[styles.headerFrame, { backgroundColor: palette.bgSurfaceElevated, paddingHorizontal: horizontalPadding }]}>
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text variant="title" style={dashboardHeadingStyle}>{resolvedDashboardHeading}</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.headingDate}>{dayName}, {monthDay}</Text>
          </View>
          <View ref={tourMenuRef} style={styles.headerRight} collapsable={false}>
            <BurgerIcon onPress={openMenu} testID="dashboard-open-menu" />
          </View>
        </View>
      </View>

      <CelebrationOverlay visible={showCelebration} animValue={celebrationAnim} currentStreak={streak.currentStreak} />

      <ScrollView
        ref={dashboardScrollRef}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: horizontalPadding, paddingTop: Math.max(height * 0.03, 12), paddingBottom: Math.max(height * 0.04, 20) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accentPrimary} />}
      >
        <View style={styles.dashboardStack}>
          <Animated.View style={{ opacity: cardAnims[0], transform: [{ translateY: cardAnims[0].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
            <View style={styles.statusIntroStack}>
              <Text variant="body" style={styles.readyText}>{readyPrompt}</Text>
              {yesterdayMessage && <YesterdayCard message={yesterdayMessage} />}
              {showNotificationPermissionCard && (
                <Card elevated style={styles.permissionCard}>
                  <View style={styles.permissionCardHeader}>
                    <View style={[styles.permissionIconWrap, { backgroundColor: withAlpha(theme.colors.warning, themeMode === 'dark' ? 0.18 : 0.12) }]}>
                      <AppIcon name="bell" size={16} color={theme.colors.warning} />
                    </View>
                    <View style={styles.permissionCopy}>
                      <Text variant="body" style={styles.permissionTitle}>Reminders are turned off</Text>
                      <Text variant="bodySmall" color={palette.textMuted} style={styles.permissionBody}>
                        GapWalk can still show your schedule and let you start manual walks, but it will not proactively remind you when a walk window opens until notifications are enabled.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.permissionButtonRow}>
                    <Button
                      title={notificationRepairLabel}
                      onPress={() => { void handleRepairNotifications(); }}
                      loading={isRepairingNotifications}
                      variant={notificationPermissionState?.canAskAgain ? 'primary' : 'secondary'}
                      style={styles.permissionButton}
                    />
                  </View>
                </Card>
              )}
            </View>
          </Animated.View>

          <Animated.View
            ref={tourStreakRef}
            collapsable={false}
            style={{ opacity: cardAnims[1], transform: [{ translateY: cardAnims[1].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}
          >
            <StreakCard streak={streak} />
          </Animated.View>

          {unlockedAchievements.length > 0 && (
            <Animated.View style={{ opacity: cardAnims[2], transform: [{ translateY: cardAnims[2].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
              <AchievementsSection unlockedAchievements={unlockedAchievements} />
            </Animated.View>
          )}

          <View collapsable={false}>
            <View style={styles.quickStatusStack} collapsable={false}>
              <View ref={quickStatusRef} collapsable={false}>
                <Animated.View style={[
                  { opacity: cardAnims[3], transform: [{ translateY: cardAnims[3].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
                  { borderRadius: 16, overflow: 'hidden' },
                ]}>
                  <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 2, borderColor: palette.accentPrimary, opacity: postWalkGlowAnim }} pointerEvents="none" />
                  <View style={styles.quickStatusContent}>
                    <Text variant="body" style={styles.qsTitle}>Quick Status</Text>
                    <View style={styles.quickStatusCards}>
                      <StatCard
                        title="Daily Target"
                        current={todayMinutesWalked}
                        target={preferences.dailyTargetMinutes}
                        unitLabel="minutes"
                        tone="target"
                      />
                      <StatCard
                        title="Notification Count"
                        current={todayNotificationCount}
                        target={preferences.notificationCountPerDay}
                        unitLabel="times"
                        tone="notifications"
                      />
                      {showStepGoalCard && (
                        <StatCard
                          title="Step Goal"
                          current={todaySteps}
                          target={preferences.stepGoal}
                          unitLabel="steps"
                          tone="steps"
                        />
                      )}
                    </View>
                  </View>
                </Animated.View>
              </View>

              <Animated.View style={{ opacity: cardAnims[4], transform: [{ translateY: cardAnims[4].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
                <WeeklyStatsCard weeklyStats={weeklyStats} prevWeeklyStats={prevWeeklyStats} />
              </Animated.View>
            </View>
          </View>

          <Animated.View style={{ opacity: cardAnims[5], transform: [{ translateY: cardAnims[5].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
            <View style={styles.opportunitySection} collapsable={false}>
              <View ref={tourOpportunitiesRef} collapsable={false}>
              <View style={styles.gapHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={styles.gapTitle}>Walking Opportunities</Text>
                  <Text variant="muted" style={styles.gapSubtitle}>See your next walk windows and reminder times.</Text>
                </View>
                <View>
                  <IconButton
                    onPress={() => { openAddWalkModal(); }}
                    iconName="plus"
                    iconStrokeWidth={2.4}
                    variant="info"
                    size="icon"
                    accessibilityLabel="Add walk"
                    testID="dashboard-add-walk"
                    style={styles.addWalkBtn}
                  />
                </View>
              </View>

              {goalReached && opportunities.length === 0 ? (
                <Card elevated style={styles.emptyCard}>
                  <Text variant="body" style={styles.emptyText}>Goal reached for today</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.emptyHint}>Nice work. Extra walks are still tracked, but reminders pause until tomorrow.</Text>
                </Card>
              ) : opportunities.length === 0 ? (
                <Card elevated style={styles.emptyCard}>
                  <Ionicons name="walk-outline" size={28} color={palette.textMuted} style={{ marginBottom: 8 }} />
                  <Text variant="body" style={styles.emptyText}>No opportunities yet</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.emptyHint}>No suitable gaps were found right now. Pull to refresh, or start a manual walk below.</Text>
                </Card>
              ) : (
                <View style={styles.opportunityList}>
                  {goalReached && (
                    <Card elevated style={styles.emptyCard}>
                      <Text variant="body" style={styles.emptyText}>Goal reached for today</Text>
                      <Text variant="bodySmall" color={palette.textMuted} style={styles.emptyHint}>You already hit today&apos;s target. Any manually scheduled walks below still work.</Text>
                    </Card>
                  )}
                  {opportunities.map((opportunity) => (
                    <GapItem
                      key={opportunity.key}
                      timeRange={opportunity.timeRange}
                      walkWindowLabel={opportunity.walkWindowLabel}
                      notifyLabel={opportunity.notifyLabel}
                      duration={opportunity.plan.suggestedDurationMinutes}
                      usedMinutes={0}
                      onCancel={() => cancelOpportunity(opportunity)}
                      onChange={() => openChangeOpportunity(opportunity)}
                    />
                  ))}
                </View>
              )}

              {(completedPlans.length > 0 || missedPlans.length > 0) && (
                <View style={styles.historyStack}>
                  {completedPlans.length > 0 && <CompletedPlansSection completedPlans={completedPlans} />}
                  {missedPlans.length > 0 && <MissedPlansSection missedPlans={missedPlans} />}
                </View>
              )}
              </View>

              <View ref={tourManualWalkRef} style={styles.footerStack} collapsable={false}>
                <Button title={walkActionTitle} onPress={handleWalkActionPress} testID="dashboard-start-manual-walk" />
                <Text variant="muted" style={styles.dashboardFooter}>{walkActionHint}</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </ScrollView>

      {/* Change Walk Modal */}
      <WalkTimeModal
        visible={showChangeModal}
        onRequestClose={closeChangeModal}
        title="Change walk window"
        subtitle="Set your preferred start time and walk duration."
        saveLabel={changeQuietHoursBypass ? 'Update anyway' : 'Update'}
        saving={savingChange}
        saveDisabled={!hasChangeDraft}
        error={changeError}
        hour={changeHour}
        minute={changeMinute}
        period={changePeriod}
        duration={changeDuration}
        onHourChange={setChangeHour}
        onMinuteChange={setChangeMinute}
        onPeriodChange={setChangePeriod}
        onDurationChange={setChangeDuration}
        notificationTimingLabel={editingOpportunity?.plan.reason === 'manual' ? 'When to send reminders' : undefined}
        notificationTimingValue={editingOpportunity?.plan.reason === 'manual' ? changeNotifyChoice : undefined}
        notificationTimingOptions={editingOpportunity?.plan.reason === 'manual' ? MANUAL_REMINDER_OPTIONS : undefined}
        onNotificationTimingChange={editingOpportunity?.plan.reason === 'manual'
          ? (value) => setChangeNotifyChoice(value as ManualReminderChoice)
          : undefined}
        onSave={requestSaveWalkChange}
        onCancel={closeChangeModal}
      />

      {/* Add Walk Modal */}
      <WalkTimeModal
        visible={showAddWalkModal}
        onRequestClose={closeAddWalkModal}
        title="Add a MicroWalk"
        subtitle="Pick a time, duration, and reminder timing for this MicroWalk."
        saveLabel={quietHoursBypass ? 'Save anyway' : 'Save'}
        saving={savingAddWalk}
        error={addWalkError}
        hour={addWalkHour}
        minute={addWalkMinute}
        period={addWalkPeriod}
        duration={addWalkDuration}
        onHourChange={setAddWalkHour}
        onMinuteChange={setAddWalkMinute}
        onPeriodChange={setAddWalkPeriod}
        onDurationChange={setAddWalkDuration}
        notificationTimingLabel="When to send reminders"
        notificationTimingValue={addNotifyChoice}
        notificationTimingOptions={MANUAL_REMINDER_OPTIONS}
        onNotificationTimingChange={(value) => setAddNotifyChoice(value as ManualReminderChoice)}
        onSave={requestSaveManualWalk}
        onCancel={closeAddWalkModal}
      />

      <BadgeUnlockedModal
        visible={showBadgeModal}
        onClose={() => setShowBadgeModal(false)}
        newBadgeIds={newBadgeIds}
        animValue={badgeAnim}
      />

      <SideMenu
        visible={menuVisible}
        onClose={closeMenu}
        menuItems={menuItems}
        onLogout={handleLogoutFromMenu}
        authUser={authUser}
        displayName={resolvedDisplayName}
        hasSetPreferences={hasSetPreferences}
        menuPanelWidth={menuPanelWidth}
        slideAnim={menuSlide}
      />
      <SuccessToast
        visible={showSaveToast}
        message={saveToastMessage}
        onDismiss={() => setShowSaveToast(false)}
      />

      <AppModal visible={messageDialog !== null} onClose={() => setMessageDialog(null)} title={messageDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{messageDialog?.message}</Text>
          <Button title="OK" onPress={() => setMessageDialog(null)} />
        </View>
      </AppModal>

      <AppModal visible={confirmDialog !== null} onClose={() => setConfirmDialog(null)} title={confirmDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{confirmDialog?.message}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Cancel" onPress={() => setConfirmDialog(null)} variant="secondary" style={{ flex: 1 }} />
            <Button
              title={confirmDialog?.confirmText ?? 'Confirm'}
              onPress={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }}
              variant={confirmDialog?.confirmStyle === 'destructive' ? 'danger' : 'primary'}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </AppModal>

      {/* In-app walk ready prompt */}
      <AppModal
        visible={pendingInAppWalkPrompt !== null && walkCountdown === null}
        onClose={handleWalkPromptDismiss}
        title={pendingInAppWalkPrompt ? `Ready for your ${pendingInAppWalkPrompt.walkStart} - ${pendingInAppWalkPrompt.walkEnd} MicroWalk?` : ''}
      >
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>
            {pendingInAppWalkPrompt ? `${pendingInAppWalkPrompt.duration} min walk session` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button
              title="Not Now"
              onPress={() => { void handleWalkPromptNotNow(); }}
              variant="danger"
              style={{ flex: 1 }}
            />
            <Button
              title="Yes"
              onPress={() => { void handleWalkPromptYes(); }}
              variant="primary"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </AppModal>

      <AppModal
        visible={postWalkSummarySession !== null}
        onClose={closePostWalkSummary}
      >
        {postWalkSummarySession ? (
          <WalkCompletionSummary
            themeMode={themeMode}
            palette={palette}
            stats={{
              activeSeconds: postWalkSummarySession.activeSeconds,
              distanceMeters: postWalkSummarySession.distanceMeters ?? 0,
              steps: postWalkSummarySession.steps ?? 0,
            }}
            distanceUnit={distanceUnit}
            actionLabel="Close summary"
            onAction={closePostWalkSummary}
          />
        ) : null}
      </AppModal>

      {/* Walk countdown overlay */}
      {walkCountdown !== null && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 }]}>
          <Animated.Text
            style={{
              fontSize: 120,
              fontWeight: '800',
              color: '#fff',
              transform: [{ scale: walkCountdownScaleAnim }],
            }}
          >
            {walkCountdown}
          </Animated.Text>
        </View>
      )}

      <TourOverlay
        visible={showDashboardTour}
        targets={tourTargets}
        steps={DASHBOARD_TOUR_STEPS}
        onFinish={handleDashboardTourFinish}
        onBeforeStep={handleBeforeTourStep}
      />
    </SafeAreaView>
  );
};

export const DashboardScreen: React.FC<Props> = (props) => {
  return <DashboardScreenInner {...props} />;
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bgApp, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130 },
  glowTop: { top: -120, right: -80 },
  glowBottom: { bottom: -130, left: -70 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18 },
  headerCenter: { flex: 1, alignItems: 'flex-start' },
  headerRight: { width: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  heading: { textAlign: 'left', fontSize: theme.fontSize.xl + 2, flexShrink: 1 },
  headingCompact: { textAlign: 'left', fontSize: theme.fontSize.lg + 3, lineHeight: theme.fontSize.lg + 8, flexShrink: 1 },
  headingDate: { textAlign: 'left', marginTop: 2 },
  scroll: { width: '100%' },
  dashboardStack: { gap: theme.spacing.md },
  emptyStateStack: { gap: theme.spacing.md },
  statusIntroStack: { gap: theme.spacing.md },
  quickStatusStack: { gap: theme.spacing.md },
  quickStatusContent: { gap: theme.spacing.md, paddingHorizontal: 4 },
  quickStatusCards: { gap: theme.spacing.md },
  opportunitySection: { gap: theme.spacing.md },
  opportunityList: { gap: theme.spacing.sm },
  historyStack: { gap: theme.spacing.md },
  footerStack: { gap: theme.spacing.md },
  headerFrame: { backgroundColor: theme.colors.bgSurfaceElevated, borderRadius: 0, borderWidth: 0, width: '100%', marginHorizontal: 0, marginTop: 0 },
  qsTitle: { fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.md + 2 },
  gapHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  gapTitle: { fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.md + 2, marginBottom: 4 },
  gapSubtitle: { fontSize: theme.fontSize.sm, lineHeight: 20 },
  addWalkBtn: { marginLeft: 10, marginTop: 2 },
  emptyCard: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  emptyText: { fontWeight: theme.fontWeight.semibold, marginBottom: 4 },
  emptyHint: { textAlign: 'center', lineHeight: 18 },
  promptCard: { gap: 10 },
  promptTitle: { fontWeight: theme.fontWeight.semibold },
  promptText: { lineHeight: 18 },
  permissionCard: { gap: 14, paddingVertical: 18, paddingHorizontal: 18 },
  permissionCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  permissionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  permissionCopy: { flex: 1, gap: 4 },
  permissionTitle: { fontWeight: theme.fontWeight.semibold },
  permissionBody: { lineHeight: 20 },
  permissionButtonRow: { alignItems: 'flex-end', marginTop: 10 },
  permissionButton: {},
  dashboardFooter: { textAlign: 'center', lineHeight: 20 },
  readyText: { textAlign: 'center', fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
  headingSub: { textAlign: 'left', marginTop: 4 },
});
