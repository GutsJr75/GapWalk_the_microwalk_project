import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './Text';
import { theme } from '../theme';

interface GapItemProps {
  /** Time range when gap is available (e.g. "10:00–11:59 PM") */
  timeRange: string;
  /** Distributed microwalk minutes for this gap (based on preferences & notification count) */
  duration: number;
  /** Number of walk opportunities (sessions) in this time range */
  opportunities?: number;
  /** Minutes already walked in this range */
  usedMinutes?: number;
  onSkip: () => void;
  /** When present, shows "Notify Me" button to send a walk reminder notification */
  onNotifyMe?: () => void;
}

export const GapItem: React.FC<GapItemProps> = ({
  timeRange,
  duration,
  opportunities = 1,
  usedMinutes = 0,
  onSkip,
  onNotifyMe,
}) => {
  const remaining = Math.max(0, duration - usedMinutes);
  const pct = duration > 0 ? Math.min(1, usedMinutes / duration) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text variant="body" style={styles.time}>{timeRange}</Text>
        <Text variant="muted" style={styles.gapLabel}>Gap available in your schedule</Text>
        <View style={styles.meta}>
          <View style={styles.badge}>
            <Text variant="bodySmall" style={styles.badgeText}>
              {remaining} min for microwalks
            </Text>
          </View>
          {opportunities > 1 && (
            <Text variant="muted" style={styles.oppText}>
              {opportunities} sessions
            </Text>
          )}
        </View>

        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
        </View>
        <Text variant="muted" style={styles.barLabel}>
          {usedMinutes}/{duration} min completed
        </Text>
      </View>

      <View style={styles.actions}>
        {onNotifyMe && (
          <TouchableOpacity onPress={onNotifyMe} hitSlop={8} style={styles.notifyBtn}>
            <Text variant="bodySmall" style={styles.notifyText}>Notify Me</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onSkip} hitSlop={8} style={styles.skipBtn}>
          <Text variant="bodySmall" style={styles.skipText}>Skip</Text>
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
  gapLabel: { fontSize: theme.fontSize.xs, marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  badge: {
    backgroundColor: 'rgba(46,233,166,0.12)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  badgeText: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.xs,
  },
  oppText: {
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
  actions: { gap: 6, alignItems: 'flex-end', marginLeft: 10, paddingTop: 2 },
  notifyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(46,233,166,0.15)',
  },
  notifyText: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.semibold,
  },
  skipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  skipText: {
    color: theme.colors.error,
    fontWeight: theme.fontWeight.medium,
  },
});
