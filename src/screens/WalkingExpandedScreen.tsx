import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { plansRepo } from '../data/repositories/plansRepo';
import { androidWalkTracking } from '../services/androidWalkTracking';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'WalkingExpanded'>;

const fmtClock = (s: number): string => {
  const clamped = Math.max(0, Math.floor(s));
  const m = Math.floor(clamped / 60);
  const ss = String(clamped % 60).padStart(2, '0');
  return `${m}:${ss}`;
};

const fmtMiles = (d: number): string => `${(d / 1609.34).toFixed(2)} mi`;

const fmtSpeed = (distanceMeters: number, seconds: number): string => {
  if (seconds === 0) return '0.0 mph';
  return `${((distanceMeters / 1609.34) / (seconds / 3600)).toFixed(1)} mph`;
};

const fmtRemaining = (elapsedSec: number, targetSec: number): string => {
  const remaining = Math.max(0, Math.floor(targetSec - elapsedSec));
  const m = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  return `${m}:${ss}`;
};

export const WalkingExpandedScreen: React.FC<Props> = ({ navigation }) => {
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const { activeWalkSnapshot, setActiveWalkSnapshot, setPendingWalkPrompt, preferences, todaySteps } = useAppStore();

  const snapshot = activeWalkSnapshot;
  const elapsedSeconds = snapshot?.elapsedSeconds ?? 0;
  const distanceMeters = snapshot?.distanceMeters ?? 0;
  const steps = snapshot?.steps ?? 0;
  const paused = !!snapshot?.paused;

  useEffect(() => {
    const sub = androidWalkTracking.subscribe((s) => {
      setActiveWalkSnapshot(s);
    });
    return () => sub.remove();
  }, [setActiveWalkSnapshot]);

  const handlePauseResume = useCallback(async () => {
    const s = paused
      ? await androidWalkTracking.resumeSession('screen')
      : await androidWalkTracking.pauseSession('screen');
    setActiveWalkSnapshot(s);
  }, [paused, setActiveWalkSnapshot]);

  const handleFinish = useCallback(() => {
    setPendingWalkPrompt('end_confirmation');
    navigation.goBack();
  }, [navigation, setPendingWalkPrompt]);

  const accentColor = palette.accentPrimary;
  const planId = snapshot?.planId;

  // Breathing ring target: use nudge plan duration if available, else 60 min
  const [ringTargetSeconds, setRingTargetSeconds] = useState(3600);
  const [hasPlan, setHasPlan] = useState(false);
  useEffect(() => {
    if (!planId) return;
    plansRepo.getById(planId).then((plan) => {
      if (plan?.suggestedDurationMinutes) {
        setRingTargetSeconds(plan.suggestedDurationMinutes * 60);
        setHasPlan(true);
      }
    }).catch(() => {});
  }, [planId]);

  // Staggered entrance animation for timer + 6 stat cards
  const entranceAnims = useRef(
    Array.from({ length: 7 }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    Animated.stagger(
      60,
      entranceAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [entranceAnims]);

  // Breathing ring animation
  const breatheAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (paused) {
      breatheAnim.setValue(0);
      return undefined;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [paused, breatheAnim]);

  const dotsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 40 || g.vx > 0.4) {
          navigation.goBack();
        }
      },
    }),
  ).current;

  const ringSize = 120;
  const ringStroke = 4;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = ringRadius * 2 * Math.PI;
  const ringProgress = Math.min(1, elapsedSeconds / ringTargetSeconds);

  const stepGoalEnabled = preferences?.stepGoalEnabled ?? false;
  const stepGoalTarget = preferences?.stepGoal ?? 1000;
  const totalStepsToday = todaySteps + steps;
  const goalPct = stepGoalEnabled
    ? `${Math.min(100, Math.round((totalStepsToday / stepGoalTarget) * 100))}%`
    : 'N/A';

  // 3 rows × 2 cols so each row can flex vertically
  const statRows = [
    [
      { label: 'Distance', value: fmtMiles(distanceMeters) },
      { label: 'Speed',    value: fmtSpeed(distanceMeters, elapsedSeconds) },
    ],
    [
      { label: 'Steps',      value: steps.toLocaleString() },
      { label: 'Time Remaining', value: hasPlan ? fmtRemaining(elapsedSeconds, ringTargetSeconds) : 'N/A' },
    ],
    [
      { label: 'Calories',     value: `${Math.round(steps * 0.04)} kcal` },
      { label: 'Goal Progress', value: goalPct },
    ],
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.bgApp }]} edges={['top', 'left', 'right']}>
      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: palette.bgSurfaceElevated, borderBottomColor: palette.borderSoft }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBarBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={palette.textPrimary} />
        </Pressable>
        <Text variant="title" style={styles.topBarTitle}>Walking</Text>
        {/* Spacer to balance the back button and keep title centered */}
        <View style={styles.topBarBtn} />
      </View>

      {/* Content — fills all space between top bar and action strip */}
      <View style={styles.content}>
        {/* Timer card with breathing progress ring */}
        <Animated.View
          style={{
            opacity: entranceAnims[0],
            transform: [{ translateY: entranceAnims[0].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}
        >
          <View style={[styles.timerCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.timerLabel}>Duration</Text>
            <View style={styles.timerRingWrap}>
              <Animated.View style={{
                transform: [{
                  scale: breatheAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.04],
                  }),
                }],
              }}>
                <Svg width={ringSize} height={ringSize}>
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    stroke={palette.borderSoft}
                    strokeWidth={ringStroke}
                    fill="transparent"
                  />
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    stroke={accentColor}
                    strokeWidth={ringStroke}
                    fill="transparent"
                    strokeDasharray={`${ringCircumference}`}
                    strokeDashoffset={ringCircumference * (1 - ringProgress)}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${ringSize / 2}, ${ringSize / 2}`}
                  />
                </Svg>
              </Animated.View>
              <View style={styles.timerRingCenter}>
                <Text style={[styles.timerValue, { color: palette.textPrimary }]}>{fmtClock(elapsedSeconds)}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Stat grid — 3 equal-height rows, each with 2 equal-width cards */}
        <View style={styles.statsGrid}>
          {statRows.map((row, rowIndex) => (
            <View key={row[0].label} style={styles.statsRow}>
              {row.map((card, colIndex) => {
                const animIndex = 1 + rowIndex * 2 + colIndex;
                return (
                  <Animated.View
                    key={card.label}
                    style={[
                      styles.statCard,
                      { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft },
                      {
                        opacity: entranceAnims[animIndex],
                        transform: [{ translateY: entranceAnims[animIndex].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                      },
                    ]}
                  >
                    <Text variant="body" color={palette.textMuted}>{card.label}</Text>
                    <Text style={[styles.statValue, { color: palette.textPrimary }]}>
                      {card.value}
                    </Text>
                  </Animated.View>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Bottom action strip */}
      <View
        style={[
          styles.actionStrip,
          {
            backgroundColor: palette.bgSurfaceElevated,
            borderTopColor: palette.borderSoft,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.dotsRow} {...dotsPanResponder.panHandlers}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <View style={[styles.dot, { width: 8, backgroundColor: palette.borderStrong }]} />
          </Pressable>
          <View style={[styles.dot, { width: 20, backgroundColor: accentColor }]} />
        </View>

        <View style={styles.actionsRow}>
          <Button
            title={paused ? 'Resume' : 'Pause'}
            onPress={() => { void handlePauseResume(); }}
            variant="secondary"
            style={styles.actionBtn}
          />
          <Button
            title="Finish"
            onPress={handleFinish}
            variant="danger"
            style={styles.actionBtn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
  },
  // Fills all space between top bar and action strip
  content: {
    flex: 1,
    padding: 10,
    gap: 8,
    justifyContent: 'center',
  },
  // Timer card — compact with breathing ring
  timerCard: {
    flex: 0,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  timerLabel: {
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timerValue: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  timerRingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  timerRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flex: 0,
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'flex-start',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  actionStrip: {
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
});
