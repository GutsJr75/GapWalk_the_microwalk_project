import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Walking'>;

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

  const [plan, setPlan] = useState<NudgePlan | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [ticks, setTicks] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  const startIsoRef = useRef(new Date().toISOString());
  const pauseStartedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const completionPopAnim = useRef(new Animated.Value(0)).current;
  const completionBurstAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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

  const togglePause = () => {
    if (paused) {
      const pauseStarted = pauseStartedAtRef.current;
      if (pauseStarted) {
        setPausedSeconds((prev) => prev + Math.floor((Date.now() - pauseStarted) / 1000));
      }
      pauseStartedAtRef.current = null;
      setPaused(false);
      return;
    }

    pauseStartedAtRef.current = Date.now();
    setPaused(true);
  };

  const remainingSeconds = useMemo(() => {
    if (!plan) return activeSeconds;
    const endMs = new Date(plan.gapEnd).getTime();
    return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  }, [activeSeconds, plan, ticks]);

  const targetSeconds = useMemo(() => {
    if (!plan) return null;
    const startMs = new Date(startIsoRef.current).getTime();
    const endMs = new Date(plan.gapEnd).getTime();
    return Math.max(60, Math.floor((endMs - startMs) / 1000));
  }, [plan]);

  const progressRatio = targetSeconds
    ? Math.max(0, Math.min(1, 1 - remainingSeconds / targetSeconds))
    : Math.max(0, Math.min(1, activeSeconds / 900));

  const saveSession = async () => {
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
      await plansRepo.updateStatus(planId, 'completed');
    }

    analyticsService.track('walk_completed', {
      planId: planId || null,
      activeSeconds,
      pausedSeconds: finalPausedSeconds,
      distanceMeters: 0,
      steps: 0,
      usedLocation: false,
      hadWalkingSignal: false,
    });

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
      navigation.navigate('Dashboard');
    }, 2200);
  };

  const confirmEnd = async () => {
    setShowEndModal(false);
    await saveSession();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]} edges={['top', 'left', 'right']}>
      <View style={[styles.topBar, { borderBottomColor: 'rgba(15,23,42,0.14)' }]}>
        <Text variant="title" style={styles.topTitle}>Walking</Text>
      </View>

      <View style={styles.webPlaceholder}>
        <Text variant="title" style={styles.placeholderTitle}>Map is available on mobile app</Text>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.placeholderBody}>
          Web preview supports timer flow, but live map and movement tracking run on Android/iOS builds.
        </Text>
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 8, 18) }]}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(progressRatio * 100, 5)}%` }]} />
        </View>

        <Text variant="body" style={styles.timerLabel}>{plan ? 'Remaining Time' : 'Session Time'}</Text>
        <Text variant="heading" style={styles.timerValue}>{formatClock(remainingSeconds)}</Text>

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

      {showCompletion && (
        <Animated.View style={[styles.completionOverlay, { opacity: completionPopAnim }]} pointerEvents="none">
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
                opacity: completionPopAnim,
                transform: [{ scale: completionPopAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              },
            ]}
          >
            <View style={styles.completionBadge}>
              <Text variant="title" style={styles.completionBadgeText}>✓</Text>
            </View>
            <Text variant="title" style={styles.completionTitle}>Walk complete</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.completionSubtitle}>
              {Math.max(1, Math.floor(activeSeconds / 60))} min session saved
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
    height: 68,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 38,
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
  },
  placeholderBody: {
    textAlign: 'center',
    maxWidth: 360,
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.14)',
    paddingHorizontal: 22,
    paddingTop: 14,
    backgroundColor: 'rgba(247, 251, 255, 0.97)',
  },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: 'rgba(15,23,42,0.24)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2cb7ff',
  },
  timerLabel: {
    textAlign: 'center',
    marginBottom: 6,
    fontSize: 18,
    fontWeight: theme.fontWeight.semibold,
  },
  timerValue: {
    textAlign: 'center',
    fontSize: 42,
    letterSpacing: 0.3,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: 'rgba(236, 245, 255, 0.82)',
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
    borderColor: 'rgba(15,23,42,0.14)',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#f7fbff',
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
