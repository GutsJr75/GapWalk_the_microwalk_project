import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';
import { withAlpha } from '../../theme/colorUtils';

export interface WalkedTodayEntry {
  id: string;
  title: string;
  walkedMinutes: number;
  plannedMinutes: number;
  status: 'partial' | 'incomplete' | 'completed';
}

interface WalkedTodaySectionProps {
  entries: WalkedTodayEntry[];
}

const STATUS_LABELS: Record<WalkedTodayEntry['status'], string> = {
  partial: 'Partial',
  incomplete: 'Incomplete',
  completed: 'Completed',
};

export const WalkedTodaySection: React.FC<WalkedTodaySectionProps> = ({ entries }) => {
  const palette = useThemePalette();

  if (entries.length === 0) {
    return (
      <View style={styles.section}>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.label}>
          Walked today
        </Text>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.emptyHint}>
          No walks logged yet today. Start one from your opportunities above or tap &quot;Start Manual Walk&quot; below.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text variant="bodySmall" color={palette.textMuted} style={styles.label}>
        Walked today
      </Text>
      {entries.map((entry) => {
        const isCompleted = entry.status === 'completed';
        const badgeBackground = isCompleted
          ? palette.accentMuted
          : withAlpha(theme.colors.warning, 0.18);
        const badgeTextColor = isCompleted
          ? palette.accentOnTint
          : theme.colors.warning;

        return (
          <View
            key={entry.id}
            style={[styles.card, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}
          >
            <View style={styles.cardRow}>
              <Text variant="body" style={[styles.time, { color: palette.textPrimary }]}>
                {entry.title}
              </Text>
              <View style={[styles.badge, { backgroundColor: badgeBackground }]}>
                <Text
                  variant="bodySmall"
                  style={{
                    color: badgeTextColor,
                    fontWeight: theme.fontWeight.medium,
                    fontSize: theme.fontSize.xs,
                  }}
                >
                  {STATUS_LABELS[entry.status]}
                </Text>
              </View>
            </View>
            <Text variant="muted" style={styles.progressText}>
              {entry.walkedMinutes}/{entry.plannedMinutes} min walked
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {},
  label: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingVertical: theme.spacing.ms,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  time: {
    fontWeight: theme.fontWeight.semibold,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: theme.spacing.sm,
    flexShrink: 0,
  },
  progressText: {
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.xs,
  },
  emptyHint: {
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
