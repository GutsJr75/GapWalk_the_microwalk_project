import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';
import { WeeklyStats } from '../../utils/statsUtils';

interface WeeklyStatsCardProps {
  weeklyStats: WeeklyStats;
  prevWeeklyStats?: WeeklyStats | null;
}

/** Animates a number from `from` to `to` over 600ms and returns the display value. */
const useCountUp = (to: number, from: number) => {
  const anim = useRef(new Animated.Value(from)).current;
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    anim.setValue(from);
    Animated.timing(anim, {
      toValue: to,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [to, from]);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => anim.removeListener(id);
  }, []);

  return display;
};

/** Shows "+N" badge that fades in, floats up, then fades out. */
const DeltaBadge: React.FC<{ delta: number; color: string; format?: (n: number) => string }> = ({ delta, color, format }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (delta <= 0) return;
    opacity.setValue(0);
    translateY.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -8, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [delta]);

  if (delta <= 0) return null;

  const label = format ? `+${format(delta)}` : `+${delta}`;

  return (
    <Animated.Text style={[styles.deltaBadge, { color, opacity, transform: [{ translateY }] }]}>
      {label}
    </Animated.Text>
  );
};

export const WeeklyStatsCard: React.FC<WeeklyStatsCardProps> = ({ weeklyStats, prevWeeklyStats }) => {
  const palette = useThemePalette();

  const prevMinutes = prevWeeklyStats?.totalMinutes ?? 0;
  const prevSteps = prevWeeklyStats?.totalSteps ?? 0;
  const prevDays = prevWeeklyStats?.daysActive ?? 0;

  const displayMinutes = useCountUp(weeklyStats.totalMinutes, prevMinutes);
  const displaySteps = useCountUp(weeklyStats.totalSteps, prevSteps);
  const displayDays = useCountUp(weeklyStats.daysActive, prevDays);

  const deltaMinutes = prevWeeklyStats ? weeklyStats.totalMinutes - prevMinutes : 0;
  const deltaSteps = prevWeeklyStats ? weeklyStats.totalSteps - prevSteps : 0;
  const deltaDays = prevWeeklyStats ? weeklyStats.daysActive - prevDays : 0;

  return (
    <Card elevated style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="bar-chart-outline" size={18} color={palette.accentPrimary} />
        <Text variant="body" style={styles.title}>This Week</Text>
      </View>
      <View style={styles.grid}>
        <View style={styles.item}>
          <Ionicons name="time-outline" size={16} color={palette.accentPrimary} style={{ marginBottom: 4 }} />
          <View style={styles.valueRow}>
            <Text variant="title" style={[styles.value, { color: palette.textPrimary }]}>
              {displayMinutes}
            </Text>
            <DeltaBadge delta={deltaMinutes} color={palette.accentPrimary} />
          </View>
          <Text variant="bodySmall" color={palette.textMuted}>Minutes</Text>
        </View>
        <View style={styles.item}>
          <Ionicons name="footsteps-outline" size={16} color={palette.accentPrimary} style={{ marginBottom: 4 }} />
          <View style={styles.valueRow}>
            <Text variant="title" style={[styles.value, { color: palette.textPrimary }]}>
              {displaySteps.toLocaleString()}
            </Text>
            <DeltaBadge delta={deltaSteps} color={palette.accentPrimary} format={(n) => n.toLocaleString()} />
          </View>
          <Text variant="bodySmall" color={palette.textMuted}>Steps</Text>
        </View>
        <View style={styles.item}>
          <Ionicons name="calendar-outline" size={16} color={palette.accentPrimary} style={{ marginBottom: 4 }} />
          <View style={styles.valueRow}>
            <Text variant="title" style={[styles.value, { color: palette.textPrimary }]}>
              {displayDays}
              <Text variant="title" style={[styles.denominator, { color: palette.textMuted }]}>
                /7
              </Text>
            </Text>
            <DeltaBadge delta={deltaDays} color={palette.accentPrimary} />
          </View>
          <Text variant="bodySmall" color={palette.textMuted}>Active Days</Text>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontWeight: theme.fontWeight.semibold,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  item: {
    alignItems: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 4,
  },
  denominator: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  deltaBadge: {
    fontSize: 11,
    fontWeight: theme.fontWeight.semibold,
    marginLeft: 3,
    marginBottom: 4,
  },
});
