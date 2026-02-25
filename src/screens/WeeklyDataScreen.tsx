import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { ScreenHeader } from '../components/ScreenHeader';
import { Card } from '../components/Card';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { TwoActionBar } from '../components/TwoActionBar';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import {
  calculateWeeklyHistory,
  WeeklyHistoryEntry,
} from '../lib/statsUtils';
import { toUserFriendlyError } from '../lib/errorMessages';

type Props = NativeStackScreenProps<RootStackParamList, 'WeeklyData'>;

/* ------------------------------------------------------------------ */
/*  Screen                                                            */
/* ------------------------------------------------------------------ */
export const WeeklyDataScreen: React.FC<Props> = ({ navigation }) => {
  const { language } = useAppStore();
  const palette = useThemePalette();
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const sessions = await sessionsRepo.getAll();
      setWeeklyHistory(calculateWeeklyHistory(sessions));
    } catch (e) {
      setLoadError(toUserFriendlyError(e));
      setWeeklyHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleDone = () => {
    navigation.navigate('Dashboard');
  };

  const locale = language === 'es' ? 'es-ES' : 'en-US';
  const accentPrimary = palette.accentPrimary;
  const textMuted = palette.textMuted;

  /* ---- Compute a trend comparison for the top-most (most recent) week ---- */
  const trendInfo = useMemo(() => {
    if (weeklyHistory.length < 2) return null;
    const current = weeklyHistory[0].totalMinutes;
    const previous = weeklyHistory[1].totalMinutes;
    if (previous === 0) return null;
    const pct = Math.round(((current - previous) / previous) * 100);
    return { pct, direction: pct >= 0 ? ('up' as const) : ('down' as const) };
  }, [weeklyHistory]);

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="Weekly Data"
          subtitle="Review your weekly walking totals and trends."
        />

        {loading ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyBody}>
              Loading\u2026
            </Text>
          </Card>
        ) : loadError ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyTitle}>
              Could not load data
            </Text>
            <Text variant="bodySmall" style={styles.emptyBody}>
              {loadError}
            </Text>
            <Button
              title="Try again"
              onPress={() => void load()}
              variant="outline"
              style={styles.retryBtn}
            />
          </Card>
        ) : weeklyHistory.length === 0 ? (
          <Card elevated style={styles.emptyCard}>
            <Ionicons
              name="walk-outline"
              size={36}
              color={textMuted}
              style={{ marginBottom: 10 }}
            />
            <Text variant="body" style={styles.emptyTitle}>
              No weekly data yet
            </Text>
            <Text variant="bodySmall" style={styles.emptyBody}>
              Complete a walk to start building weekly history.
            </Text>
          </Card>
        ) : (
          weeklyHistory.map((week, idx) => {
            const start = parseISO(week.weekStart).toLocaleDateString(locale, {
              month: 'short',
              day: 'numeric',
            });
            const end = parseISO(week.weekEnd).toLocaleDateString(locale, {
              month: 'short',
              day: 'numeric',
            });
            const isLatest = idx === 0;

            return (
              <Card
                key={week.weekStart}
                elevated
                style={[styles.weekCard, isLatest && [styles.latestWeekCard, { borderColor: palette.accentBorder }]]}
              >
                {/* Header row */}
                <View style={styles.weekHeader}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={styles.weekMeta}>
                      {isLatest ? 'This Week' : 'Week of'}
                    </Text>
                    <Text variant="body" style={styles.weekRange}>
                      {start} – {end}
                    </Text>
                  </View>

                  {isLatest && trendInfo && (
                    <View
                      style={[
                        styles.trendBadge,
                        {
                          backgroundColor:
                            trendInfo.direction === 'up'
                              ? palette.accentMuted
                              : 'rgba(251,146,60,0.12)',
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          trendInfo.direction === 'up'
                            ? 'trending-up'
                            : 'trending-down'
                        }
                        size={14}
                        color={
                          trendInfo.direction === 'up'
                            ? accentPrimary
                            : palette.trendDown
                        }
                      />
                      <Text
                        variant="bodySmall"
                        style={{
                          marginLeft: 4,
                          fontWeight: '600',
                          color:
                            trendInfo.direction === 'up'
                              ? accentPrimary
                              : palette.trendDown,
                        }}
                      >
                        {Math.abs(trendInfo.pct)}%
                      </Text>
                    </View>
                  )}
                </View>

                {/* Stats grid */}
                <View style={styles.grid}>
                  <View style={styles.gridItem}>
                    <Text variant="title" style={[styles.value, { color: accentPrimary }]}>
                      {week.totalMinutes}
                    </Text>
                    <Text variant="bodySmall" style={styles.label}>
                      Minutes
                    </Text>
                  </View>

                  <View style={[styles.divider, { backgroundColor: textMuted }]} />

                  <View style={styles.gridItem}>
                    <Text variant="title" style={[styles.value, { color: accentPrimary }]}>
                      {week.totalSteps.toLocaleString(locale)}
                    </Text>
                    <Text variant="bodySmall" style={styles.label}>
                      Steps
                    </Text>
                  </View>

                  <View style={[styles.divider, { backgroundColor: textMuted }]} />

                  <View style={styles.gridItem}>
                    <Text variant="title" style={[styles.value, { color: accentPrimary }]}>
                      {week.daysActive}
                      <Text
                        variant="bodySmall"
                        style={{ color: textMuted }}
                      >
                        /7
                      </Text>
                    </Text>
                    <Text variant="bodySmall" style={styles.label}>
                      Active Days
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })
        )}

        <TwoActionBar
          style={styles.footer}
          primaryAction={{
            title: 'Done',
            onPress: handleDone,
            testID: 'weekly-data-done',
          }}
        />
      </View>
    </Container>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 8,
  },
  emptyBody: {
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
  },
  /* --- Week card --- */
  weekCard: {
    marginBottom: 16,
  },
  latestWeekCard: {
    borderWidth: 1,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  weekMeta: {
    marginBottom: 2,
  },
  weekRange: {
    fontWeight: theme.fontWeight.semibold,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  /* --- Stats grid --- */
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    fontWeight: theme.fontWeight.bold,
  },
  label: {
    textAlign: 'center',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 32,
    opacity: 0.18,
  },
  footer: {
    marginTop: theme.spacing.sm,
  },
});
