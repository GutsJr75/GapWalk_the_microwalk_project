import React, { useCallback, useEffect, useRef } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
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

const fmtPace = (seconds: number, distanceMeters: number): string => {
  if (distanceMeters < 10) return '—';
  const pace = (seconds / 60) / (distanceMeters / 1609.34);
  const mins = Math.floor(pace);
  const secs = String(Math.round((pace - mins) * 60)).padStart(2, '00');
  return `${mins}:${secs} /mi`;
};

export const WalkingExpandedScreen: React.FC<Props> = ({ navigation }) => {
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const { activeWalkSnapshot, setActiveWalkSnapshot, setPendingWalkPrompt } = useAppStore();

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

  // 3 rows × 2 cols so each row can flex vertically
  const statRows = [
    [
      { label: 'Distance', value: fmtMiles(distanceMeters) },
      { label: 'Speed',    value: fmtSpeed(distanceMeters, elapsedSeconds) },
    ],
    [
      { label: 'Steps',    value: steps.toLocaleString() },
      { label: 'Pace',     value: fmtPace(elapsedSeconds, distanceMeters) },
    ],
    [
      { label: 'Elevation', value: '—' },
      { label: 'Calories',  value: `${Math.round(steps * 0.04)} kcal` },
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
        {/* Timer card — grows to fill space above stat rows */}
        <View style={[styles.timerCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.timerLabel}>Duration</Text>
          <Text style={[styles.timerValue, { color: palette.textPrimary }]}>{fmtClock(elapsedSeconds)}</Text>
        </View>

        {/* Stat grid — 3 equal-height rows, each with 2 equal-width cards */}
        <View style={styles.statsGrid}>
          {statRows.map((row) => (
            <View key={row[0].label} style={styles.statsRow}>
              {row.map((card) => (
                <View
                  key={card.label}
                  style={[styles.statCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}
                >
                  <Text variant="bodySmall" color={palette.textMuted}>{card.label}</Text>
                  <Text variant="heading" style={[styles.statValue, { color: palette.textPrimary }]}>
                    {card.value}
                  </Text>
                </View>
              ))}
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
  },
  // Timer takes 2 flex units (≈40%), stat grid takes 3 (≈60%)
  timerCard: {
    flex: 2,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timerLabel: {
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timerValue: {
    fontSize: 54,
    lineHeight: 62,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  statsGrid: {
    flex: 3,
    gap: 8,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
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
