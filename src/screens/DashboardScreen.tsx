import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity, Modal, Animated, Easing, useWindowDimensions, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { StatCard } from '../components/StatCard';
import { GapItem } from '../components/GapItem';
import { Card } from '../components/Card';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { preferencesRepo } from '../lib/repositories/preferencesRepo';
import { plansRepo } from '../lib/repositories/plansRepo';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';
import { eventsRepo } from '../lib/repositories/eventsRepo';
import { gapEngine } from '../lib/gapEngine';
import { notificationService, isNotificationsSupported } from '../lib/notifications';
import { googleCalendarService } from '../lib/googleCalendar';
import { NudgePlan } from '../lib/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calculateStreak, calculateWeeklyStats, StreakData } from '../lib/statsUtils';
import { addMinutes, format, isAfter, isBefore, parseISO, subMinutes } from 'date-fns';

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

const formatDateTime = (iso: string): string => format(parseISO(iso), 'h:mm a');

const BurgerIcon = ({ onPress, color }: { onPress: () => void; color: string }) => (
  <TouchableOpacity onPress={onPress} style={styles.burgerBtn} hitSlop={10}>
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
    <View style={[styles.burgerLine, { backgroundColor: color }]} />
  </TouchableOpacity>
);

export const DashboardScreen: React.FC<Props> = ({ navigation }) => {
  const {
    preferences, setPreferences, hasSetPreferences, setHasSetPreferences,
    todayMinutesWalked, todayNotificationCount, upcomingPlans,
    setTodayStats, setUpcomingPlans,
    themeMode, language,
  } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuSlide = useRef(new Animated.Value(0)).current;
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
  const [weeklyStats, setWeeklyStats] = useState({ totalMinutes: 0, totalSessions: 0, daysActive: 0 });
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationAnim = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  const dashboardScrollRef = useRef<ScrollView>(null);

  const reconcileTodayPlans = useCallback(async (prefs: NonNullable<typeof preferences>, minutesWalked: number) => {
    const now = new Date();
    const todaysPlans = await plansRepo.getTodayPlans();
    const activePlans = todaysPlans.filter(
      (plan) => (plan.status === 'planned' || plan.status === 'notified') && isAfter(parseISO(plan.gapEnd), now)
    );

    const remainingTargetMinutes = Math.max(0, prefs.dailyTargetMinutes - minutesWalked);
    if (remainingTargetMinutes <= 0) {
      for (const plan of activePlans) {
        await plansRepo.updateStatus(plan.id, 'cancelled');
      }
      return;
    }

    const events = await eventsRepo.getAll();
    const planningPrefs = { ...prefs, dailyTargetMinutes: remainingTargetMinutes };
    const rebuilt = await gapEngine.generatePlansForDate(now, events, planningPrefs);

    const normalize = (plan: NudgePlan): string =>
      `${plan.gapStart}|${plan.gapEnd}|${plan.walkStart}|${plan.suggestedDurationMinutes}`;

    const existingKeys = activePlans.map(normalize).sort();
    const rebuiltKeys = rebuilt.map(normalize).sort();
    const samePlanShape =
      existingKeys.length === rebuiltKeys.length &&
      existingKeys.every((key, idx) => key === rebuiltKeys[idx]);

    const hasInvalidDuration = activePlans.some((plan) => plan.suggestedDurationMinutes <= 0);
    const exceedsPlanCount = activePlans.length > prefs.notificationCountPerDay;

    if (!samePlanShape || hasInvalidDuration || exceedsPlanCount) {
      for (const plan of activePlans) {
        await plansRepo.updateStatus(plan.id, 'cancelled');
      }
      if (rebuilt.length > 0) {
        await plansRepo.saveMany(rebuilt);
      }
    }

    if (isNotificationsSupported) {
      await notificationService.cancelAllNotifications();
      const futurePlans = await plansRepo.getUpcomingPlans(100);
      await notificationService.scheduleMultipleNudges(futurePlans, prefs);
    }
  }, []);

  const load = useCallback(async (): Promise<NudgePlan[]> => {
    const prefsFromDb = await preferencesRepo.get();
    if (prefsFromDb) {
      setPreferences(prefsFromDb);
      setHasSetPreferences(true);
    }

    const mins = await sessionsRepo.getTodayMinutes();

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
    return refreshedUpcoming;
  }, [reconcileTodayPlans, setHasSetPreferences, setPreferences, setTodayStats, setUpcomingPlans]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!isNotificationsSupported) return;
    const responseSubscription = notificationService.addNotificationResponseListener(async (response) => {
      const data = response.notification.request.content.data as { type?: string; planId?: string };
      if (data.type !== 'walk_nudge' || !data.planId) return;

      try {
        const plan = await plansRepo.getById(data.planId);
        if (!plan) return;
        if (plan.status === 'cancelled' || plan.status === 'completed' || plan.status === 'skipped') return;

        const prefsFromDb = await preferencesRepo.get();
        if (prefsFromDb) {
          const minsToday = await sessionsRepo.getTodayMinutes();
          if (minsToday >= prefsFromDb.dailyTargetMinutes) {
            await plansRepo.updateStatus(plan.id, 'cancelled');
            return;
          }
        }

        navigation.navigate('Walking', { planId: data.planId });
      } catch (error) {
        console.error('Failed to handle notification tap:', error);
      }
    });

    const receivedSubscription = notificationService.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data as { type?: string; planId?: string };
      if (data.type !== 'walk_nudge' || !data.planId) return;
      try {
        const plan = await plansRepo.getById(data.planId);
        if (!plan) return;
        if (plan.status === 'planned') {
          await plansRepo.updateStatus(plan.id, 'notified');
          await load();
        }
      } catch (error) {
        console.error('Failed to handle foreground notification:', error);
      }
    });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [navigation, load]);

  useEffect(() => {
    if (preferences && todayMinutesWalked >= preferences.dailyTargetMinutes && todayMinutesWalked > 0) {
      triggerCelebration();
    }
  }, [todayMinutesWalked, preferences]);

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
    await load();
    setRefreshing(false);
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
          await notificationService.cancelAllNotifications();
          const futurePlans = await plansRepo.getUpcomingPlans(100);
          await notificationService.scheduleMultipleNudges(futurePlans, preferences);
        }

        const remainingToday = refreshedUpcoming
          .filter((plan) => plan.date === todayKey)
          .filter((plan) => plan.status === 'planned' || plan.status === 'notified')
          .sort((a, b) => a.walkStart.localeCompare(b.walkStart));

        if (!preferences || remainingToday.length === 0) {
          Alert.alert('No gaps found for today', 'No gaps are found for today.');
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
          'Next gap selected',
          `Walk time: ${format(nextWalkStart, 'h:mm a')} - ${format(nextEnd, 'h:mm a')}\nNotification time: ${format(nextNotify, 'h:mm a')}`
        );
      } catch (error) {
        console.error('Failed to cancel walk opportunity:', error);
        Alert.alert('Could not cancel opportunity', 'Please try again.');
      }
    };

    // Alert.alert button callbacks don't fire on web (react-native-web limitation)
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(
        'Cancel this walk opportunity?\n\nIf you cancel, GapWalk will try to use your next best available gap today.'
      );
      if (ok) {
        void performCancel();
      }
      return;
    }

    Alert.alert(
      'Cancel this walk opportunity?',
      'If you cancel, GapWalk will try to use your next best available gap today.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: () => { void performCancel(); } },
      ]
    );
  }, [preferences, setUpcomingPlans]);

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

  const navigateToScheduleOverview = () => { closeMenu(); navigation.navigate('ScheduleOverview'); };
  const navigateToPreferences = () => { closeMenu(); navigation.navigate('Preferences', {}); };
  const navigateToSettings = () => { closeMenu(); navigation.navigate('Settings'); };
  const navigateToHome = () => { closeMenu(); navigation.navigate('Intro'); };
  const resyncGoogleCalendar = async () => {
    setMenuVisible(false);
    try {
      const source = await scheduleSourceRepo.get();
      if (!source || source.type !== 'google' || !source.googleAccessToken) {
        Alert.alert('Not Connected', 'You haven\'t linked a Google Calendar yet. Go to Schedule Setup to connect.', [
          { text: 'Go to Setup', onPress: () => navigation.navigate('ScheduleSetup') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      const valid = await googleCalendarService.validateToken(source.googleAccessToken);
      if (!valid) {
        Alert.alert('Session Expired', 'Your Google session has expired. Please re-link your calendar.', [
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

    return activeTodayPlans.map((plan) => {
      const walkStart = parseISO(plan.walkStart);
      const walkEndRaw = addMinutes(walkStart, plan.suggestedDurationMinutes);
      const gapStart = parseISO(plan.gapStart);
      const gapEnd = parseISO(plan.gapEnd);
      const walkEnd = isAfter(walkEndRaw, gapEnd) ? gapEnd : walkEndRaw;
      let notifyAt = walkStart;
      if (preferences.whenToNotify === 'delay') {
        notifyAt = subMinutes(walkStart, preferences.notifyDelayMinutes ?? 5);
        if (isBefore(notifyAt, gapStart)) {
          notifyAt = gapStart;
        }
      }

      return {
        key: plan.id,
        plan,
        timeRange: `${formatDateTime(plan.gapStart)} - ${formatDateTime(plan.gapEnd)}`,
        walkWindowLabel: `Walk time: ${format(walkStart, 'h:mm a')} - ${format(walkEnd, 'h:mm a')}`,
        notifyLabel: `Notification time: ${format(notifyAt, 'h:mm a')}`,
      };
    });
  }, [activeTodayPlans, goalReached, preferences]);

  const horizontalPadding = Math.max(width * 0.1, 16);
  const verticalPadding = Math.max(height * 0.05, 16);
  const palette = getThemePalette(themeMode);

  /* ---------- Variant A: no preferences ---------- */
  if (!hasSetPreferences || !preferences) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
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
          <Text variant="body" color={theme.colors.textMuted} style={styles.headingSub}>{dayName}, {monthDay}</Text>
          <Card elevated style={styles.promptCard}>
            <Text variant="body" style={styles.promptTitle}>Get started</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.promptText}>Set up your preferences so GapWalk can find the best walking windows in your schedule.</Text>
            <Button title="Set Up Preferences" onPress={() => navigation.navigate('Preferences', {})} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ---------- Variant B: preferences set ---------- */
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
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
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.headingDate}>{dayName}, {monthDay}</Text>
          </View>
          <View style={styles.headerRight}>
            <BurgerIcon onPress={openMenu} color={palette.textPrimary} />
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
            <View style={styles.celebrationContent}>
              <Text style={styles.celebrationEmoji}>{'\uD83C\uDF89'}</Text>
              <Text variant="title" style={styles.celebrationText}>Goal Achieved!</Text>
              <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.celebrationSubtext}>
                {streak.currentStreak > 0 ? `${streak.currentStreak}-day streak!` : 'Great job!'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Ready prompt */}
        <Text variant="body" style={styles.readyText}>
          {streak.lastActiveDate
            ? 'Ready to walk?'
            : 'Ready to start? Your first walk is just a tap away!'}
        </Text>

        {/* Achievements & Streak Card */}
        <Card elevated style={styles.streakCard}>
          <View style={styles.streakContent}>
            <Text style={styles.streakEmoji}>{'\uD83D\uDD25'}</Text>
            <View style={styles.streakText}>
              <Text variant="body" style={styles.streakTitle}>
                {streak.currentStreak > 0
                  ? `${streak.currentStreak} Day${streak.currentStreak > 1 ? 's' : ''} Streak`
                  : 'No streak yet'}
              </Text>
              <Text variant="bodySmall" color={theme.colors.textMuted}>
                {streak.currentStreak > 0
                  ? streak.longestStreak > streak.currentStreak
                    ? `Longest: ${streak.longestStreak} days`
                    : 'Keep it going!'
                  : 'Start a walk today to begin your streak.'}
              </Text>
            </View>
          </View>
        </Card>

        <Text variant="body" style={styles.qsTitle}>Quick Status</Text>

        <StatCard title="Daily Target" current={todayMinutesWalked} target={preferences.dailyTargetMinutes} unitLabel="minutes" />
        <StatCard title="Notification Count" current={todayNotificationCount} target={preferences.notificationCountPerDay} unitLabel="times" />

        {/* Weekly Stats Preview */}
        {weeklyStats.totalSessions > 0 && (
          <Card elevated style={styles.weeklyCard}>
            <Text variant="body" style={styles.weeklyTitle}>This Week</Text>
            <View style={styles.weeklyGrid}>
              <View style={styles.weeklyItem}>
                <Text variant="title" style={styles.weeklyValue}>{weeklyStats.totalMinutes}</Text>
                <Text variant="bodySmall" color={theme.colors.textMuted}>Minutes</Text>
              </View>
              <View style={styles.weeklyItem}>
                <Text variant="title" style={styles.weeklyValue}>{weeklyStats.totalSessions}</Text>
                <Text variant="bodySmall" color={theme.colors.textMuted}>Walks</Text>
              </View>
              <View style={styles.weeklyItem}>
                <Text variant="title" style={styles.weeklyValue}>{weeklyStats.daysActive}</Text>
                <Text variant="bodySmall" color={theme.colors.textMuted}>Active Days</Text>
              </View>
            </View>
          </Card>
        )}

        <Text variant="body" style={styles.gapTitle}>Walking Opportunities</Text>
        <Text variant="muted" style={styles.gapSubtitle}>
          See exactly when to walk and when GapWalk will notify you.
        </Text>

        {goalReached ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyText}>Goal reached for today</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.emptyHint}>
              Nice work. Extra walks are still tracked, but reminders pause until tomorrow.
            </Text>
          </Card>
        ) : opportunities.length === 0 ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyIcon}>{'\uD83D\uDEB6'}</Text>
            <Text variant="body" style={styles.emptyText}>No opportunities yet</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.emptyHint}>
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
            />
          ))
        )}

        <Card elevated style={styles.prefsCard}>
          <Text variant="body" style={styles.prefLabel}>Other preferences</Text>
          <View style={styles.prefsGrid}>
            <View style={styles.prefItem}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Buffer time</Text>
              <Text variant="body" style={styles.prefValue}>{preferences.bufferMinutes} min</Text>
            </View>
            <View style={styles.prefItem}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Quiet hours</Text>
              <Text variant="body" style={styles.prefValue}>{formatTime12(preferences.quietHoursStart)} - {formatTime12(preferences.quietHoursEnd)}</Text>
            </View>
          </View>
          <View style={styles.prefsGrid}>
            <View style={styles.prefItem}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Notify me</Text>
              <Text variant="body" style={styles.prefValue}>
                {preferences.whenToNotify === 'now'
                  ? 'Immediately'
                  : preferences.whenToNotify === 'delay'
                  ? `${preferences.notifyDelayMinutes} min before`
                  : 'Next gap'}
              </Text>
            </View>
            <View style={styles.prefItem}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Minimum reminder gap</Text>
              <Text variant="body" style={styles.prefValue}>{preferences.notificationMinGapMinutes} min</Text>
            </View>
          </View>
        </Card>

        <Button
          title="Start Manual Walk"
          onPress={() => navigation.navigate('Walking', {})}
          style={styles.walkBtn}
        />
      </ScrollView>

      {/* Side Menu Modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.menuOverlay}>
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
            <TouchableOpacity style={styles.menuItem} onPress={navigateToScheduleOverview}>
              <Text variant="body">Visit / Update your schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={navigateToPreferences}>
              <Text variant="body">Edit your Choices</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={navigateToSettings}>
              <Text variant="body">Settings</Text>
            </TouchableOpacity>
            <View style={styles.menuFooter}>
              <Button title="Back to Home Screen" onPress={navigateToHome} variant="danger" style={styles.menuHomeBtn} />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bgApp },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerCenter: { flex: 1, alignItems: 'flex-start' },
  headerRight: { width: 32, alignItems: 'flex-end' },
  heading: { textAlign: 'left', fontSize: theme.fontSize.xl + 2 },
  headingSub: { textAlign: 'left', marginBottom: 20, marginTop: 4 },
  headingDate: { textAlign: 'left' },
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
  gapTitle: { fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.md + 2, marginTop: 24, marginBottom: 4 },
  gapSubtitle: { fontSize: theme.fontSize.sm, marginBottom: 12, lineHeight: 20 },
  emptyCard: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, marginBottom: 12 },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontWeight: theme.fontWeight.semibold, marginBottom: 4 },
  emptyHint: { textAlign: 'center', lineHeight: 18 },
  promptCard: { marginBottom: 16, gap: 10 },
  promptTitle: { fontWeight: theme.fontWeight.semibold },
  promptText: { lineHeight: 18 },
  prefsCard: { marginTop: 4, marginBottom: 16 },
  prefLabel: { fontWeight: theme.fontWeight.semibold, marginBottom: 10 },
  prefsGrid: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  prefItem: { flex: 1 },
  prefValue: { fontWeight: theme.fontWeight.medium, marginTop: 2 },
  editPrefs: { color: theme.colors.accentPrimary, fontWeight: theme.fontWeight.medium },
  walkBtn: { marginBottom: 20 },
  
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  celebrationContent: {
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurfaceElevated,
    borderRadius: theme.borderRadius.lg,
    padding: 32,
    borderWidth: 2,
    borderColor: theme.colors.accentPrimary,
  },
  celebrationEmoji: {
    fontSize: 64,
    marginBottom: 16,
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
    borderColor: 'rgba(46,233,166,0.2)',
  },
  streakContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  streakText: {
    flex: 1,
  },
  streakTitle: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 2,
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
  weeklyTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 12,
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
    color: theme.colors.accentPrimary,
    marginBottom: 4,
  },
});



