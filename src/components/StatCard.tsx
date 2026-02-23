import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Card } from './Card';
import { Text } from './Text';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';

type StatTone = 'target' | 'notifications' | 'steps';

interface StatCardProps {
  title: string;
  current: number;
  target: number;
  unitLabel?: string;
  tone?: StatTone;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  current,
  target,
  unitLabel = 'minutes',
  tone,
}) => {
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const palette = useThemePalette();

  const pct = target > 0 ? Math.min((current / target), 1) : 0;
  const animatedValue = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: pct,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    if (current > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [current, pct]);

  const [animatedPct, setAnimatedPct] = React.useState(0);

  useEffect(() => {
    animatedValue.addListener(({ value }) => {
      setAnimatedPct(value);
    });
    return () => {
      animatedValue.removeAllListeners();
    };
  }, []);

  const toneColor = (() => {
    if (tone === 'target') return '#4ade80';
    if (tone === 'notifications') return '#38bdf8';
    if (tone === 'steps') return '#f59e0b';
    return theme.colors.accentPrimary;
  })();

  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const normalized = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  };

  const withAlpha = (hex: string, alpha: number, fallback: string): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return fallback;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  };

  const currentStrokeDashoffset = circumference - animatedPct * circumference;
  const trackStroke = withAlpha(
    toneColor,
    isDark ? 0.24 : 0.26,
    isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'
  );
  const cardTint = withAlpha(
    toneColor,
    isDark ? 0.08 : 0.10,
    isDark ? '#16233a' : '#dde4ee'
  );
  const borderTint = withAlpha(
    toneColor,
    isDark ? 0.32 : 0.18,
    isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)'
  );
  const goalText = 'Daily goal achieved';
  const progressLabel = `${current}/${target}`;
  const currentValueStyle = progressLabel.length >= 9
    ? styles.currentValueCompact
    : progressLabel.length >= 7
      ? styles.currentValueMedium
      : styles.currentValue;
  const goalValueStyle = progressLabel.length >= 9
    ? styles.goalValueCompact
    : progressLabel.length >= 7
      ? styles.goalValueMedium
      : styles.goalValue;

  return (
    <Card style={[styles.card, { backgroundColor: cardTint, borderColor: borderTint }]}>
      <View style={styles.headerRow}>
        <View style={[styles.titleDot, { backgroundColor: toneColor }]} />
        <Text variant="body" style={styles.title}>{title}</Text>
      </View>

      <View style={styles.circleContainer}>
        <Animated.View style={[styles.svgWrapper, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.circleCore, { backgroundColor: withAlpha(toneColor, isDark ? 0.12 : 0.10, 'transparent') }]} />
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
              <Circle
                stroke={trackStroke}
                strokeWidth={strokeWidth}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
              />
              <Circle
                stroke={toneColor}
                strokeWidth={strokeWidth}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={currentStrokeDashoffset}
                strokeLinecap="round"
              />
            </G>
          </Svg>
          <View style={styles.circleText}>
            <Text variant="title" style={[currentValueStyle, { color: palette.textPrimary }]}>
              {current}
              <Text variant="title" style={[goalValueStyle, { color: palette.textMuted }]}>/{target}</Text>
            </Text>
          </View>
        </Animated.View>
      </View>

      <Text
        variant="bodySmall"
        style={[styles.completion, { color: palette.textMuted }, pct >= 1 && { color: toneColor, fontWeight: theme.fontWeight.semibold }]}
      >
        {pct >= 1 ? goalText : `Progress: ${current} of ${target} ${unitLabel}`}
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 16, paddingVertical: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  titleDot: { width: 9, height: 9, borderRadius: 5 },
  title: { fontWeight: theme.fontWeight.semibold, marginBottom: 0 },
  circleContainer: { alignItems: 'center', marginBottom: 12 },
  svgWrapper: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  circleCore: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  circleText: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  currentValue: { fontWeight: theme.fontWeight.bold, lineHeight: 30 },
  currentValueMedium: { fontWeight: theme.fontWeight.bold, fontSize: 22, lineHeight: 26 },
  currentValueCompact: { fontWeight: theme.fontWeight.bold, fontSize: 20, lineHeight: 24 },
  goalValue: {
    fontSize: 17,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  goalValueMedium: {
    fontSize: 15,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  goalValueCompact: {
    fontSize: 13,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  completion: { color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
