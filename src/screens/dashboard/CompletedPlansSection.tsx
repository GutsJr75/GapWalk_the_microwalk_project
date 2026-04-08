import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';
import { NudgePlan } from '../../types';
import { parseISO, format } from 'date-fns';

interface CompletedPlansSectionProps {
  completedPlans: NudgePlan[];
  todayMinutesWalked?: number;
}

export const CompletedPlansSection: React.FC<CompletedPlansSectionProps> = ({ completedPlans, todayMinutesWalked = 0 }) => {
  const palette = useThemePalette();

  if (completedPlans.length === 0) {
    if (todayMinutesWalked > 0) return null;
    return (
      <View style={styles.section}>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.label}>
          Completed today
        </Text>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.emptyHint}>
          No completed walks yet today. Start one from your opportunities above or tap &quot;Start Manual Walk&quot; below.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text variant="bodySmall" color={palette.textMuted} style={styles.label}>
        Completed today
      </Text>
      {completedPlans.map((plan) => {
        const walkStart = parseISO(plan.walkStart);
        const gapStart = parseISO(plan.gapStart);
        const gapEnd = parseISO(plan.gapEnd);
        return (
          <View
            key={plan.id}
            style={[styles.card, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}
          >
            <View style={styles.cardRow}>
              <Text variant="body" style={[styles.time, { color: palette.textPrimary }]}>
                {format(walkStart, 'h:mm a')}
              </Text>
              <View style={[styles.badge, { backgroundColor: palette.accentMuted }]}>
                <Text
                  variant="bodySmall"
                  style={{
                    color: palette.accentOnTint,
                    fontWeight: theme.fontWeight.medium,
                    fontSize: theme.fontSize.xs,
                  }}
                >
                  Done
                </Text>
              </View>
            </View>
            <Text variant="muted" style={{ fontSize: theme.fontSize.xs }}>
              {format(gapStart, 'h:mm a')} - {format(gapEnd, 'h:mm a')} ({plan.suggestedDurationMinutes} min)
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
  },
  emptyHint: {
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
