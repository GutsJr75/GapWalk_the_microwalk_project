import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Text } from './Text';
import { getThemePalette } from '../theme/palette';

type CompletionKind = 'completed' | 'saved_later';

interface WalkCompletionSummaryProps {
  themeMode: 'light' | 'dark';
  palette: ReturnType<typeof getThemePalette>;
  kind?: CompletionKind;
  stats: {
    activeSeconds: number;
    distanceMeters: number;
    steps: number;
  };
  distanceUnit: 'km' | 'mi';
  actionLabel?: string;
  onAction?: () => void;
}

const formatClock = (seconds: number): string => {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = String(clamped % 60).padStart(2, '0');
  return `${mins} min ${secs} sec`;
};

const formatDistance = (distanceMeters: number, distanceUnit: 'km' | 'mi'): string => {
  if (distanceUnit === 'km') {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }
  return `${(distanceMeters / 1609.34).toFixed(2)} mi`;
};

export const WalkCompletionSummary: React.FC<WalkCompletionSummaryProps> = ({
  themeMode,
  palette,
  kind = 'completed',
  stats,
  distanceUnit,
  actionLabel,
  onAction,
}) => {
  const savedForLater = kind === 'saved_later';
  const accentColor = savedForLater ? '#38bdf8' : palette.accentPrimary;
  const title = savedForLater ? 'Progress saved for later' : 'Walk recorded';
  const subtitle = savedForLater
    ? 'Your progress is tucked away. Pick it back up whenever you are ready for the next stretch.'
    : 'Nice work. That session is safely logged and ready to count toward today.';
  const heroBorderColor = savedForLater
    ? 'rgba(56,189,248,0.28)'
    : (themeMode === 'dark' ? 'rgba(46,233,166,0.28)' : 'rgba(5,150,105,0.24)');
  const heroBackgroundColor = themeMode === 'dark'
    ? (savedForLater ? 'rgba(56,189,248,0.12)' : 'rgba(46,233,166,0.12)')
    : (savedForLater ? 'rgba(56,189,248,0.12)' : 'rgba(16,185,129,0.14)');
  const heroInnerBackgroundColor = themeMode === 'dark'
    ? 'rgba(3,12,24,0.72)'
    : 'rgba(255,255,255,0.92)';
  const heroIconName = savedForLater ? 'bookmark' : 'checkmark-circle';

  const statItems = [
    {
      icon: savedForLater ? 'time-outline' : 'timer-outline',
      label: 'Active time',
      value: formatClock(stats.activeSeconds),
    },
    {
      icon: savedForLater ? 'walk' : 'navigate-outline',
      label: 'Distance',
      value: formatDistance(stats.distanceMeters, distanceUnit),
    },
    {
      icon: savedForLater ? 'bookmark' : 'footsteps',
      label: 'Steps',
      value: stats.steps.toLocaleString(),
    },
  ] as const;

  return (
    <View style={styles.root}>
      <View style={styles.heroWrap}>
        <View
          style={[
            styles.heroBadgeOuter,
            {
              backgroundColor: heroBackgroundColor,
              borderColor: heroBorderColor,
            },
          ]}
        >
          <View style={[styles.heroBadgeInner, { backgroundColor: heroInnerBackgroundColor, borderColor: heroBorderColor }]}>
            <Ionicons
              name={heroIconName}
              size={46}
              color={accentColor}
            />
          </View>
        </View>
      </View>

      <Text variant="title" style={styles.title}>
        {title}
      </Text>
      <Text variant="body" color={palette.textMuted} style={styles.body}>
        {subtitle}
      </Text>

      <View style={styles.statsRow}>
        {statItems.map((item) => (
          <View
            key={item.label}
            style={[
              styles.statChip,
              {
                backgroundColor: palette.bgSurface,
                borderColor: palette.borderSoft,
              },
            ]}
          >
            <Ionicons name={item.icon} size={16} color={accentColor} />
            <Text variant="bodySmall" color={palette.textMuted}>
              {item.label}
            </Text>
            <Text variant="body" style={styles.statValue}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>

      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} style={styles.button} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
  },
  heroWrap: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeOuter: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  statsRow: {
    width: '100%',
    gap: 12,
  },
  statChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  statValue: {
    fontWeight: '700',
  },
  button: {
    marginTop: 20,
    alignSelf: 'stretch',
  },
});
