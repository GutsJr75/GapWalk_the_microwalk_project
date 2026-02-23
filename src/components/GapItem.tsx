import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';

interface GapItemProps {
  /** Time range when gap is available (e.g. "3:00 PM - 7:00 PM") */
  timeRange: string;
  /** Exact suggested walk window (e.g. "Walk: 3:05 PM - 3:17 PM") */
  walkWindowLabel: string;
  /** Exact notification timing for this opportunity */
  notifyLabel: string;
  /** Suggested walk minutes for this opportunity */
  duration: number;
  /** Minutes already walked in this range */
  usedMinutes?: number;
  /** Cancel this opportunity and move to the next best one */
  onCancel: () => void;
  /** Change walk window and duration for this opportunity */
  onChange: () => void;
}

export const GapItem: React.FC<GapItemProps> = ({
  timeRange,
  walkWindowLabel,
  notifyLabel,
  duration,
  usedMinutes = 0,
  onCancel,
  onChange,
}) => {
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const palette = useThemePalette();

  const remaining = Math.max(0, duration - usedMinutes);
  const pct = duration > 0 ? Math.min(1, usedMinutes / duration) : 0;

  const containerTheme = {
    backgroundColor: palette.bgSurfaceElevated,
    borderColor: palette.borderSoft,
  };

  const badgeTheme = {
    backgroundColor: isDark ? 'rgba(46,233,166,0.12)' : 'rgba(46,233,166,0.2)',
  };

  const barTrackTheme = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.14)',
  };

  const cancelBtnTheme = {
    backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.14)',
  };
  const changeBtnTheme = {
    backgroundColor: isDark ? 'rgba(56,189,248,0.14)' : 'rgba(56,189,248,0.18)',
  };
  const badgeTextColor = isDark ? theme.colors.accentPrimary : '#0f5132';
  const changeTextColor = isDark ? '#38bdf8' : '#0369a1';

  return (
    <View style={[styles.container, containerTheme]}>
      <View style={styles.left}>
        <Text variant="body" style={styles.time}>{timeRange}</Text>
        <Text variant="muted" style={styles.gapLabel}>{walkWindowLabel}</Text>
        <Text variant="muted" style={styles.notifyLabel}>{notifyLabel}</Text>
        <View style={styles.meta}>
          <View style={[styles.badge, badgeTheme]}>
            <Text variant="bodySmall" style={[styles.badgeText, { color: badgeTextColor }]}>
              {remaining} min planned
            </Text>
          </View>
        </View>

        <View style={[styles.barTrack, barTrackTheme]}>
          <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
        </View>
        <Text variant="muted" style={styles.barLabel}>
          {usedMinutes}/{duration} min completed
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onChange();
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.actionBtn, changeBtnTheme, pressed && styles.actionBtnPressed]}
          android_ripple={{ color: 'rgba(56,189,248,0.25)', borderless: false }}
        >
          <Text variant="bodySmall" style={[styles.changeText, { color: changeTextColor }]}>Change</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onCancel();
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.actionBtn, cancelBtnTheme, pressed && styles.actionBtnPressed]}
          android_ripple={{ color: 'rgba(239,68,68,0.25)', borderless: false }}
        >
          <Text variant="bodySmall" style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    // native depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  actionBtnPressed: {
    transform: [{ scale: 0.93 }],
    opacity: 0.8,
  },
  left: { flex: 1 },
  time: { fontWeight: theme.fontWeight.semibold, marginBottom: 2 },
  gapLabel: { fontSize: theme.fontSize.xs, marginBottom: 2 },
  notifyLabel: { fontSize: theme.fontSize.xs, marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  badge: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.xs,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  barFill: {
    height: '100%',
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: 3,
  },
  barLabel: {
    fontSize: 11,
  },
  actions: { alignItems: 'stretch' as const, marginLeft: 10, paddingTop: 2, gap: 8, width: 80 },
  actionBtn: {
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center' as const,
  },
  cancelText: {
    color: theme.colors.error,
    fontWeight: theme.fontWeight.medium,
  },
  changeText: {
    fontWeight: theme.fontWeight.medium,
  },
});
