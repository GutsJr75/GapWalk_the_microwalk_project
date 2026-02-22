import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity, Modal, Animated, Easing, useWindowDimensions, Platform, TextInput, KeyboardAvoidingView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { StatCard } from '../components/StatCard';
import { GapItem } from '../components/GapItem';
import { Card } from '../components/Card';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { preferencesRepo } from '../lib/repositories/preferencesRepo';
import { plansRepo } from '../lib/repositories/plansRepo';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';
import { eventsRepo } from '../lib/repositories/eventsRepo';
import { achievementsRepo, ACHIEVEMENTS, UnlockedAchievement, getAchievementDef, AchievementId } from '../lib/repositories/achievementsRepo';
import { gapEngine } from '../lib/gapEngine';
import { isNotificationsSupported, notificationService } from '../lib/notifications';
import { googleCalendarService } from '../lib/googleCalendar';
import { NudgePlan, Preferences } from '../lib/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calculateStreak, calculateWeeklyStats, getMotivationalMessage, StreakData, WeeklyStats } from '../lib/statsUtils';
import { addMinutes, format, isAfter, isBefore, parseISO, subMinutes, subDays, isSameDay } from 'date-fns';
import { timeUtils } from '../lib/time';
import { requestAllPermissions } from '../lib/permissions';

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

const getPlanWalkEnd = (plan: NudgePlan): Date => {
  const walkStart = parseISO(plan.walkStart);
  const rawWalkEnd = addMinutes(walkStart, Math.max(1, plan.suggestedDurationMinutes));
  const gapEnd = parseISO(plan.gapEnd);
  return isAfter(rawWalkEnd, gapEnd) ? gapEnd : rawWalkEnd;
};

const isPlanInsidePreferredPeriods = (plan: NudgePlan, prefs: Preferences): boolean => {
  if (!prefs.preferredWalkingPeriodsEnabled || prefs.preferredWalkingPeriods.length === 0) {
    return true;
  }
  const walkStart = parseISO(plan.walkStart);
  const walkEnd = getPlanWalkEnd(plan);
  return (
    timeUtils.isInPreferredPeriods(walkStart, prefs.preferredWalkingPeriods) &&
    timeUtils.isInPreferredPeriods(walkEnd, prefs.preferredWalkingPeriods)
  );
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
  <TouchableOpacity onPress={onPress} style={styles.burgerBtn} hitSlop={10} testID={testID} accessibilityLabel={testID}>
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
  </TouchableOpacity>
);

