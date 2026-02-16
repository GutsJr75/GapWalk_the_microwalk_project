import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
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
}

export const GapItem: React.FC<GapItemProps> = ({
  timeRange,
  walkWindowLabel,
  notifyLabel,
  duration,
  usedMinutes = 0,
  onCancel,
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
  const badgeTextColor = isDark ? theme.colors.accentPrimary : '#0f5132';

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
        <TouchableOpacity onPress={onCancel} hitSlop={8} style={[styles.cancelBtn, cancelBtnTheme]}>
          <Text variant="bodySmall" style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.bgSurfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  left: { flex: 1 },
  time: { fontWeight: theme.fontWeight.semibold, marginBottom: 2 },
  gapLabel: { fontSize: theme.fontSize.xs, marginBottom: 2 },
  notifyLabel: { fontSize: theme.fontSize.xs, marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  badge: {
    backgroundColor: 'rgba(46,233,166,0.12)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
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
  actions: { alignItems: 'flex-end', marginLeft: 10, paddingTop: 2 },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  cancelText: {
    color: theme.colors.error,
    fontWeight: theme.fontWeight.medium,
  },
});
