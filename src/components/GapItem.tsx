import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Text } from './Text';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';
import { useTapFeedbackAction } from '../hooks/useTapFeedbackAction';

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
    backgroundColor: palette.accentMuted,
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
  const badgeTextColor = palette.accentOnTint;
  const changeTextColor = palette.info;
  const {
    isTapActive: isChangeTapActive,
    handlePress: handleChangePress,
    handlePressIn: handleChangePressIn,
    handlePressOut: handleChangePressOut,
  } = useTapFeedbackAction({
    onPress: onChange,
  });
  const {
    isTapActive: isCancelTapActive,
    handlePress: handleCancelPress,
    handlePressIn: handleCancelPressIn,
    handlePressOut: handleCancelPressOut,
  } = useTapFeedbackAction({
    onPress: onCancel,
  });

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
          <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: palette.accentPrimary }]} />
        </View>
        <Text variant="muted" style={styles.barLabel}>
          {usedMinutes}/{duration} min completed
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleChangePress}
          onPressIn={handleChangePressIn}
          onPressOut={handleChangePressOut}
          hitSlop={8}
          style={({ pressed }) => [
            styles.actionBtn,
            changeBtnTheme,
            (pressed || isChangeTapActive) && {
              shadowColor: palette.info,
              shadowOpacity: 0.28,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            },
            (pressed || isChangeTapActive) && styles.actionBtnActive,
            pressed && styles.actionBtnPressed,
          ]}
          android_ripple={{ color: 'rgba(56,189,248,0.22)', borderless: false }}
        >
          <Text variant="bodySmall" style={[styles.changeText, { color: changeTextColor }]}>Change</Text>
        </Pressable>
        <Pressable
          onPress={handleCancelPress}
          onPressIn={handleCancelPressIn}
          onPressOut={handleCancelPressOut}
          hitSlop={8}
          style={({ pressed }) => [
            styles.actionBtn,
            cancelBtnTheme,
            (pressed || isCancelTapActive) && {
              shadowColor: theme.colors.error,
              shadowOpacity: 0.28,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            },
            (pressed || isCancelTapActive) && styles.actionBtnActive,
            pressed && styles.actionBtnPressed,
          ]}
          android_ripple={{ color: 'rgba(239,68,68,0.22)', borderless: false }}
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
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    // native depth
    ...theme.shadow.card,
  },
  actionBtnActive: {
    opacity: Platform.OS === 'ios' ? 0.94 : 0.98,
  },
  actionBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: Platform.OS === 'ios' ? 0.92 : 0.95,
  },
  left: { flex: 1 },
  time: { fontWeight: theme.fontWeight.semibold, marginBottom: 2 },
  gapLabel: { fontSize: theme.fontSize.xs, marginBottom: 2 },
  notifyLabel: { fontSize: theme.fontSize.xs, marginBottom: theme.spacing.ms },
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
    borderRadius: 3,
  },
  barLabel: {
    fontSize: theme.fontSize.xxs,
  },
  actions: { alignItems: 'stretch' as const, marginLeft: theme.spacing.ml, paddingTop: 2, gap: theme.spacing.sm, width: 80 },
  actionBtn: {
    paddingVertical: theme.spacing.ms,
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
