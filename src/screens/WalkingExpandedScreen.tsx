import React, { useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'WalkingExpanded'>;

const formatClockDigital = (seconds: number): string => {
  const clamped = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatMiles = (distanceMeters: number): string =>
  `${(distanceMeters / 1609.34).toFixed(2)} mi`;

const confidenceLabel = (confidence: string | undefined): string => {
  if (confidence === 'high') return 'High';
  if (confidence === 'medium') return 'Medium';
  if (confidence === 'low') return 'Low';
  return '--';
};

const sensorHealthLabel = (health: string | undefined): string => {
  if (health === 'active') return 'Active';
  if (health === 'stale') return 'Warming up';
  if (health === 'unsupported') return 'Unavailable';
  if (health === 'denied') return 'Permission needed';
  return '--';
};

export const WalkingExpandedScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const palette = useThemePalette();
  const { activeWalkSnapshot } = useAppStore();

  const steps = activeWalkSnapshot?.steps ?? 0;
  const distanceMeters = activeWalkSnapshot?.distanceMeters ?? 0;
  // DB: active_seconds
  const activeSeconds = activeWalkSnapshot?.elapsedSeconds ?? 0;
  // DB: paused_seconds
  const pausedSeconds = activeWalkSnapshot
    ? Math.floor(activeWalkSnapshot.totalPausedMs / 1000)
    : 0;
  const displayState = activeWalkSnapshot?.displayState ?? 'calibrating';
  const stepSource = activeWalkSnapshot?.stepSource ?? 'none';
  // DB: sensor_health_at_start (live proxy)
  const pedometerHealth = activeWalkSnapshot?.pedometerHealth ?? 'stale';
  // DB: motion_confidence
  const motionConfidence = activeWalkSnapshot?.motionConfidence;

  const speedMph =
    activeSeconds > 0
      ? ((distanceMeters / 1609.34) / (activeSeconds / 3600))
      : 0;

  const stepSourceLabel = (): string => {
    if (stepSource === 'gps_fallback') return 'GPS step backup';
    if (pedometerHealth === 'active') return 'Step sensor';
    if (pedometerHealth === 'stale') return 'Sensor warming up';
    if (pedometerHealth === 'unsupported') return 'Sensor unavailable';
    return 'Sensor permission needed';
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 40 || g.vx > 0.4) {
          navigation.goBack();
        }
      },
    }),
  ).current;

  const stats = [
    {
      label: 'Active Time',
      value: formatClockDigital(activeSeconds),
      icon: 'timer-outline' as const,
    },
    {
      label: 'Distance',
      value: formatMiles(distanceMeters),
      icon: 'navigate-outline' as const,
    },
    {
      label: 'Steps',
      value: steps.toLocaleString(),
      icon: 'footsteps' as const,
    },
    {
      label: 'Speed',
      value: `${speedMph.toFixed(1)} mph`,
      icon: 'speedometer-outline' as const,
    },
    {
      label: 'Paused Time',
      value: formatClockDigital(pausedSeconds),
      icon: 'pause-circle-outline' as const,
    },
    {
      label: 'Motion Confidence',
      value: confidenceLabel(motionConfidence),
      icon: 'pulse-outline' as const,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: palette.bgApp }]} {...panResponder.panHandlers}>
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: palette.bgSurface,
            borderBottomColor: palette.borderSoft,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.topBarBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={palette.textPrimary} />
        </Pressable>
        <Text variant="title" style={styles.topBarTitle}>Session Details</Text>
        <View style={styles.topBarBtn} />
      </View>

      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom + 10, 22) }]}>
        <View
          style={[
            styles.dock,
            {
              backgroundColor: palette.bgSurfaceElevated,
              borderColor: palette.borderSoft,
            },
          ]}
        >
          <View style={styles.dockDots}>
            <View style={[styles.dockDot, { backgroundColor: palette.borderStrong }]} />
            <View style={[styles.dockDot, styles.dockDotActive, { backgroundColor: palette.accentPrimary }]} />
          </View>

          <View style={styles.grid}>
            {stats.map((stat) => (
              <View
                key={stat.label}
                style={[
                  styles.statCard,
                  { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft },
                ]}
              >
                <View style={styles.statHeader}>
                  <Ionicons name={stat.icon} size={15} color={palette.textMuted} />
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>
                    {stat.label}
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: palette.textPrimary }]}>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>

          {activeWalkSnapshot == null && (
            <View style={styles.emptyRow}>
              <Ionicons name="walk-outline" size={16} color={palette.textMuted} />
              <Text variant="bodySmall" color={palette.textMuted}>
                Live data syncs during an active walk
              </Text>
            </View>
          )}

          <View
            style={[
              styles.sourceRow,
              { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft },
            ]}
          >
            <Ionicons
              name={stepSource === 'gps_fallback' ? 'location-outline' : 'body-outline'}
              size={14}
              color={palette.textMuted}
            />
            <Text variant="bodySmall" color={palette.textMuted}>
              {stepSourceLabel()}
            </Text>
            <Text variant="bodySmall" color={palette.borderStrong}>·</Text>
            <Text variant="bodySmall" color={palette.textMuted}>
              {sensorHealthLabel(pedometerHealth)}
            </Text>
            <View style={styles.stateSpacer} />
            <View
              style={[
                styles.stateDot,
                {
                  backgroundColor:
                    displayState === 'walking'
                      ? palette.accentPrimary
                      : displayState === 'paused'
                      ? '#f59e0b'
                      : palette.borderStrong,
                },
              ]}
            />
            <Text variant="bodySmall" color={palette.textMuted}>
              {displayState === 'walking'
                ? 'Walking'
                : displayState === 'paused'
                ? 'Paused'
                : 'Detecting'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
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
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    justifyContent: 'flex-end',
  },
  dock: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  dockDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  dockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dockDotActive: {
    width: 20,
    borderRadius: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: '48%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statLabel: {
    lineHeight: 18,
  },
  statValue: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: theme.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stateSpacer: {
    flex: 1,
  },
  stateDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
