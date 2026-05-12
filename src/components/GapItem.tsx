import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';
import { Button } from './Button';
import { compactActionTokens } from './buttonSystem';
import { withAlpha } from '../theme/colorUtils';
import type { OpportunityPrimaryAction, OpportunityState } from '../types';

interface GapItemProps {
  timeRange: string;
  walkWindowLabel: string;
  notifyLabel: string;
  duration: number;
  usedMinutes?: number;
  state: OpportunityState;
  statusLabel?: string;
  primaryAction: OpportunityPrimaryAction;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export const GapItem: React.FC<GapItemProps> = ({
  timeRange,
  walkWindowLabel,
  notifyLabel,
  duration,
  usedMinutes = 0,
  state,
  statusLabel,
  primaryAction,
  primaryActionLabel,
  onPrimaryAction,
  onCancel,
  showCancel = true,
}) => {
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const palette = useThemePalette();

  const remaining = Math.max(0, duration - usedMinutes);
  const pct = duration > 0 ? Math.min(1, usedMinutes / duration) : 0;
  const isHighlighted = state === 'live' || state === 'active';
  const isStartAction = primaryAction === 'start' || primaryAction === 'go';

  const containerTheme = isHighlighted
    ? {
        backgroundColor: palette.bgSurfaceElevated,
        borderColor: withAlpha(palette.accentPrimary, isDark ? 0.52 : 0.34),
        shadowColor: palette.accentPrimary,
        shadowOpacity: isDark ? 0.34 : 0.22,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 0 },
        elevation: 10,
      }
    : {
        backgroundColor: palette.bgSurfaceElevated,
        borderColor: palette.borderSoft,
      };

  const badgeTheme = isHighlighted
    ? { backgroundColor: withAlpha(palette.accentPrimary, isDark ? 0.24 : 0.18) }
    : { backgroundColor: palette.accentMuted };

  const barTrackTheme = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.14)',
  };

  const badgeTextColor = isHighlighted ? palette.accentPrimary : palette.accentOnTint;
  const statusPillTheme = {
    backgroundColor: isHighlighted
      ? withAlpha(palette.accentPrimary, isDark ? 0.24 : 0.16)
      : withAlpha(palette.info, isDark ? 0.22 : 0.14),
  };
  const statusTextColor = isHighlighted ? palette.accentPrimary : palette.info;
  const primaryVariant = isStartAction ? 'primary' : 'info';

  return (
    <View style={[styles.container, containerTheme, isHighlighted && styles.highlightedContainer]}>
      <View style={styles.left}>
        <View style={styles.headerRow}>
          <Text variant="body" style={styles.time} numberOfLines={1}>
            {timeRange}
          </Text>
          {statusLabel ? (
            <View style={[styles.statusPill, statusPillTheme]}>
              <Text variant="bodySmall" style={[styles.statusText, { color: statusTextColor }]}>
                {statusLabel}
              </Text>
            </View>
          ) : null}
        </View>
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
        <Button
          title={primaryActionLabel}
          onPress={onPrimaryAction}
          variant={primaryVariant}
          size="compact"
          style={styles.actionBtn}
        />
        {showCancel && onCancel ? (
          <Button
            title="Cancel"
            onPress={onCancel}
            variant="danger"
            size="compact"
            style={styles.actionBtn}
          />
        ) : null}
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
    ...theme.shadow.card,
  },
  highlightedContainer: {
    borderWidth: 1.5,
  },
  left: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: 8,
  },
  time: {
    fontWeight: theme.fontWeight.semibold,
    flexShrink: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 9,
    fontWeight: theme.fontWeight.semibold,
  },
  gapLabel: { fontSize: theme.fontSize.xs, marginBottom: 4 },
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
  actions: {
    alignItems: 'stretch',
    alignSelf: 'stretch',
    justifyContent: 'center',
    marginLeft: theme.spacing.ml,
    gap: theme.spacing.sm,
    minWidth: 80,
    maxWidth: 96,
    flexShrink: 0,
  },
  actionBtn: {
    width: '100%',
    minHeight: compactActionTokens.minHeight,
  },
});