export const DashboardScreen: React.FC<Props> = ({ navigation }) => {
  const {
    preferences, setPreferences, hasSetPreferences, setHasSetPreferences,
    todayMinutesWalked, todayNotificationCount, upcomingPlans,
    todaySteps, setTodaySteps,
    setTodayStats, setUpcomingPlans,
    hasRequestedPermissions, setHasRequestedPermissions,
    setHasLocationPermission, setHasNotificationPermission, setHasActivityPermission,
    themeMode, language,
  } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<PlanOpportunity | null>(null);
  const [changeHour, setChangeHour] = useState('');
  const [changeMinute, setChangeMinute] = useState('');
  const [changePeriod, setChangePeriod] = useState<TimePeriod>('AM');
  const [changeDuration, setChangeDuration] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [savingChange, setSavingChange] = useState(false);
  const menuSlide = useRef(new Animated.Value(0)).current;
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({
    weekStart: '',
    weekEnd: '',
    totalMinutes: 0,
    totalSteps: 0,
    totalSessions: 0,
    totalDistance: 0,
    totalCalories: 0,
    daysActive: 0,
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationAnim = useRef(new Animated.Value(0)).current;
  const previousMinutesRef = useRef<number | null>(null);
  const lastCelebratedDateRef = useRef<string | null>(null);
  const { width, height } = useWindowDimensions();
  const dashboardScrollRef = useRef<ScrollView>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<UnlockedAchievement[]>([]);
  const [newBadgeIds, setNewBadgeIds] = useState<AchievementId[]>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const [yesterdayMinutes, setYesterdayMinutes] = useState<number | null>(null);

  /* ---- Add Walk modal state ---- */
  const [showAddWalkModal, setShowAddWalkModal] = useState(false);
  const [addWalkHour, setAddWalkHour] = useState('');
  const [addWalkMinute, setAddWalkMinute] = useState('');
  const [addWalkPeriod, setAddWalkPeriod] = useState<TimePeriod>('AM');
  const [addWalkDuration, setAddWalkDuration] = useState('10');
  const [addWalkError, setAddWalkError] = useState<string | null>(null);
  const [savingAddWalk, setSavingAddWalk] = useState(false);
  const [quietHoursBypass, setQuietHoursBypass] = useState(false);

  const openAddWalkModal = () => {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
    nextHour.setMinutes(0, 0, 0);
    const h = nextHour.getHours();
    setAddWalkHour(String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0'));
    setAddWalkMinute('00');
    setAddWalkPeriod(h >= 12 ? 'PM' : 'AM');
    setAddWalkDuration('10');
    setAddWalkError(null);
    setQuietHoursBypass(false);
    setShowAddWalkModal(true);
  };

  const closeAddWalkModal = () => {
    if (savingAddWalk) return;
    setShowAddWalkModal(false);
    setAddWalkError(null);
  };

  const saveManualWalk = async (bypassQuiet = false) => {
    if (!preferences || savingAddWalk) return;

    const hour = parseInt(addWalkHour, 10);
    const minute = parseInt(addWalkMinute, 10);
    const duration = parseInt(addWalkDuration, 10);

    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setAddWalkError('Please enter a valid time.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setAddWalkError('Set duration between 1 and 180 minutes.');
      return;
    }

    let hour24 = hour % 12;
    if (addWalkPeriod === 'PM') hour24 += 12;

    const walkStart = new Date();
    walkStart.setHours(hour24, minute, 0, 0);

    if (!isAfter(walkStart, new Date())) {
      setAddWalkError('Choose a future time.');
      return;
    }

    const walkEnd = addMinutes(walkStart, duration);

    // Check quiet hours
    if (
      !bypassQuiet &&
      (
        timeUtils.isInQuietHours(walkStart, preferences.quietHoursStart, preferences.quietHoursEnd) ||
        timeUtils.isInQuietHours(walkEnd, preferences.quietHoursStart, preferences.quietHoursEnd)
      )
    ) {
      setQuietHoursBypass(true);
      setAddWalkError(
        `This falls within your quiet hours (${formatTime12(preferences.quietHoursStart)} – ${formatTime12(preferences.quietHoursEnd)}). Change the time, or tap "Save anyway" to bypass.`
      );
      return;
    }

    try {
      setSavingAddWalk(true);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const plan: NudgePlan = {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        date: todayStr,
        gapStart: walkStart.toISOString(),
        gapEnd: walkEnd.toISOString(),
        walkStart: walkStart.toISOString(),
        suggestedDurationMinutes: duration,
        status: 'planned',
        reason: 'manual',
        createdAt: new Date().toISOString(),
      };

      await plansRepo.save(plan);

      if (isNotificationsSupported) {
        await notificationService.scheduleManualNudge(plan);
      }

      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
      setShowAddWalkModal(false);
      setAddWalkError(null);
    } catch (error) {
      console.error('Failed to create manual walk:', error);
      setAddWalkError('Could not create walk. Please try again.');
    } finally {
      setSavingAddWalk(false);
    }
  };

  const requestSaveManualWalk = () => {
    if (quietHoursBypass) {
      void saveManualWalk(true);
    } else {
      void saveManualWalk(false);
    }
  };

  const reconcileTodayPlans = useCallback(async (prefs: NonNullable<typeof preferences>, minutesWalked: number) => {
    const now = new Date();
    const todaysPlans = await plansRepo.getTodayPlans();
    const activePlans = todaysPlans.filter(
      (plan) => (plan.status === 'planned' || plan.status === 'notified') && isAfter(parseISO(plan.gapEnd), now)
    );

    // Never touch manually-created plans during reconciliation
    const autoPlans = activePlans.filter((plan) => plan.reason !== 'manual');
    const manualPlans = activePlans.filter((plan) => plan.reason === 'manual');

    const remainingTargetMinutes = Math.max(0, prefs.dailyTargetMinutes - minutesWalked);
    if (remainingTargetMinutes <= 0) {
      for (const plan of autoPlans) {
        await plansRepo.updateStatus(plan.id, 'cancelled');
      }
      // Re-schedule manual plan notifications (they survive reconciliation)
      if (isNotificationsSupported) {
        await notificationService.cancelWalkNudges();
        for (const plan of manualPlans) {
          await notificationService.scheduleManualNudge(plan);
        }
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
    const samePlanShape =
      existingKeys.length === rebuiltKeys.length &&
      existingKeys.every((key, idx) => key === rebuiltKeys[idx]);

    const hasInvalidDuration = autoPlans.some((plan) => plan.suggestedDurationMinutes <= 0);
    const exceedsPlanCount = autoPlans.length > prefs.notificationCountPerDay;
    const hasCustomizedPlan = autoPlans.some((plan) => plan.reason === 'customized');
    const hasOutsidePreferredPeriods = autoPlans.some((plan) => !isPlanInsidePreferredPeriods(plan, prefs));

    if (
      hasOutsidePreferredPeriods ||
      (!hasCustomizedPlan && (!samePlanShape || hasInvalidDuration || exceedsPlanCount))
    ) {
      for (const plan of autoPlans) {
        await plansRepo.updateStatus(plan.id, 'cancelled');
      }
      if (rebuilt.length > 0) {
        await plansRepo.saveMany(rebuilt);
      }
    }

    if (isNotificationsSupported) {
      await notificationService.cancelWalkNudges();
      const futurePlans = await plansRepo.getUpcomingPlans(100);
      // Schedule auto plans through normal path
      await notificationService.scheduleMultipleNudges(futurePlans.filter(p => p.reason !== 'manual'), prefs);
      // Schedule manual plans through bypass path
      for (const plan of futurePlans.filter(p => p.reason === 'manual')) {
        await notificationService.scheduleManualNudge(plan);
      }
    }
  }, []);

  const load = useCallback(async (): Promise<NudgePlan[]> => {
    const prefsFromDb = await preferencesRepo.get();
    if (prefsFromDb) {
      setPreferences(prefsFromDb);
      setHasSetPreferences(true);
    }

    const mins = await sessionsRepo.getTodayMinutes();
    const stepsToday = await sessionsRepo.getTodaySteps();
    setTodaySteps(stepsToday);

    if (prefsFromDb) {
      await reconcileTodayPlans(prefsFromDb, mins);
    }

    const cnt = await plansRepo.getTodayNotifiedCount();
    setTodayStats(mins, cnt);
    const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
    setUpcomingPlans(refreshedUpcoming);

    const allSessions = await sessionsRepo.getAll();
    setStreak(calculateStreak(allSessions));
    setWeeklyStats(calculateWeeklyStats(allSessions));

    // Compute yesterday's walked minutes for missed-goal compassion
    const yesterday = subDays(new Date(), 1);
    const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
    const yesterdayMins = allSessions
      .filter((s) => format(parseISO(s.start), 'yyyy-MM-dd') === yesterdayKey)
      .reduce((sum, s) => sum + Math.floor(s.activeSeconds / 60), 0);
    setYesterdayMinutes(yesterdayMins);

    // Evaluate achievements
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

    // Schedule (or refresh) tonight's daily summary notification
    if (prefsFromDb && isNotificationsSupported) {
      notificationService.scheduleDailySummary(prefsFromDb).catch(() => {});
    }

    return refreshedUpcoming;
  }, [reconcileTodayPlans, setHasSetPreferences, setPreferences, setTodayStats, setUpcomingPlans]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => console.error('Dashboard load failed:', e));

      // Request permissions if not yet requested (covers existing users who
      // installed before the permission flow was added)
      if (!hasRequestedPermissions) {
        requestAllPermissions().then((results) => {
          setHasLocationPermission(results.location);
          setHasNotificationPermission(results.notifications);
          setHasActivityPermission(results.activityRecognition);
          setHasRequestedPermissions(true);
        }).catch(() => {
          // Permission request failed, will retry next focus
        });
      }
    }, [load, hasRequestedPermissions])
  );

  useEffect(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    if (lastCelebratedDateRef.current && lastCelebratedDateRef.current !== todayKey) {
      lastCelebratedDateRef.current = null;
    }

    const target = preferences?.dailyTargetMinutes ?? 0;
    if (target <= 0) {
      previousMinutesRef.current = todayMinutesWalked;
      return;
    }

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

  // Hide scrollbar on web for Today screen
  useEffect(() => {
    if (Platform.OS === 'web') {
      const doc = (globalThis as any).document;
      if (doc) {
        const styleId = 'gapwalk-dashboard-scrollbar';
        if (!doc.getElementById(styleId)) {
          const el = doc.createElement('style');
          el.id = styleId;
          el.textContent = `
            [data-gapwalk-dashboard-scroll]::-webkit-scrollbar { display: none; }
            [data-gapwalk-dashboard-scroll] { scrollbar-width: none; }
          `;
          doc.head.appendChild(el);
        }
      }
      const t = setTimeout(() => {
        const node = (dashboardScrollRef.current as any)?.getScrollableNode?.();
        if (node) {
          node.setAttribute('data-gapwalk-dashboard-scroll', 'true');
        }
      }, 100);
      return () => clearTimeout(t);
    }
  }, []);

  const triggerCelebration = () => {
    setShowCelebration(true);
    Animated.sequence([
      Animated.timing(celebrationAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(celebrationAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setShowCelebration(false));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      console.error('Dashboard refresh failed:', e);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const cancelOpportunity = useCallback((opportunity: PlanOpportunity) => {
    const performCancel = async () => {
      try {
        const now = new Date();
        const todayKey = format(now, 'yyyy-MM-dd');
        const todayPlans = await plansRepo.getTodayPlans();

        // Cancel all still-active plans in this same gap window so we truly move to the next gap.
        const sameGapActivePlans = todayPlans.filter(
          (plan) =>
            (plan.status === 'planned' || plan.status === 'notified') &&
            plan.gapStart === opportunity.plan.gapStart &&
            plan.gapEnd === opportunity.plan.gapEnd &&
            isAfter(parseISO(plan.walkStart), now)
        );

        if (sameGapActivePlans.length > 0) {
          for (const plan of sameGapActivePlans) {
            await plansRepo.updateStatus(plan.id, 'cancelled');
          }
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
          if (isBefore(nextNotify, nextGapStart)) {
            nextNotify = nextGapStart;
          }
        }
        const nextEndRaw = addMinutes(parseISO(next.walkStart), next.suggestedDurationMinutes);
        const nextGapEnd = parseISO(next.gapEnd);
        const nextEnd = isAfter(nextEndRaw, nextGapEnd) ? nextGapEnd : nextEndRaw;

        Alert.alert(
          'Next walk window selected',
          `Walk time: ${format(nextWalkStart, 'h:mm a')} - ${format(nextEnd, 'h:mm a')}\nNotification time: ${format(nextNotify, 'h:mm a')}`
        );
      } catch (error) {
        console.error('Failed to cancel walk opportunity:', error);
        Alert.alert('Could not cancel this walk window', 'Please try again.');
      }
    };

    const isManualPlan = opportunity.plan.reason === 'manual';
    const confirmTitle = isManualPlan ? 'Cancel this walk?' : 'Cancel this walk window';
    const confirmMessage = isManualPlan
      ? 'Are you sure you want to cancel this personally scheduled walk?'
      : 'If you cancel, GapWalk will move to the next best walk window today.';

    // Alert.alert button callbacks don't fire on web (react-native-web limitation)
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(
        `${confirmTitle}\n\n${confirmMessage}`
      );
      if (ok) {
        void performCancel();
      }
      return;
    }

    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: () => { void performCancel(); } },
      ]
    );
  }, [preferences, setUpcomingPlans]);

  const openChangeOpportunity = (opportunity: PlanOpportunity) => {
    const parts = to12HourParts(opportunity.plan.walkStart);
    setEditingOpportunity(opportunity);
    setChangeHour(parts.hour);
    setChangeMinute(parts.minute);
    setChangePeriod(parts.period);
    setChangeDuration(String(opportunity.plan.suggestedDurationMinutes));
    setChangeError(null);
    setShowChangeModal(true);
  };

  const closeChangeModal = () => {
    if (savingChange) return;
    setShowChangeModal(false);
    setEditingOpportunity(null);
    setChangeError(null);
  };

  const applyWalkChange = async () => {
    if (!editingOpportunity || !preferences || savingChange) return;

    const hour = parseInt(changeHour, 10);
    const minute = parseInt(changeMinute, 10);
    const duration = parseInt(changeDuration, 10);

    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setChangeError('Please enter a valid start time.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setChangeError('Set duration between 1 and 180 minutes.');
      return;
    }

    const nextStart = parseISO(editingOpportunity.plan.walkStart);
    let hour24 = hour % 12;
    if (changePeriod === 'PM') hour24 += 12;
    nextStart.setHours(hour24, minute, 0, 0);

    if (!isAfter(nextStart, new Date())) {
      setChangeError('Choose a future time for this walk.');
      return;
    }

    const oldGapStart = parseISO(editingOpportunity.plan.gapStart);
    const oldGapEnd = parseISO(editingOpportunity.plan.gapEnd);
    const walkEnd = addMinutes(nextStart, duration);

    if (
      timeUtils.isInQuietHours(nextStart, preferences.quietHoursStart, preferences.quietHoursEnd) ||
      timeUtils.isInQuietHours(walkEnd, preferences.quietHoursStart, preferences.quietHoursEnd)
    ) {
      setChangeError('Pick a time outside your quiet hours.');
      return;
    }

    if (
      preferences.preferredWalkingPeriodsEnabled &&
      preferences.preferredWalkingPeriods.length > 0 &&
      (
        !timeUtils.isInPreferredPeriods(nextStart, preferences.preferredWalkingPeriods) ||
        !timeUtils.isInPreferredPeriods(walkEnd, preferences.preferredWalkingPeriods)
      )
    ) {
      setChangeError('Pick a time inside your preferred walking periods.');
      return;
    }

    const notifyLeadMinutes = preferences.whenToNotify === 'delay'
      ? Math.max(0, preferences.notifyDelayMinutes ?? 5)
      : 0;
    const earliestForNotify = subMinutes(nextStart, notifyLeadMinutes);
    const nextGapStart = isBefore(earliestForNotify, oldGapStart) ? earliestForNotify : oldGapStart;
    const nextGapEnd = isAfter(walkEnd, oldGapEnd) ? walkEnd : oldGapEnd;

    try {
      setSavingChange(true);
      await plansRepo.updateTiming(editingOpportunity.plan.id, {
        gapStart: nextGapStart.toISOString(),
        gapEnd: nextGapEnd.toISOString(),
        walkStart: nextStart.toISOString(),
        suggestedDurationMinutes: duration,
        reason: 'customized',
        status: 'planned',
      });

      if (isNotificationsSupported) {
        await notificationService.cancelWalkNudges();
        const futurePlans = await plansRepo.getUpcomingPlans(100);
        await notificationService.scheduleMultipleNudges(futurePlans, preferences);
      }

      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
      setShowChangeModal(false);
      setEditingOpportunity(null);
      setChangeError(null);
    } catch (error) {
      console.error('Failed to update walk window:', error);
      Alert.alert('Could not update walk window', 'Please try again.');
    } finally {
      setSavingChange(false);
    }
  };

  const requestSaveWalkChange = () => {
    if (savingChange) return;
    const hour = parseInt(changeHour, 10);
    const minute = parseInt(changeMinute, 10);
    const duration = parseInt(changeDuration, 10);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setChangeError('Please enter a valid start time.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setChangeError('Set duration between 1 and 180 minutes.');
      return;
    }

    if (editingOpportunity) {
      const previewStart = parseISO(editingOpportunity.plan.walkStart);
      let hour24 = hour % 12;
      if (changePeriod === 'PM') hour24 += 12;
      previewStart.setHours(hour24, minute, 0, 0);
      const previewEnd = addMinutes(previewStart, duration);
      if (!isAfter(previewStart, new Date())) {
        setChangeError('Choose a future time for this walk.');
        return;
      }
      if (
        preferences &&
        (
          timeUtils.isInQuietHours(previewStart, preferences.quietHoursStart, preferences.quietHoursEnd) ||
          timeUtils.isInQuietHours(previewEnd, preferences.quietHoursStart, preferences.quietHoursEnd)
        )
      ) {
        setChangeError('Pick a time outside your quiet hours.');
        return;
      }
      if (
        preferences?.preferredWalkingPeriodsEnabled &&
        preferences.preferredWalkingPeriods.length > 0 &&
        (
          !timeUtils.isInPreferredPeriods(previewStart, preferences.preferredWalkingPeriods) ||
          !timeUtils.isInPreferredPeriods(previewEnd, preferences.preferredWalkingPeriods)
        )
      ) {
        setChangeError('Pick a time inside your preferred walking periods.');
        return;
      }
    }

    setChangeError(null);
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm('Save this change\n\nAre you sure you want to update this walk time and duration');
      if (ok) {
        void applyWalkChange();
      }
      return;
    }
    Alert.alert(
      'Save this change',
      'Are you sure you want to update this walk time and duration',
      [
        { text: 'No, Change', style: 'cancel' },
        { text: 'Yes', onPress: () => { void applyWalkChange(); } },
      ]
    );
  };

  const closeMenu = () => {
    Animated.timing(menuSlide, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setMenuVisible(false));
  };

  const openMenu = () => {
    setMenuVisible(true);
    menuSlide.setValue(1);
  };

  const navigateToManageSchedule = () => { closeMenu(); navigation.navigate('ManualSchedule', { manageMode: true }); };
  const navigateToPreferences = () => { closeMenu(); navigation.push('Preferences', { manageMode: true }); };
  const navigateToSettings = () => { closeMenu(); navigation.navigate('Settings'); };
  const navigateToWeeklyData = () => { closeMenu(); navigation.navigate('WeeklyData'); };
  const navigateToHome = () => { closeMenu(); navigation.navigate('Intro'); };
  const resyncGoogleCalendar = async () => {
    setMenuVisible(false);
    try {
      const source = await scheduleSourceRepo.get();
      if (!source || source.type !== 'google' || !source.googleAccessToken) {
        Alert.alert('Not connected', 'You have not linked Google Calendar yet. Go to Schedule Setup to connect.', [
          { text: 'Go to Setup', onPress: () => navigation.navigate('ScheduleSetup') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      const valid = await googleCalendarService.validateToken(source.googleAccessToken);
      if (!valid) {
        Alert.alert('Session expired', 'Your Google session has expired. Please link your calendar again.', [
          { text: 'Re-link', onPress: () => navigation.navigate('ScheduleSetup') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert('Syncing...', 'Fetching latest events from Google Calendar.');
      const events = await googleCalendarService.fetchEvents(source.googleAccessToken, 14);
      await eventsRepo.deleteBySource('google');
      await eventsRepo.saveMany(events);
      await scheduleSourceRepo.save({ ...source, lastImportedAt: new Date().toISOString() });
      await load();
      Alert.alert('Synced', `Updated ${events.length} events from Google Calendar.`);
    } catch (err) {
      console.error('Re-sync error:', err);
      Alert.alert('Sync Failed', 'Could not refresh calendar events. Please try again.');
    }
  };

  const today = new Date();
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  const dayNameRaw = today.toLocaleDateString(locale, { weekday: 'long' });
  const dayName = dayNameRaw.charAt(0).toUpperCase() + dayNameRaw.slice(1);
  const monthDay = today.toLocaleDateString(locale, { month: 'long', day: 'numeric' });

  const todayKey = format(today, 'yyyy-MM-dd');
  const goalReached = !!preferences && todayMinutesWalked >= preferences.dailyTargetMinutes;
  const showStepGoalCard =
    !!preferences && (preferences.strictnessMode === 'no_excuses' || preferences.stepGoalEnabled);
  const remainingGoalMinutes = preferences
    ? Math.max(0, preferences.dailyTargetMinutes - todayMinutesWalked)
    : 0;
  const readyPrompt = getMotivationalMessage(
    todayMinutesWalked,
    preferences?.dailyTargetMinutes ?? 0,
    streak.currentStreak
  );

  // Compassionate context for missed yesterday / broken streak
  const yesterdayTarget = preferences?.dailyTargetMinutes ?? 0;
  const missedYesterday =
    yesterdayMinutes !== null &&
    yesterdayTarget > 0 &&
    yesterdayMinutes < yesterdayTarget &&
    yesterdayMinutes > 0;
  const missedYesterdayCompletely =
    yesterdayMinutes !== null &&
    yesterdayTarget > 0 &&
    yesterdayMinutes === 0 &&
    streak.currentStreak === 0 &&
    streak.longestStreak > 0;

  const yesterdayMessage = missedYesterday
    ? `Yesterday you walked ${yesterdayMinutes} of ${yesterdayTarget} min — so close! Today is a fresh start.`
    : missedYesterdayCompletely
      ? streak.longestStreak > 1
        ? `Your ${streak.longestStreak}-day streak ended, but every champion has rest days. Let's go again!`
        : `Yesterday was a rest day. Today you get to start fresh!`
      : null;

  const activeTodayPlans = useMemo(
    () =>
      upcomingPlans
        .filter((plan) => plan.date === todayKey)
        .filter((plan) => plan.status === 'planned' || plan.status === 'notified')
        .sort((a, b) => a.walkStart.localeCompare(b.walkStart)),
    [todayKey, upcomingPlans]
  );

  const opportunities = useMemo<PlanOpportunity[]>(() => {
    if (!preferences || goalReached) return [];

    return activeTodayPlans
      .filter((plan) => plan.reason === 'manual' || isPlanInsidePreferredPeriods(plan, preferences))
      .map((plan) => {
      const walkStart = parseISO(plan.walkStart);
      const walkEnd = getPlanWalkEnd(plan);
      const gapStart = parseISO(plan.gapStart);
      const gapEnd = parseISO(plan.gapEnd);
      let notifyAt = walkStart;
      // Manual plans notify at walkStart directly; no delay offset
      if (plan.reason !== 'manual' && preferences.whenToNotify === 'delay') {
        notifyAt = subMinutes(walkStart, preferences.notifyDelayMinutes ?? 5);
        if (isBefore(notifyAt, gapStart)) {
          notifyAt = gapStart;
        }
      }

      const isManual = plan.reason === 'manual';

      return {
        key: plan.id,
        plan,
        timeRange: `${format(walkStart, 'h:mm a')} - ${format(walkEnd, 'h:mm a')}`,
        walkWindowLabel: isManual
          ? 'Personally scheduled walk'
          : `Available window: ${format(gapStart, 'h:mm a')} - ${format(gapEnd, 'h:mm a')}`,
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

  /* ---------- Variant A: no preferences ---------- */
  if (!hasSetPreferences || !preferences) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
        {renderBackdrop}
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPadding,
              paddingTop: verticalPadding,
              paddingBottom: verticalPadding,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accentPrimary}
            />
          }
        >
          <Text variant="title" style={styles.heading}>Today</Text>
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

  /* ---------- Variant B: preferences set ---------- */
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
      {renderBackdrop}
      <View
        style={[
          styles.headerFrame,
          {
            backgroundColor: palette.bgSurfaceElevated,
            marginHorizontal: 0,
            // Start the Today frame at the very top and make it slightly wider
            marginTop: 0,
            paddingHorizontal: Math.max(width * 0.075, 16), // 5% wider than before (was 0.1)
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text variant="title" style={styles.heading}>Today</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.headingDate}>{dayName}, {monthDay}</Text>
          </View>
          <View style={styles.headerRight}>
            <BurgerIcon onPress={openMenu} color={palette.textPrimary} testID="dashboard-open-menu" />
          </View>
        </View>
      </View>

      <ScrollView
        ref={dashboardScrollRef}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: Math.max(width * 0.1, 16),
            paddingTop: Math.max(height * 0.03, 12),
            paddingBottom: Math.max(height * 0.04, 20),
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accentPrimary}
          />
        }
      >
        
        {/* Celebration Animation */}
        {showCelebration && (
          <Animated.View
            style={[
              styles.celebrationOverlay,
              {
                backgroundColor: palette.overlay,
                opacity: celebrationAnim,
                transform: [
                  {
                    scale: celebrationAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.celebrationContent,
                {
                  backgroundColor: palette.bgSurfaceElevated,
                  borderColor: themeMode === 'dark' ? 'rgba(46,233,166,0.35)' : 'rgba(46,233,166,0.42)',
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={52} color={theme.colors.accentPrimary} />
              <Text variant="title" style={styles.celebrationText}>Daily goal achieved</Text>
              <Text variant="bodySmall" color={palette.textMuted} style={styles.celebrationSubtext}>
                {streak.currentStreak > 0
                  ? `Current streak: ${streak.currentStreak} day${streak.currentStreak > 1 ? 's' : ''}.`
                  : 'Excellent work today.'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Ready prompt */}
        <Text variant="body" style={styles.readyText}>{readyPrompt}</Text>

        {/* Yesterday compassion message */}
        {yesterdayMessage && (
          <Card style={[styles.yesterdayCard, { backgroundColor: themeMode === 'dark' ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.12)', borderColor: themeMode === 'dark' ? 'rgba(251,191,36,0.18)' : 'rgba(251,191,36,0.22)' }]}>
            <View style={styles.yesterdayRow}>
              <Ionicons name="heart-outline" size={20} color="#fbbf24" style={{ marginRight: 10 }} />
              <Text variant="bodySmall" style={{ flex: 1, lineHeight: 20 }}>{yesterdayMessage}</Text>
            </View>
          </Card>
        )}

        {/* Streak Card */}
        <Card
          elevated
          style={[
            styles.streakCard,
            {
              borderColor: themeMode === 'dark' ? 'rgba(46,233,166,0.2)' : 'rgba(46,233,166,0.12)',
            },
          ]}
        >
          <View style={styles.streakContent}>
            <View style={styles.streakIconWrap}>
              <Ionicons
                name={streak.currentStreak > 0 ? 'flame' : 'flame-outline'}
                size={28}
                color={streak.currentStreak > 0 ? '#f97316' : palette.textMuted}
              />
            </View>
            <View style={styles.streakText}>
              <Text variant="body" style={styles.streakTitle}>
                {streak.currentStreak > 0
                  ? `${streak.currentStreak} Day${streak.currentStreak > 1 ? 's' : ''} Streak`
                  : 'No streak yet'}
              </Text>
              <Text variant="bodySmall" color={palette.textMuted}>
                {streak.currentStreak > 0
                  ? streak.longestStreak > streak.currentStreak
                    ? `Longest: ${streak.longestStreak} days`
                    : 'You are building great consistency.'
                  : 'Start a walk today to begin your streak.'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Achievements summary */}
        {unlockedAchievements.length > 0 && (
          <Card elevated style={styles.achievementsCard}>
            <View style={styles.achievementsHeader}>
              <Ionicons name="trophy-outline" size={18} color={theme.colors.accentPrimary} />
              <Text variant="body" style={styles.achievementsTitle}>
                Achievements ({unlockedAchievements.length}/{ACHIEVEMENTS.length})
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
              {ACHIEVEMENTS.map((def) => {
                const isUnlocked = unlockedAchievements.some((u) => u.id === def.id);
                return (
                  <View key={def.id} style={[styles.badgeItem, !isUnlocked && styles.badgeLocked]}>
                    <View style={[styles.badgeCircle, { borderColor: isUnlocked ? def.color : palette.textMuted }]}>
                      <Ionicons
                        name={def.icon as any}
                        size={20}
                        color={isUnlocked ? def.color : palette.textMuted}
                      />
                    </View>
                    <Text variant="bodySmall" style={[styles.badgeLabel, !isUnlocked && { color: palette.textMuted }]} numberOfLines={1}>
                      {def.title}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </Card>
        )}

        <Text variant="body" style={styles.qsTitle}>Quick Status</Text>

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
          <StatCard title="Step Goal" current={todaySteps} target={preferences.stepGoal} unitLabel="steps" tone="steps" />
        )}

        {/* Weekly Stats Preview */}
        <Card elevated style={styles.weeklyCard}>
          <View style={styles.weeklyHeaderRow}>
            <Ionicons name="bar-chart-outline" size={18} color={palette.accentPrimary} />
            <Text variant="body" style={styles.weeklyTitle}>This Week</Text>
          </View>
          <View style={styles.weeklyGrid}>
            <View style={styles.weeklyItem}>
              <Ionicons name="time-outline" size={16} color={palette.accentPrimary} style={{ marginBottom: 4 }} />
              <Text variant="title" style={[styles.weeklyValue, { color: palette.accentPrimary }]}>{weeklyStats.totalMinutes}</Text>
              <Text variant="bodySmall" color={palette.textMuted}>Minutes</Text>
            </View>
            <View style={styles.weeklyItem}>
              <Ionicons name="footsteps-outline" size={16} color={palette.accentPrimary} style={{ marginBottom: 4 }} />
              <Text variant="title" style={[styles.weeklyValue, { color: palette.accentPrimary }]}>{weeklyStats.totalSteps.toLocaleString()}</Text>
              <Text variant="bodySmall" color={palette.textMuted}>Steps</Text>
            </View>
            <View style={styles.weeklyItem}>
              <Ionicons name="calendar-outline" size={16} color={palette.accentPrimary} style={{ marginBottom: 4 }} />
              <Text variant="title" style={[styles.weeklyValue, { color: palette.accentPrimary }]}>
                {weeklyStats.daysActive}
                <Text variant="title" style={[styles.weeklyValueDenominator, { color: palette.accentPrimary }]}>
                  /7
                </Text>
              </Text>
              <Text variant="bodySmall" color={palette.textMuted}>Active Days</Text>
            </View>
          </View>
        </Card>

        <View style={styles.gapHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={styles.gapTitle}>Walking Opportunities</Text>
            <Text variant="muted" style={styles.gapSubtitle}>
              See your next walk windows and reminder times.
            </Text>
          </View>
          <TouchableOpacity
            onPress={openAddWalkModal}
            hitSlop={12}
            style={[styles.addWalkBtn, { borderColor: palette.borderStrong }]}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color={palette.accentPrimary} />
          </TouchableOpacity>
        </View>

        {goalReached ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyText}>Goal reached for today</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.emptyHint}>
              Nice work. Extra walks are still tracked, but reminders pause until tomorrow.
            </Text>
          </Card>
        ) : opportunities.length === 0 ? (
          <Card elevated style={styles.emptyCard}>
            <Ionicons name="walk-outline" size={28} color={palette.textMuted} style={{ marginBottom: 8 }} />
            <Text variant="body" style={styles.emptyText}>No opportunities yet</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.emptyHint}>
              No suitable gaps were found right now. Pull to refresh, or start a manual walk below.
            </Text>
          </Card>
        ) : (
          opportunities.map((opportunity) => (
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
          ))
        )}

        <Button
          title="Start Manual Walk"
          onPress={() => navigation.navigate('Walking', {})}
          style={styles.walkBtn}
          testID="dashboard-start-manual-walk"
        />
      </ScrollView>

      <Modal
        visible={showChangeModal}
        transparent
        animationType="fade"
        onRequestClose={closeChangeModal}
      >
        <KeyboardAvoidingView
          style={[styles.changeOverlay, { backgroundColor: palette.overlay }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.changeScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.changeCard,
                { backgroundColor: palette.bgSurfaceElevated, borderColor: palette.borderSoft },
              ]}
            >
              <Text variant="title" style={styles.changeTitle}>Change walk window</Text>
              <Text variant="bodySmall" color={palette.textMuted} style={styles.changeSubtitle}>
                Set your preferred start time and walk duration.
              </Text>

              <Text variant="bodySmall" style={styles.changeLabel}>Start time</Text>
              <View style={styles.changeTimeRow}>
                <TextInput
                  style={[styles.changeTimeInput, { borderColor: palette.borderStrong, color: palette.textPrimary }]}
                  value={changeHour}
                  onChangeText={(t) => setChangeHour(t.replace(/[^0-9]/g, '').slice(0, 2))}
                  placeholder="HH"
                  placeholderTextColor={palette.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text variant="body" style={styles.changeColon}>:</Text>
                <TextInput
                  style={[styles.changeTimeInput, { borderColor: palette.borderStrong, color: palette.textPrimary }]}
                  value={changeMinute}
                  onChangeText={(t) => setChangeMinute(t.replace(/[^0-9]/g, '').slice(0, 2))}
                  placeholder="MM"
                  placeholderTextColor={palette.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <View style={styles.periodRow}>
                  {(['AM', 'PM'] as const).map((period) => (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.periodBtn,
                        { borderColor: palette.borderStrong },
                        changePeriod === period && styles.periodBtnActive,
                      ]}
                      onPress={() => setChangePeriod(period)}
                      activeOpacity={0.8}
                    >
                      <Text
                        variant="bodySmall"
                        style={[
                          changePeriod === period ? styles.periodBtnTextActive : styles.periodBtnText,
                          { color: changePeriod === period ? '#06261d' : palette.textPrimary },
                        ]}
                      >
                        {period}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text variant="bodySmall" style={styles.changeLabel}>Walk minutes</Text>
              <View style={styles.durationRow}>
                <TextInput
                  style={[styles.durationInput, { borderColor: palette.borderStrong, color: palette.textPrimary }]}
                  value={changeDuration}
                  onChangeText={(t) => setChangeDuration(t.replace(/[^0-9]/g, '').slice(0, 3))}
                  placeholder="10"
                  placeholderTextColor={palette.textMuted}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text variant="muted" style={styles.durationUnit}>min</Text>
              </View>

              {!!changeError && (
                <Text variant="bodySmall" style={styles.changeError}>{changeError}</Text>
              )}

              <View style={styles.changeActionRow}>
                <Button
                  title="Cancel"
                  onPress={closeChangeModal}
                  variant="outline"
                  style={styles.changeActionBtn}
                  disabled={savingChange}
                />
                <Button
                  title="Save"
                  onPress={requestSaveWalkChange}
                  style={styles.changeActionBtn}
                  loading={savingChange}
                  disabled={savingChange}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Walk Modal */}
      <Modal
        visible={showAddWalkModal}
        transparent
        animationType="fade"
        onRequestClose={closeAddWalkModal}
      >
        <KeyboardAvoidingView
          style={[styles.changeOverlay, { backgroundColor: palette.overlay }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.changeScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.changeCard,
                { backgroundColor: palette.bgSurfaceElevated, borderColor: palette.borderSoft },
              ]}
            >
              <Text variant="title" style={styles.changeTitle}>Add a MicroWalk</Text>
              <Text variant="bodySmall" color={palette.textMuted} style={styles.changeSubtitle}>
                Pick a time and duration. You'll get a notification when it's time.
              </Text>

              <Text variant="bodySmall" style={styles.changeLabel}>Walk time</Text>
              <View style={styles.changeTimeRow}>
                <TextInput
                  style={[styles.changeTimeInput, { borderColor: palette.borderStrong, color: palette.textPrimary }]}
                  value={addWalkHour}
                  onChangeText={(t) => setAddWalkHour(t.replace(/[^0-9]/g, '').slice(0, 2))}
                  placeholder="HH"
                  placeholderTextColor={palette.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text variant="body" style={styles.changeColon}>:</Text>
                <TextInput
                  style={[styles.changeTimeInput, { borderColor: palette.borderStrong, color: palette.textPrimary }]}
                  value={addWalkMinute}
                  onChangeText={(t) => setAddWalkMinute(t.replace(/[^0-9]/g, '').slice(0, 2))}
                  placeholder="MM"
                  placeholderTextColor={palette.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <View style={styles.periodRow}>
                  {(['AM', 'PM'] as const).map((period) => (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.periodBtn,
                        { borderColor: palette.borderStrong },
                        addWalkPeriod === period && styles.periodBtnActive,
                      ]}
                      onPress={() => setAddWalkPeriod(period)}
                      activeOpacity={0.8}
                    >
                      <Text
                        variant="bodySmall"
                        style={[
                          addWalkPeriod === period ? styles.periodBtnTextActive : styles.periodBtnText,
                          { color: addWalkPeriod === period ? '#06261d' : palette.textPrimary },
                        ]}
                      >
                        {period}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text variant="bodySmall" style={styles.changeLabel}>Walk minutes</Text>
              <View style={styles.durationRow}>
                <TextInput
                  style={[styles.durationInput, { borderColor: palette.borderStrong, color: palette.textPrimary }]}
                  value={addWalkDuration}
                  onChangeText={(t) => setAddWalkDuration(t.replace(/[^0-9]/g, '').slice(0, 3))}
                  placeholder="10"
                  placeholderTextColor={palette.textMuted}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text variant="muted" style={styles.durationUnit}>min</Text>
              </View>

              {!!addWalkError && (
                <Text variant="bodySmall" style={styles.changeError}>{addWalkError}</Text>
              )}

              <View style={styles.changeActionRow}>
                <Button
                  title="Cancel"
                  onPress={closeAddWalkModal}
                  variant="outline"
                  style={styles.changeActionBtn}
                  disabled={savingAddWalk}
                />
                <Button
                  title={quietHoursBypass ? 'Save anyway' : 'Save'}
                  onPress={requestSaveManualWalk}
                  style={styles.changeActionBtn}
                  loading={savingAddWalk}
                  disabled={savingAddWalk}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Badge Unlocked Modal */}
      <Modal visible={showBadgeModal} transparent animationType="fade" onRequestClose={() => setShowBadgeModal(false)}>
        <TouchableOpacity style={[styles.badgeModalOverlay, { backgroundColor: palette.overlay }]} activeOpacity={1} onPress={() => setShowBadgeModal(false)}>
          <Animated.View style={[styles.badgeModalContent, { backgroundColor: palette.bgSurfaceElevated, borderColor: themeMode === 'dark' ? 'rgba(234,179,8,0.35)' : 'rgba(234,179,8,0.42)', transform: [{ scale: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: badgeAnim }]}>
            <Ionicons name="trophy" size={48} color="#eab308" style={{ marginBottom: 12 }} />
            <Text variant="title" style={styles.badgeModalTitle}>
              {newBadgeIds.length === 1 ? 'Badge Unlocked!' : `${newBadgeIds.length} Badges Unlocked!`}
            </Text>
            {newBadgeIds.map((id) => {
              const def = getAchievementDef(id);
              if (!def) return null;
              return (
                <View key={id} style={styles.badgeModalItem}>
                  <View style={[styles.badgeCircle, { borderColor: def.color }]}>
                    <Ionicons name={def.icon as any} size={20} color={def.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" style={{ fontWeight: theme.fontWeight.semibold }}>{def.title}</Text>
                    <Text variant="bodySmall" color={palette.textMuted}>{def.description}</Text>
                  </View>
                </View>
              );
            })}
            <Text variant="bodySmall" color={palette.textMuted} style={{ marginTop: 12 }}>Tap anywhere to dismiss</Text>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Side Menu Modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={[styles.menuOverlay, { backgroundColor: palette.overlay }]}>
          <TouchableOpacity style={styles.menuBackdrop} onPress={closeMenu} activeOpacity={1} />
          <Animated.View
            style={[
              styles.menuContent,
              {
                backgroundColor: palette.bgSurface,
                borderLeftColor: palette.borderSoft,
                transform: [
                  {
                    translateX: menuSlide.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text variant="title" style={styles.menuTitle}>Options</Text>
            <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.borderSoft }]} onPress={navigateToManageSchedule} testID="dashboard-menu-schedule">
              <View style={styles.menuItemRow}>
                <AppIcon name="calendar" size={16} color={palette.textPrimary} />
                <Text variant="body" style={styles.menuItemLabel}>Manage schedule</Text>
                <AppIcon name="chevronRight" size={16} color={palette.textMuted} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.borderSoft }]} onPress={navigateToPreferences} testID="dashboard-menu-preferences">
              <View style={styles.menuItemRow}>
                <AppIcon name="adjust" size={16} color={palette.textPrimary} />
                <Text variant="body" style={styles.menuItemLabel}>Edit/View preferences</Text>
                <AppIcon name="chevronRight" size={16} color={palette.textMuted} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.borderSoft }]} onPress={navigateToWeeklyData} testID="dashboard-menu-weekly-data">
              <View style={styles.menuItemRow}>
                <AppIcon name="calendar" size={16} color={palette.textPrimary} />
                <Text variant="body" style={styles.menuItemLabel}>Weekly Data</Text>
                <AppIcon name="chevronRight" size={16} color={palette.textMuted} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.borderSoft }]} onPress={navigateToSettings} testID="dashboard-menu-settings">
              <View style={styles.menuItemRow}>
                <AppIcon name="settings" size={16} color={palette.textPrimary} />
                <Text variant="body" style={styles.menuItemLabel}>Settings</Text>
                <AppIcon name="chevronRight" size={16} color={palette.textMuted} />
              </View>
            </TouchableOpacity>
            <View style={styles.menuFooter}>
              <Button
                title="Back to Home"
                onPress={navigateToHome}
                variant="outline"
                style={styles.menuHomeBtn}
                testID="dashboard-menu-home"
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bgApp, overflow: 'hidden' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  glowTop: {
    top: -120,
    right: -80,
  },
  glowBottom: {
    bottom: -130,
    left: -70,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 18,
  },
  headerCenter: { flex: 1, alignItems: 'flex-start' },
  headerRight: { width: 32, alignItems: 'flex-end' },
  heading: { textAlign: 'left', fontSize: theme.fontSize.xl + 2 },
  headingSub: { textAlign: 'left', marginBottom: 20, marginTop: 4 },
  headingDate: { textAlign: 'left', marginTop: 2 },
  burgerBtn: {
    padding: 3,
    transform: [{ scale: 0.8 }], // make overall icon ~20% smaller
  },
  burgerLine: {
    width: 18, // make lines wider
    height: 2,
    backgroundColor: theme.colors.textPrimary,
    marginVertical: 2,
    borderRadius: 1,
  },
  
  scroll: {
    // dynamic padding is applied in the component using useWindowDimensions
    width: '100%',
  },
  headerFrame: {
    backgroundColor: theme.colors.bgSurfaceElevated,
    borderRadius: 0,
    borderWidth: 0,
    width: '100%',
  },
  qsTitle: { fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.md + 2, marginBottom: 12, marginTop: 10 },
  gapHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 24, marginBottom: 12 },
  gapTitle: { fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.md + 2, marginBottom: 4 },
  gapSubtitle: { fontSize: theme.fontSize.sm, lineHeight: 20 },
  addWalkBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginLeft: 10,
    marginTop: 2,
  },
  emptyCard: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, marginBottom: 12 },
  emptyIcon: { fontSize: 28, lineHeight: 34, marginBottom: 8 },
  emptyText: { fontWeight: theme.fontWeight.semibold, marginBottom: 4 },
  emptyHint: { textAlign: 'center', lineHeight: 18 },
  promptCard: { marginBottom: 16, gap: 10 },
  promptTitle: { fontWeight: theme.fontWeight.semibold },
  promptText: { lineHeight: 18 },
  prefsCard: { marginTop: 4, marginBottom: 16 },
  prefLabel: { fontWeight: theme.fontWeight.semibold, marginBottom: 10 },
  prefsGrid: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  prefItem: { flex: 1 },
  prefItemFull: { marginTop: 2 },
  prefValue: { fontWeight: theme.fontWeight.medium, marginTop: 2 },
  prefPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  prefPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
  },
  prefPillText: {
    fontWeight: theme.fontWeight.medium,
  },
  editPrefs: { color: theme.colors.accentPrimary, fontWeight: theme.fontWeight.medium },
  walkBtn: { marginBottom: 20 },

  changeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,20,0.62)',
    paddingHorizontal: 20,
  },
  changeScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  changeCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  changeTitle: {
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: theme.fontWeight.bold,
  },
  changeSubtitle: {
    textAlign: 'center',
    marginBottom: 14,
  },
  changeLabel: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 8,
  },
  changeTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  changeTimeInput: {
    width: 56,
    minHeight: 40,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'android' ? 8 : 6,
    lineHeight: 22,
    textAlignVertical: 'center',
  },
  changeColon: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  periodBtn: {
    minWidth: 44,
    minHeight: 34,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  periodBtnActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  periodBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  periodBtnTextActive: {
    color: theme.colors.bgApp,
    fontWeight: theme.fontWeight.semibold,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  durationInput: {
    width: 96,
    minHeight: 40,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'android' ? 8 : 6,
    lineHeight: 22,
    textAlignVertical: 'center',
  },
  durationUnit: {
    fontWeight: theme.fontWeight.medium,
  },
  changeError: {
    color: theme.colors.error,
    marginTop: 4,
    marginBottom: 8,
  },
  changeActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  changeActionBtn: {
    flex: 1,
  },
  
  // Menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', justifyContent: 'flex-end' },
  menuBackdrop: { flex: 1 },
  menuContent: {
    width: '70%',
    maxWidth: 300,
    backgroundColor: theme.colors.bgApp,
    paddingTop: 60,
    paddingHorizontal: 20,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  menuTitle: { marginBottom: 30, textAlign: 'center' },
  menuItem: {
    paddingVertical: 15,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuItemLabel: {
    flex: 1,
  },
  menuFooter: {
    marginTop: 'auto',
    paddingBottom: 40,
  },
  menuHomeBtn: {},
  
  // Celebration
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(2,8,20,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  celebrationContent: {
    alignItems: 'center',
    borderRadius: 20,
    width: '84%',
    maxWidth: 330,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  celebrationEmoji: {
    fontSize: 52,
    lineHeight: 60,
    marginBottom: 10,
  },
  celebrationText: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 8,
    textAlign: 'center',
  },
  celebrationSubtext: {
    textAlign: 'center',
  },
  
  // Streak
  streakCard: {
    marginBottom: 16,
    backgroundColor: 'rgba(46,233,166,0.1)',
    borderWidth: 1,
  },
  streakContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(249,115,22,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  streakText: {
    flex: 1,
  },
  streakTitle: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 2,
  },
  
  // Yesterday compassion
  yesterdayCard: {
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  yesterdayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Achievements
  achievementsCard: {
    marginBottom: 16,
    paddingBottom: 10,
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  achievementsTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  badgeScroll: {
    marginHorizontal: -4,
  },
  badgeItem: {
    alignItems: 'center',
    width: 68,
    marginHorizontal: 4,
  },
  badgeLocked: {
    opacity: 0.35,
  },
  badgeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  badgeLabel: {
    fontSize: 10,
    textAlign: 'center',
  },

  // Badge unlock modal
  badgeModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeModalContent: {
    width: '84%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
  },
  badgeModalTitle: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 16,
    textAlign: 'center',
  },
  badgeModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    width: '100%',
  },

  // Ready text
  readyText: {
    marginTop: 16,
    marginBottom: 16,
    textAlign: 'center',
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  
  // Weekly Stats
  weeklyCard: {
    marginBottom: 16,
  },
  weeklyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  weeklyTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  weeklyGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weeklyItem: {
    alignItems: 'center',
  },
  weeklyValue: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 4,
  },
  weeklyValueDenominator: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
});
