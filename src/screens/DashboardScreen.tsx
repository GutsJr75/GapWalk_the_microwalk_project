import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, Pressable, Animated, Easing, useWindowDimensions, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { StatCard } from '../components/StatCard';
import { GapItem } from '../components/GapItem';
import { Card } from '../components/Card';
import { type AppIconName } from '../components/AppIcon';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { preferencesRepo } from '../data/repositories/preferencesRepo';
import { plansRepo } from '../data/repositories/plansRepo';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { scheduleSourceRepo } from '../data/repositories/scheduleSourceRepo';
import { eventsRepo } from '../data/repositories/eventsRepo';
import { achievementsRepo, type UnlockedAchievement, type AchievementId } from '../data/repositories/achievementsRepo';
import { gapEngine } from '../services/gapEngine';
import { isNotificationsSupported, notificationService } from '../services/notifications';
import { notificationPlanActions } from '../services/notificationPlanActions';
import { googleCalendarService } from '../services/googleCalendar';
import { NudgePlan } from '../types';
import { calculateStreak, calculateWeeklyStats, getMotivationalMessage, StreakData, WeeklyStats } from '../utils/statsUtils';
import { addMinutes, format, isAfter, isBefore, parseISO, subMinutes, subDays } from 'date-fns';
import { timeUtils } from '../utils/time';
import { requestAllPermissions } from '../services/permissions';
import { toUserFriendlyError } from '../utils/errorMessages';
import { authStorage } from '../data/authStorage';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const MENU_WIDTH_RATIO = 0.78;
const MENU_MAX_WIDTH = 360;

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
  color,
  testID,
}: {
  onPress: () => void;
  color: string;
  testID?: string;
}) => (
  <Pressable
    onPress={() => {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress();
    }}
    style={({ pressed }) => [styles.burgerBtn, pressed && { opacity: 0.6, transform: [{ scale: 0.9 }] }]}
    hitSlop={10}
    testID={testID}
    accessibilityLabel={testID}
  >
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
  </Pressable>
);

