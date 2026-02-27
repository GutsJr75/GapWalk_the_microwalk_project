import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';
import { NudgePlan } from '../../lib/types';
import { parseISO, format } from 'date-fns';

interface MissedPlansSectionProps {
  missedPlans: NudgePlan[];
}

export const MissedPlansSection: React.FC<MissedPlansSectionProps> = ({ missedPlans }) => {
  const palette = useThemePalette();

  if (missedPlans.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text variant="bodySmall" color={palette.textMuted} style={styles.label}>
        Missed earlier
      </Text>
      {missedPlans.map((plan) => {
        const walkStart = parseISO(plan.walkStart);
        const gapStart = parseISO(plan.gapStart);
        const gapEnd = parseISO(plan.gapEnd);
        return (
          <View
            key={plan.id}
            style={[styles.card, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}
          >
            <View style={styles.cardRow}>
              <Text variant="body" style={[styles.time, { color: palette.textMuted }]}>
                {format(walkStart, 'h:mm a')}
              </Text>
              <View style={[styles.badge, { backgroundColor: palette.inputBg }]}>
                <Text
                  variant="bodySmall"
                  style={{
                    color: palette.textMuted,
                    fontWeight: theme.fontWeight.medium,
                    fontSize: theme.fontSize.xs,
                  }}
                >
                  Missed
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
  section: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  label: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingVertical: theme.spacing.ms,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    opacity: 0.6,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  time: {
    fontWeight: theme.fontWeight.semibold,
    textDecorationLine: 'line-through',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
});
