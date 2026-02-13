import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity, Modal, Animated, Easing, useWindowDimensions, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { notificationService, isNotificationsSupported } from '../lib/notifications';
import { googleCalendarService } from '../lib/googleCalendar';
import { timeUtils } from '../lib/time';
import { NudgePlan } from '../lib/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calculateStreak, getMotivationalMessage, calculateWeeklyStats, StreakData } from '../lib/statsUtils';

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

/** Group nudge plans that share the same gap (gapStart-gapEnd) */
interface GroupedGap {
  key: string;
  timeRange: string;
  gapStart: string;
  gapEnd: string;
  plans: NudgePlan[];
  totalAvailableMinutes: number;
  usedMinutes: number;
}

/** Group plans by gap. totalAvailableMinutes = distributed microwalk minutes (sum of suggested durations). */
function groupPlansByRange(plans: NudgePlan[]): GroupedGap[] {
  const map = new Map<string, GroupedGap>();
  for (const p of plans) {
    const key = `${p.gapStart}__${p.gapEnd}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        timeRange: timeUtils.formatTimeRange(p.gapStart, p.gapEnd),
        gapStart: p.gapStart,
        gapEnd: p.gapEnd,
        plans: [],
        totalAvailableMinutes: 0,
        usedMinutes: 0,
      });
    }
    const g = map.get(key)!;
    g.plans.push(p);
    g.totalAvailableMinutes += p.suggestedDurationMinutes;
  }
  return Array.from(map.values());
}

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
    themeMode,
  } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuSlide = useRef(new Animated.Value(0)).current;
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
  const [weeklyStats, setWeeklyStats] = useState({ totalMinutes: 0, totalSessions: 0, daysActive: 0 });
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const { width, height } = useWindowDimensions();
  const dashboardScrollRef = useRef<ScrollView>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!isNotificationsSupported) return;
    const subscription = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as { type?: string; planId?: string };
      if (data.type === 'walk_nudge' && data.planId) navigation.navigate('Walking', { planId: data.planId });
    });
    return () => subscription.remove();
  }, [navigation]);

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

  const load = async () => {
    const prefs = await preferencesRepo.get();
    if (prefs) { setPreferences(prefs); setHasSetPreferences(true); }
    const mins = await sessionsRepo.getTodayMinutes();
    const cnt = await plansRepo.getTodayNotifiedCount();
    setTodayStats(mins, cnt);
    setUpcomingPlans(await plansRepo.getUpcomingPlans(10));
    
    // Load streak and weekly stats
    const allSessions = await sessionsRepo.getAll();
    const streakData = calculateStreak(allSessions);
    setStreak(streakData);
    const weekly = calculateWeeklyStats(allSessions);
    setWeeklyStats(weekly);
  };

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, []);

  const hasOtherGroups = (excluding: GroupedGap) =>
    groupedWalks.length > 1 && groupedWalks.some(g => g.key !== excluding.key);

  const skipGroup = (group: GroupedGap) => {
    const doSkip = async () => {
      for (const p of group.plans) {
        await plansRepo.updateStatus(p.id, 'cancelled');
      }
      await load();
    };

    if (hasOtherGroups(group)) {
      Alert.alert(
        'Skip this session?',
        'You can use another time slot from the list above, or skip this session entirely.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Find another time', onPress: doSkip },
          { text: 'Skip entirely', onPress: doSkip, style: 'destructive' },
        ]
      );
    } else {
      Alert.alert(
        'Skip this session?',
        'There are no other time slots available today. You might miss your daily goal.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, skip', onPress: doSkip, style: 'destructive' },
        ]
      );
    }
  };

  const handleNotifyMe = async (group: GroupedGap) => {
    const plan = group.plans[0];
    if (!plan) return;
    if (isNotificationsSupported) {
      await notificationService.showImmediateNudge(plan.id, group.totalAvailableMinutes);
    } else {
      navigation.navigate('Walking', { planId: plan.id });
    }
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
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];
  const monthDay = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // Consolidate upcoming plans by time range
  const groupedWalks = useMemo(() => groupPlansByRange(upcomingPlans), [upcomingPlans]);

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
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text variant="title" style={styles.heading}>Today</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted}>{dayName}, {monthDay}</Text>
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
          Ready to start? Your first walk is just a tap away!
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
          When your next walking session is available. GapWalk will notify you to start.
        </Text>

        {groupedWalks.length === 0 ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyIcon}>{'\uD83D\uDEB6'}</Text>
            <Text variant="body" style={styles.emptyText}>No opportunities yet</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.emptyHint}>Pull down to refresh, or start a manual walk below.</Text>
          </Card>
        ) : (
          groupedWalks.map(group => (
            <GapItem
              key={group.key}
              timeRange={group.timeRange}
              duration={group.totalAvailableMinutes}
              opportunities={group.plans.length}
              usedMinutes={group.usedMinutes}
              onSkip={() => skipGroup(group)}
              onNotifyMe={() => handleNotifyMe(group)}
            />
          ))
        )}

        <Card elevated style={styles.prefsCard}>
          <Text variant="body" style={styles.prefLabel}>Your Preferences</Text>
          <View style={styles.prefsGrid}>
            <View style={styles.prefItem}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Buffer</Text>
              <Text variant="body" style={styles.prefValue}>{preferences.bufferMinutes} min</Text>
            </View>
            <View style={styles.prefItem}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Quiet hours</Text>
              <Text variant="body" style={styles.prefValue}>{formatTime12(preferences.quietHoursStart)} - {formatTime12(preferences.quietHoursEnd)}</Text>
            </View>
          </View>
          <View style={styles.prefsGrid}>
            <View style={styles.prefItem}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Notify</Text>
              <Text variant="body" style={styles.prefValue}>
                {preferences.whenToNotify === 'now'
                  ? 'Immediately'
                  : preferences.whenToNotify === 'delay'
                  ? `${preferences.notifyDelayMinutes} min before`
                  : 'Next gap'}
              </Text>
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
  headerLeft: { width: 32, alignItems: 'flex-start' },
  headerCenter: { alignItems: 'center' },
  headerRight: { width: 32, alignItems: 'flex-end' },
  heading: { textAlign: 'center' },
  headingSub: { textAlign: 'center', marginBottom: 20, marginTop: 4 },
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
  qsTitle: { fontWeight: theme.fontWeight.semibold, marginBottom: 12, marginTop: 10 },
  gapTitle: { fontWeight: theme.fontWeight.semibold, marginTop: 24, marginBottom: 4 },
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