export const DashboardScreen: React.FC<Props> = ({ navigation, route }) => {
  const {
    preferences, setPreferences, hasSetPreferences, setHasSetPreferences,
    todayMinutesWalked, todayNotificationCount, upcomingPlans,
    todaySteps, setTodaySteps,
    setTodayStats, setUpcomingPlans,
    hasRequestedPermissions, setHasRequestedPermissions,
    setHasLocationPermission, setHasNotificationPermission, setHasActivityPermission,
    themeMode, language,
    authUser,
    profileDisplayName,
    isAuthenticated,
    hasCompletedOnboarding,
    setIsAuthenticated,
    setAuthUser,
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
  const [unlockedAchievements, setUnlockedAchievements] = useState<UnlockedAchievement[]>([]);
  const [newBadgeIds, setNewBadgeIds] = useState<AchievementId[]>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
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
  const quickStatusRef = useRef<View>(null);

  // ── Change walk modal state ──
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<PlanOpportunity | null>(null);
  const [changeHour, setChangeHour] = useState('');
  const [changeMinute, setChangeMinute] = useState('');
  const [changePeriod, setChangePeriod] = useState<TimePeriod>('AM');
  const [changeDuration, setChangeDuration] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [savingChange, setSavingChange] = useState(false);
  const [changeInitialState, setChangeInitialState] = useState<{
    hour: string; minute: string; period: TimePeriod; duration: string;
  } | null>(null);
  const [changeQuietHoursBypass, setChangeQuietHoursBypass] = useState(false);
  const hasChangeDraft =
    !!changeInitialState &&
    (changeHour !== changeInitialState.hour || changeMinute !== changeInitialState.minute ||
      changePeriod !== changeInitialState.period || changeDuration !== changeInitialState.duration);

  // ── Add walk modal state ──
  const [showAddWalkModal, setShowAddWalkModal] = useState(false);
  const [addWalkHour, setAddWalkHour] = useState('');
  const [addWalkMinute, setAddWalkMinute] = useState('');
  const [addWalkPeriod, setAddWalkPeriod] = useState<TimePeriod>('AM');
  const [addWalkDuration, setAddWalkDuration] = useState('10');
  const [addWalkError, setAddWalkError] = useState<string | null>(null);
  const [savingAddWalk, setSavingAddWalk] = useState(false);
  const [addWalkInitialState, setAddWalkInitialState] = useState<{
    hour: string; minute: string; period: TimePeriod; duration: string;
  } | null>(null);
  const [quietHoursBypass, setQuietHoursBypass] = useState(false);

  useEffect(() => {
    if (isAuthenticated || hasCompletedOnboarding) return;
    navigation.reset({ index: 0, routes: [{ name: 'Intro' }] });
  }, [hasCompletedOnboarding, isAuthenticated, navigation]);

  const resolvedDisplayName = useMemo(() => {
    const localName = profileDisplayName?.trim();
    if (localName) return localName;
    const authName = authUser?.name?.trim();
    if (authName) return authName;
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
    const manualPlans = activePlans.filter((plan) => plan.reason === 'manual');

    const remainingTargetMinutes = Math.max(0, prefs.dailyTargetMinutes - minutesWalked);
    if (remainingTargetMinutes <= 0) {
      for (const plan of autoPlans) await plansRepo.updateStatus(plan.id, 'cancelled');
      if (isNotificationsSupported) {
        await notificationService.cancelWalkNudges();
        for (const plan of manualPlans) await notificationService.scheduleManualNudge(plan);
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
      await notificationService.cancelWalkNudges();
      const futurePlans = await plansRepo.getUpcomingPlans(100);
      await notificationService.scheduleMultipleNudges(futurePlans.filter(p => p.reason !== 'manual'), prefs);
      for (const plan of futurePlans.filter(p => p.reason === 'manual')) {
        await notificationService.scheduleManualNudge(plan);
      }
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

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => console.error('Dashboard load failed:', e));
      if (!hasRequestedPermissions) {
        requestAllPermissions().then((results) => {
          setHasNotificationPermission(results.notifications);
          setHasActivityPermission(results.activityRecognition);
          setHasRequestedPermissions(true);
        }).catch((e) => {
          if (__DEV__) console.warn('Permission request failed:', e);
        });
      }
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
    }, [load, hasRequestedPermissions])
  );

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
    try { await load(); } catch (e) { if (__DEV__) console.error('Dashboard refresh failed:', e); }
    finally { setRefreshing(false); }
  }, [load]);

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
          await notificationService.cancelWalkNudges();
          const futurePlans = await plansRepo.getUpcomingPlans(100);
          await notificationService.scheduleMultipleNudges(futurePlans, preferences);
        }
        const remainingToday = refreshedUpcoming
          .filter((plan) => plan.date === todayKey)
          .filter((plan) => plan.status === 'planned' || plan.status === 'notified')
          .sort((a, b) => a.walkStart.localeCompare(b.walkStart));
        if (!preferences || remainingToday.length === 0) {
          Alert.alert('No walk windows today', 'No walk windows are available today.');
          return;
        }
        const next = remainingToday[0];
        const nextWalkStart = parseISO(next.walkStart);
        let nextNotify = nextWalkStart;
        if (preferences.whenToNotify === 'delay') {
          nextNotify = subMinutes(nextWalkStart, preferences.notifyDelayMinutes ?? 5);
          const nextGapStart = parseISO(next.gapStart);
          if (isBefore(nextNotify, nextGapStart)) nextNotify = nextGapStart;
        }
        const nextEndRaw = addMinutes(parseISO(next.walkStart), next.suggestedDurationMinutes);
        const nextGapEnd = parseISO(next.gapEnd);
        const nextEnd = isAfter(nextEndRaw, nextGapEnd) ? nextGapEnd : nextEndRaw;
        Alert.alert('Next walk window selected',
          `Walk time: ${format(nextWalkStart, 'h:mm a')} - ${format(nextEnd, 'h:mm a')}\nNotification time: ${format(nextNotify, 'h:mm a')}`);
      } catch (error) {
        if (__DEV__) console.error('Failed to cancel walk opportunity:', error);
        Alert.alert('Could Not Cancel', toUserFriendlyError(error));
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
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, cancel', style: 'destructive', onPress: () => { void performCancel(); } },
    ]);
  }, [preferences, setUpcomingPlans]);

  // ── Change walk handlers ──
  const openChangeOpportunity = (opportunity: PlanOpportunity) => {
    const parts = to12HourParts(opportunity.plan.walkStart);
    const initialDuration = String(opportunity.plan.suggestedDurationMinutes);
    setEditingOpportunity(opportunity);
    setChangeHour(parts.hour); setChangeMinute(parts.minute);
    setChangePeriod(parts.period); setChangeDuration(initialDuration);
    setChangeInitialState({ hour: parts.hour, minute: parts.minute, period: parts.period, duration: initialDuration });
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
    Alert.alert(title, message, [{ text: 'No', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: closeNow }]);
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
    const nextGapStart = oldGapStart;
    const nextGapEnd = oldGapEnd;
    try {
      setSavingChange(true);
      const nextReason = editingOpportunity.plan.reason === 'manual' ? 'manual' : 'customized';
      await plansRepo.updateTiming(editingOpportunity.plan.id, {
        gapStart: nextGapStart.toISOString(), gapEnd: nextGapEnd.toISOString(),
        walkStart: nextStart.toISOString(), suggestedDurationMinutes: duration,
        reason: nextReason, status: 'planned',
      });
      if (isNotificationsSupported) {
        await notificationService.cancelWalkNudges();
        const futurePlans = await plansRepo.getUpcomingPlans(100);
        await notificationService.scheduleMultipleNudges(
          futurePlans.filter((plan) => plan.reason !== 'manual'),
          preferences,
        );
        for (const plan of futurePlans.filter((plan) => plan.reason === 'manual')) {
          await notificationService.scheduleManualNudge(plan);
        }
      }
      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
      setShowChangeModal(false); setEditingOpportunity(null); setChangeError(null); setChangeInitialState(null); setChangeQuietHoursBypass(false);
    } catch (error) {
      if (__DEV__) console.error('Failed to update walk window:', error);
      Alert.alert('Could Not Update', toUserFriendlyError(error));
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
      let hour24 = hour % 12; if (changePeriod === 'PM') hour24 += 12;
      previewStart.setHours(hour24, minute, 0, 0);
      const previewEnd = addMinutes(previewStart, duration);
      if (!isAfter(previewStart, new Date())) { setChangeError('Choose a future time for this walk.'); return; }
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
    Alert.alert('Update this walk?', message, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Update', onPress: () => { void applyWalkChange(); } },
    ]);
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
    setAddWalkHour(initialHour); setAddWalkMinute(initialMinute);
    setAddWalkPeriod(initialPeriod); setAddWalkDuration(initialDuration);
    setAddWalkInitialState({ hour: initialHour, minute: initialMinute, period: initialPeriod, duration: initialDuration });
    setAddWalkError(null); setQuietHoursBypass(false); setShowAddWalkModal(true);
  };

  const closeAddWalkModal = () => {
    if (savingAddWalk) return;
    const hasDraftChanges = !!addWalkInitialState &&
      (addWalkHour !== addWalkInitialState.hour || addWalkMinute !== addWalkInitialState.minute ||
        addWalkPeriod !== addWalkInitialState.period || addWalkDuration !== addWalkInitialState.duration);
    const closeNow = () => { setShowAddWalkModal(false); setAddWalkError(null); setAddWalkInitialState(null); };
    if (!hasDraftChanges) { closeNow(); return; }
    const title = 'Cancel this walk setup?';
    const message = 'Your unsaved walk details will be lost. Do you want to close this form?';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${title}\n\n${message}`)) closeNow();
      return;
    }
    Alert.alert(title, message, [{ text: 'No', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: closeNow }]);
  };

  const saveManualWalk = async (bypassQuiet = false) => {
    if (!preferences || savingAddWalk) return;
    const hour = parseInt(addWalkHour, 10); const minute = parseInt(addWalkMinute, 10);
    const duration = parseInt(addWalkDuration, 10);
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
        status: 'planned', reason: 'manual', createdAt: new Date().toISOString(),
      };
      await plansRepo.save(plan);
      if (isNotificationsSupported) await notificationService.scheduleManualNudge(plan);
      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
      setShowAddWalkModal(false); setAddWalkError(null); setAddWalkInitialState(null);
    } catch (error) {
      if (__DEV__) console.error('Failed to create manual walk:', error);
      setAddWalkError(toUserFriendlyError(error));
    } finally { setSavingAddWalk(false); }
  };

  const requestSaveManualWalk = () => {
    if (savingAddWalk) return;
    const baseMessage = 'Do you want to save this walk and schedule a notification?';
    const quietMessage = `This walk is inside your quiet hours.\n\nDo you still want to save it and schedule a notification?`;
    const message = quietHoursBypass ? quietMessage : baseMessage;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(message)) void saveManualWalk(quietHoursBypass);
      return;
    }
    Alert.alert('Save this walk?', message, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, save', onPress: () => { void saveManualWalk(quietHoursBypass); } },
    ]);
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
    navigation.setParams({ showPostWalkSummary: undefined });

    // Wait for entrance animations to settle, then scroll and glow
    const timer = setTimeout(() => {
      quickStatusRef.current?.measureInWindow((_x, y) => {
        dashboardScrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
      });

      // Pulse glow: fade in then fade out
      postWalkGlowAnim.setValue(0);
      Animated.sequence([
        Animated.timing(postWalkGlowAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(postWalkGlowAnim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.timing(postWalkGlowAnim, { toValue: 0.8, duration: 300, useNativeDriver: true }),
        Animated.timing(postWalkGlowAnim, { toValue: 0, duration: 800, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 500);

    return () => clearTimeout(timer);
  }, [route.params?.showPostWalkSummary, navigation, postWalkGlowAnim]);

  const navigateToManageSchedule = () => { closeMenu(); navigation.navigate('ScheduleOverview'); };
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
      await authStorage.clearAll();
      setIsAuthenticated(false); setAuthUser(null);
      closeMenu();
      navigation.reset({ index: 0, routes: [{ name: 'Intro' }] });
    };
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm('Are you sure you want to log out?')) void doLogout();
      return;
    }
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => { void doLogout(); } },
    ]);
  };

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
      let notifyAt = walkStart;
      if (plan.reason !== 'manual' && preferences.whenToNotify === 'delay') {
        notifyAt = subMinutes(walkStart, preferences.notifyDelayMinutes ?? 5);
        if (isBefore(notifyAt, gapStart)) notifyAt = gapStart;
      }
      const isManual = plan.reason === 'manual';
      return {
        key: plan.id, plan,
        timeRange: `${format(walkStart, 'h:mm a')} - ${format(walkEnd, 'h:mm a')}`,
        walkWindowLabel: isManual ? 'Personally scheduled walk' : `Available window: ${format(gapStart, 'h:mm a')} - ${format(gapEnd, 'h:mm a')}`,
        notifyLabel: `Notification time: ${format(notifyAt, 'h:mm a')}`,
      };
    });
  }, [activeTodayPlans, goalReached, preferences]);

  const horizontalPadding = Math.max(width * 0.1, 16);
  const verticalPadding = Math.max(height * 0.05, 16);
  const palette = getThemePalette(themeMode);
  const topGlowColor = themeMode === 'dark' ? 'rgba(46,233,166,0.08)' : 'rgba(46,233,166,0.13)';
  const bottomGlowColor = themeMode === 'dark' ? 'rgba(56,189,248,0.09)' : 'rgba(56,189,248,0.11)';

  const renderBackdrop = (
    <View style={styles.backdrop} pointerEvents="none">
      <View style={[styles.glow, styles.glowTop, { backgroundColor: topGlowColor }]} />
      <View style={[styles.glow, styles.glowBottom, { backgroundColor: bottomGlowColor }]} />
    </View>
  );
  const resolvedDashboardHeading = `Welcome, ${resolvedDisplayName}`;
  const dashboardHeadingStyle = resolvedDashboardHeading.length > 14 ? styles.headingCompact : styles.heading;

  // ── Variant A: no preferences ──
  if (!hasSetPreferences || !preferences) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
        {renderBackdrop}
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingHorizontal: horizontalPadding, paddingTop: verticalPadding, paddingBottom: verticalPadding }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accentPrimary} />}
        >
          <Text variant="title" style={dashboardHeadingStyle}>{resolvedDashboardHeading}</Text>
          <Text variant="body" color={palette.textMuted} style={styles.headingSub}>{dayName}, {monthDay}</Text>
          <Card elevated style={styles.promptCard}>
            <Text variant="body" style={styles.promptTitle}>Get started</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.promptText}>Set up your preferences so GapWalk can find the best walking windows in your schedule.</Text>
            <Button title="Set up preferences" onPress={() => navigation.navigate('Preferences', {})} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Variant B: preferences set ──
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
      {renderBackdrop}
      <View style={[styles.headerFrame, { backgroundColor: palette.bgSurfaceElevated, paddingHorizontal: Math.max(width * 0.075, 16) }]}>
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text variant="title" style={dashboardHeadingStyle}>{resolvedDashboardHeading}</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.headingDate}>{dayName}, {monthDay}</Text>
          </View>
          <View style={styles.headerRight}>
            <BurgerIcon onPress={openMenu} color={palette.textPrimary} testID="dashboard-open-menu" />
          </View>
        </View>
      </View>

      <ScrollView
        ref={dashboardScrollRef}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: Math.max(width * 0.1, 16), paddingTop: Math.max(height * 0.03, 12), paddingBottom: Math.max(height * 0.04, 20) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accentPrimary} />}
      >
        <CelebrationOverlay visible={showCelebration} animValue={celebrationAnim} currentStreak={streak.currentStreak} />

        <Animated.View style={{ opacity: cardAnims[0], transform: [{ translateY: cardAnims[0].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          <Text variant="body" style={styles.readyText}>{readyPrompt}</Text>
          {yesterdayMessage && <YesterdayCard message={yesterdayMessage} />}
        </Animated.View>

        <Animated.View style={{ opacity: cardAnims[1], transform: [{ translateY: cardAnims[1].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          <StreakCard streak={streak} />
        </Animated.View>

        <Animated.View style={{ opacity: cardAnims[2], transform: [{ translateY: cardAnims[2].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          <AchievementsSection unlockedAchievements={unlockedAchievements} />
        </Animated.View>

        <View ref={quickStatusRef} collapsable={false}>
          <Animated.View style={[
            { opacity: cardAnims[3], transform: [{ translateY: cardAnims[3].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
            { borderRadius: 16, overflow: 'hidden' },
          ]}>
            <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 2, borderColor: palette.accentPrimary, opacity: postWalkGlowAnim }} pointerEvents="none" />
            <Text variant="body" style={styles.qsTitle}>Quick Status</Text>
            <StatCard title="Daily Target" current={todayMinutesWalked} target={preferences.dailyTargetMinutes} unitLabel="minutes" tone="target" />
            <StatCard title="Notification Count" current={todayNotificationCount} target={preferences.notificationCountPerDay} unitLabel="times" tone="notifications" />
            {showStepGoalCard && <StatCard title="Step Goal" current={todaySteps} target={preferences.stepGoal} unitLabel="steps" tone="steps" />}
          </Animated.View>

          <Animated.View style={{ opacity: cardAnims[4], transform: [{ translateY: cardAnims[4].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
            <WeeklyStatsCard weeklyStats={weeklyStats} prevWeeklyStats={prevWeeklyStats} />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: cardAnims[5], transform: [{ translateY: cardAnims[5].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <View style={styles.gapHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={styles.gapTitle}>Walking Opportunities</Text>
            <Text variant="muted" style={styles.gapSubtitle}>See your next walk windows and reminder times.</Text>
          </View>
          <Pressable
            onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); openAddWalkModal(); }}
            hitSlop={12}
            style={({ pressed }) => [styles.addWalkBtn, { borderColor: palette.borderStrong }, pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] }]}
          >
            <Ionicons name="add" size={22} color={palette.accentPrimary} />
          </Pressable>
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
          <>
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
          </>
        )}

        <CompletedPlansSection completedPlans={completedPlans} />
        <MissedPlansSection missedPlans={missedPlans} />

        <Button title="Start Manual Walk" onPress={() => navigation.navigate('Walking', {})} style={styles.walkBtn} testID="dashboard-start-manual-walk" />
        <Text variant="muted" style={styles.dashboardFooter}>Your privacy matters. So does your health.</Text>
        </Animated.View>
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
        onSave={requestSaveWalkChange}
        onCancel={closeChangeModal}
      />

      {/* Add Walk Modal */}
      <WalkTimeModal
        visible={showAddWalkModal}
        onRequestClose={closeAddWalkModal}
        title="Add a MicroWalk"
        subtitle="Pick a time and duration. You'll get a notification when it's time."
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
        hasSetPreferences={hasSetPreferences}
        menuPanelWidth={menuPanelWidth}
        slideAnim={menuSlide}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bgApp, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130 },
  glowTop: { top: -120, right: -80 },
  glowBottom: { bottom: -130, left: -70 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18 },
  headerCenter: { flex: 1, alignItems: 'flex-start' },
  headerRight: { width: 32, alignItems: 'flex-end' },
  heading: { textAlign: 'left', fontSize: theme.fontSize.xl + 2 },
  headingCompact: { textAlign: 'left', fontSize: theme.fontSize.lg + 3, lineHeight: theme.fontSize.lg + 8 },
  headingSub: { textAlign: 'left', marginBottom: 20, marginTop: 4 },
  headingDate: { textAlign: 'left', marginTop: 2 },
  burgerBtn: { padding: 3, transform: [{ scale: 0.8 }] },
  burgerLine: { width: 18, height: 2, backgroundColor: theme.colors.textPrimary, marginVertical: 2, borderRadius: 1 },
  scroll: { width: '100%' },
  headerFrame: { backgroundColor: theme.colors.bgSurfaceElevated, borderRadius: 0, borderWidth: 0, width: '100%', marginHorizontal: 0, marginTop: 0 },
  qsTitle: { fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.md + 2, marginBottom: 12, marginTop: 10 },
  gapHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 24, marginBottom: 12 },
  gapTitle: { fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.md + 2, marginBottom: 4 },
  gapSubtitle: { fontSize: theme.fontSize.sm, lineHeight: 20 },
  addWalkBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 10, marginTop: 2 },
  emptyCard: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, marginBottom: 12 },
  emptyText: { fontWeight: theme.fontWeight.semibold, marginBottom: 4 },
  emptyHint: { textAlign: 'center', lineHeight: 18 },
  promptCard: { marginBottom: 16, gap: 10 },
  promptTitle: { fontWeight: theme.fontWeight.semibold },
  promptText: { lineHeight: 18 },
  walkBtn: { marginBottom: 20 },
  dashboardFooter: { textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  readyText: { marginTop: 16, marginBottom: 16, textAlign: 'center', fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
});
