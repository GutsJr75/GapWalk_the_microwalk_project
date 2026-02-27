import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { NudgePlan, WalkSession } from '../lib/types';
import { plansRepo } from '../lib/repositories/plansRepo';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import { analyticsService } from '../lib/analytics';
import { useAppStore } from '../store';
import { addMinutes } from 'date-fns';

type Props = NativeStackScreenProps<RootStackParamList, 'Walking'>;
const INACTIVITY_PAUSE_SECONDS = 30;

const formatClock = (seconds: number): string => {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = String(clamped % 60).padStart(2, '0');
  return `${mins} min ${secs} sec`;
};

export const WalkingScreen: React.FC<Props> = ({ navigation, route }) => {
  const planId = route.params?.planId;
  const insets = useSafeAreaInsets();
  const palette = useThemePalette();
  const { preferences, themeMode } = useAppStore();

  const [plan, setPlan] = useState<NudgePlan | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [ticks, setTicks] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  const startIsoRef = useRef(new Date().toISOString());
  const pauseStartedAtRef = useRef<number | null>(null);
  const activeSegmentStartAtRef = useRef<number>(Date.now());
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const allowLeaveRef = useRef(false);

  const completionPopAnim = useRef(new Animated.Value(0)).current;
  const completionBurstAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const strictMode = preferences?.strictnessMode === 'no_excuses';
  const stepGoalEnforced = strictMode || !!preferences?.stepGoalEnabled;

  useEffect(() => {
    void (async () => {
      if (planId) {
        const found = await plansRepo.getById(planId);
        if (found) {
          setPlan(found);
          await plansRepo.updateStatus(planId, 'started');
        }
      }
    })();

    timerRef.current = setInterval(() => {
      setTicks((prev) => prev + 1);
      if (!pausedRef.current) {
        setActiveSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [planId]);

  const resumeSession = useCallback(() => {
    const pauseStarted = pauseStartedAtRef.current;
    if (pauseStarted) {
      setPausedSeconds((prev) => prev + Math.floor((Date.now() - pauseStarted) / 1000));
    }
    pauseStartedAtRef.current = null;
    activeSegmentStartAtRef.current = Date.now();
    setPaused(false);
  }, []);

  const pauseSession = useCallback(() => {
    pauseStartedAtRef.current = Date.now();
    setPaused(true);
  }, []);

  const togglePause = () => {
    if (paused) {
      resumeSession();
      return;
    }
    pauseSession();
  };

  useEffect(() => {
    activeSegmentStartAtRef.current = Date.now();
  }, [stepGoalEnforced]);

  useEffect(() => {
    if (!stepGoalEnforced || paused || showEndModal || showCompletion || showIdleModal) return;
    const idleSeconds = Math.floor((Date.now() - activeSegmentStartAtRef.current) / 1000);
    if (idleSeconds < INACTIVITY_PAUSE_SECONDS) return;

    pauseSession();
    setShowIdleModal(true);
    analyticsService.track('walk_inactive_auto_pause_web', {
      strictnessMode: preferences?.strictnessMode ?? 'easygoing',
      stepGoalEnabled: preferences?.stepGoalEnabled ?? false,
      stepGoal: preferences?.stepGoal ?? null,
      idleSeconds,
    });
  }, [
    pauseSession,
    paused,
    preferences?.stepGoal,
    preferences?.stepGoalEnabled,
    preferences?.strictnessMode,
    showCompletion,
    showEndModal,
    showIdleModal,
    stepGoalEnforced,
    ticks,
  ]);

  useEffect(() => {
    if (!stepGoalEnforced && showIdleModal) {
      setShowIdleModal(false);
    }
  }, [showIdleModal, stepGoalEnforced]);

  const remainingSeconds = useMemo(() => {
    if (!plan) return activeSeconds;
    const walkStart = new Date(plan.walkStart);
    const gapEnd = new Date(plan.gapEnd);
    const plannedWalkEnd = addMinutes(walkStart, Math.max(1, plan.suggestedDurationMinutes));
    const planEndMs = Math.min(plannedWalkEnd.getTime(), gapEnd.getTime());
    return Math.max(0, Math.floor((planEndMs - Date.now()) / 1000));
  }, [activeSeconds, plan, ticks]);

  const saveSession = async (options?: {
    showCompletion?: boolean;
    planStatus?: 'completed' | 'cancelled' | 'skipped';
    endReason?: 'manual' | 'idle_later';
  }) => {
    const pauseStarted = pauseStartedAtRef.current;
    const finalPausedSeconds = paused && pauseStarted
      ? pausedSeconds + Math.floor((Date.now() - pauseStarted) / 1000)
      : pausedSeconds;

    const session: WalkSession = {
      id: `s-${Date.now()}`,
      nudgePlanId: planId,
      start: startIsoRef.current,
      end: new Date().toISOString(),
      activeSeconds,
      pausedSeconds: finalPausedSeconds,
      distanceMeters: 0,
      steps: 0,
      usedLocation: false,
      createdAt: new Date().toISOString(),
    };

    await sessionsRepo.save(session);
    if (planId) {
      await plansRepo.updateStatus(planId, options?.planStatus ?? 'completed');
    }

    analyticsService.track('walk_completed', {
      planId: planId || null,
      activeSeconds,
      pausedSeconds: finalPausedSeconds,
      distanceMeters: 0,
      steps: 0,
      usedLocation: false,
      hadWalkingSignal: false,
      endReason: options?.endReason ?? 'manual',
    });

    if (options?.showCompletion === false) {
      allowLeaveRef.current = true;
      navigation.navigate('Dashboard');
      return;
    }

    setShowCompletion(true);
    completionPopAnim.setValue(0);
    completionBurstAnim.setValue(0);

    Animated.parallel([
      Animated.timing(completionPopAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(completionBurstAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      setShowCompletion(false);
      allowLeaveRef.current = true;
      navigation.navigate('Dashboard');
    }, 2200);
  };

  const confirmEnd = async () => {
    setShowEndModal(false);
    await saveSession();
  };

  const continueAfterIdlePause = () => {
    setShowIdleModal(false);
    activeSegmentStartAtRef.current = Date.now();
    resumeSession();
  };

  const saveForLater = async () => {
    setShowIdleModal(false);
    await saveSession({ showCompletion: false, planStatus: 'cancelled', endReason: 'idle_later' });
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveRef.current) return;
      e.preventDefault();
      setShowEndModal(true);
    });
    return unsubscribe;
  }, [navigation]);

  const toggleSheet = () => {
    setSheetExpanded((prev) => !prev);
  };

  const isDark = themeMode === 'dark';
  const topBorder = isDark ? 'rgba(255,255,255,0.08)' : palette.borderSoft;
  const sheetBg = isDark ? 'rgba(6, 18, 43, 0.95)' : 'rgba(247, 251, 255, 0.97)';
  const sheetBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.14)';
  const handleColor = isDark ? 'rgba(235,243,255,0.56)' : 'rgba(147, 161, 181, 0.95)';
  const completionOverlayBg = isDark ? 'rgba(2, 8, 20, 0.82)' : 'rgba(236, 245, 255, 0.82)';
  const completionCardBg = isDark ? '#0f1f3d' : '#f7fbff';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]} edges={['top', 'left', 'right']}>
      <View style={[styles.topBar, { borderBottomColor: topBorder }]}>
        <Text variant="title" style={styles.topTitle}>Walking</Text>
      </View>

      <View style={styles.webPlaceholder}>
        <Text variant="title" style={styles.placeholderEmoji}>🗺️</Text>
        <Text variant="title" style={styles.placeholderTitle}>Map View Coming Soon</Text>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.placeholderBody}>
          Your walk tracking is active here for time, steps, and distance.{'\n'}Live route map view on web is coming soon.
        </Text>
      </View>

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: sheetBg,
            borderTopColor: sheetBorder,
            paddingBottom: Math.max(insets.bottom + 8, 18),
          },
        ]}
      >
        <Pressable
          onPress={toggleSheet}
          accessibilityRole="button"
          accessibilityLabel="walking-sheet-handle"
          style={styles.sheetHandleTouch}
        >
          <View style={[styles.sheetHandle, { backgroundColor: handleColor }]} />
        </Pressable>

        <Text variant="body" style={styles.timerLabel}>{plan ? 'Remaining Time' : 'Session Time'}</Text>
        <Text variant="heading" style={[styles.timerValue, !sheetExpanded && styles.timerValueCollapsed]}>
          {formatClock(remainingSeconds)}
        </Text>

        {sheetExpanded && (
          <>
            <View style={styles.metricRow}>
              <View style={[styles.metricCard, { backgroundColor: isDark ? '#1a2a4a' : '#dfe9f9' }]}>
                <Text variant="body" style={styles.metricTitle}>Distance</Text>
                <Text variant="heading" style={styles.metricValue}>0.00 mi</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: isDark ? '#1a2a4a' : '#dfe9f9' }]}>
                <Text variant="body" style={styles.metricTitle}>Step Counter</Text>
                <Text variant="heading" style={styles.metricValue}>0</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Button
                title={paused ? 'Resume' : 'Pause'}
                onPress={togglePause}
                variant="secondary"
                style={styles.actionBtn}
                testID="walking-pause-resume"
              />
              <Button
                title="End"
                onPress={() => setShowEndModal(true)}
                variant="danger"
                style={styles.actionBtn}
                testID="walking-end"
              />
            </View>
          </>
        )}
      </View>

      <Modal visible={showEndModal} onClose={() => setShowEndModal(false)} title="End this walk?">
        <Text variant="body" style={styles.modalText}>Your walk progress will be saved to today stats.</Text>
        <View style={styles.modalRow}>
          <Button
            title="Keep Walking"
            onPress={() => setShowEndModal(false)}
            variant="outline"
            style={styles.modalBtn}
            testID="walking-end-cancel"
          />
          <Button title="Yes, End" onPress={() => { void confirmEnd(); }} style={styles.modalBtn} testID="walking-end-confirm" />
        </View>
      </Modal>

      <Modal visible={showIdleModal} onClose={() => {}} title="No walking detected">
        <Text variant="body" style={styles.modalText}>
          You are not walking right now. You can continue this session later.
        </Text>
        <View style={styles.modalRow}>
          <Button
            title="No, Continue"
            onPress={continueAfterIdlePause}
            variant="outline"
            style={styles.modalBtn}
            testID="walking-idle-continue"
          />
          <Button
            title="Yes, later"
            onPress={() => { void saveForLater(); }}
            style={styles.modalBtn}
            testID="walking-idle-later"
          />
        </View>
      </Modal>

      {showCompletion && (
        <Animated.View
          style={[styles.completionOverlay, { backgroundColor: completionOverlayBg, opacity: completionPopAnim }]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.completionBurst,
              {
                opacity: completionBurstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: completionBurstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 2.1] }) }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.completionCard,
              {
                backgroundColor: completionCardBg,
                borderColor: sheetBorder,
                opacity: completionPopAnim,
                transform: [{ scale: completionPopAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              },
            ]}
          >
            <View style={styles.completionBadge}>
              <Text variant="title" style={styles.completionBadgeText}>✓</Text>
            </View>
            <Text variant="title" style={styles.completionTitle}>Walk completed</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.completionSubtitle}>
              Session recorded: {Math.max(1, Math.floor(activeSeconds / 60))} min
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    minHeight: 96,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  topTitle: {
    fontSize: 30,
    fontWeight: theme.fontWeight.semibold,
  },
  webPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  placeholderTitle: {
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 18,
    fontWeight: theme.fontWeight.semibold,
  },
  placeholderEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  placeholderBody: {
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 20,
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  sheetHandleTouch: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 18,
  },
  sheetHandle: {
    width: 56,
    height: 4,
    borderRadius: 4,
  },
  timerLabel: {
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 16,
    fontWeight: theme.fontWeight.semibold,
  },
  timerValue: {
    textAlign: 'center',
    fontSize: 34,
    letterSpacing: 0.1,
    marginBottom: 24,
  },
  timerValueCollapsed: {
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  metricTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 30,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
  modalText: {
    textAlign: 'center',
    marginBottom: 14,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    minWidth: 0,
  },
  completionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  completionBurst: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 6,
    borderColor: theme.colors.accentPrimary,
  },
  completionCard: {
    minWidth: 250,
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  completionBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: theme.colors.accentPrimary,
  },
  completionBadgeText: {
    color: '#062a1d',
    fontWeight: theme.fontWeight.bold,
  },
  completionTitle: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 6,
  },
  completionSubtitle: {
    textAlign: 'center',
  },
});
