import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
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
import { ScreenState } from '../components/ScreenState';
import { TwoActionBar } from '../components/TwoActionBar';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { guidanceStorage } from '../data/guidanceStorage';
import {
  calculateWeeklyHistory,
  WeeklyHistoryEntry,
} from '../utils/statsUtils';
import { toUserFriendlyError } from '../utils/errorMessages';

type Props = NativeStackScreenProps<RootStackParamList, 'WeeklyData'>;

/* ------------------------------------------------------------------ */
/*  Screen                                                            */
/* ------------------------------------------------------------------ */
export const WeeklyDataScreen: React.FC<Props> = ({ navigation }) => {
  const { language, guidanceSeen = {}, setGuidanceSeen } = useAppStore();
  const palette = useThemePalette();
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dismissHint = useCallback(() => {
    setGuidanceSeen('weekly_data_hint', true);
    void guidanceStorage.markSeen('weekly_data_hint');
  }, [setGuidanceSeen]);

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

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard');
  };

  const locale = language === 'es' ? 'es-ES' : 'en-US';
  const accentPrimary = palette.accentPrimary;
  const textMuted = palette.textMuted;

  /* ---- Compute a trend comparison for the top-most (most recent) week ---- */
  const maxMinutes = useMemo(
    () => Math.max(1, ...weeklyHistory.map((w) => w.totalMinutes)),
    [weeklyHistory],
  );

  const bestWeekIdx = useMemo(() => {
    if (weeklyHistory.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < weeklyHistory.length; i++) {
      if (weeklyHistory[i].totalMinutes > weeklyHistory[best].totalMinutes) best = i;
    }
    return best;
  }, [weeklyHistory]);

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
          onBack={handleBack}
        />

        {!guidanceSeen.weekly_data_hint && (
          <Card elevated style={styles.hintCard}>
            <Ionicons name="information-circle-outline" size={20} color={palette.accentPrimary} />
            <Text variant="bodySmall" color={palette.textMuted} style={styles.hintText}>
              This screen tracks your walking trends week by week. Complete walks to start building your history.
            </Text>
            <Button title="Got it" onPress={dismissHint} variant="outline" style={styles.hintDismiss} />
          </Card>
        )}

        {loading ? (
          <ScreenState variant="loading" title="Loading weekly data…" />
        ) : loadError ? (
          <ScreenState
            variant="error"
            title="Could not load data"
            subtitle={loadError}
            onRetry={() => void load()}
          />
        ) : weeklyHistory.length === 0 ? (
          <ScreenState
            variant="empty"
            title="No weekly data yet"
            subtitle="Complete a walk to start building weekly history."
            icon="walk-outline"
          />
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
                accentBorder={idx === bestWeekIdx}
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

                {/* Minutes bar */}
                <View style={[styles.minuteBarTrack, { backgroundColor: palette.borderSoft }]}>
                  <View
                    style={[
                      styles.minuteBarFill,
                      {
                        backgroundColor: palette.accentPrimary,
                        width: `${Math.round((week.totalMinutes / maxMinutes) * 100)}%`,
                      },
                    ]}
                  />
                </View>

                {idx === bestWeekIdx && weeklyHistory.length > 1 && (
                  <View style={[styles.bestBadge, { backgroundColor: palette.accentMuted }]}>
                    <Text variant="bodySmall" style={[styles.bestBadgeText, { color: palette.accentPrimary }]}>
                      Best Week 🏆
                    </Text>
                  </View>
                )}

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

      </View>

      <View style={styles.footer}>
        <TwoActionBar
          primaryAction={{
            title: 'Done',
            onPress: handleBack,
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
    paddingTop: screenChrome.TITLE_CONTENT_TOP_PADDING,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  hintCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  hintText: {
    flex: 1,
    lineHeight: 20,
  },
  hintDismiss: {
    alignSelf: 'flex-end',
    marginTop: 4,
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
  minuteBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  minuteBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  bestBadge: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 8,
  },
  bestBadgeText: {
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.xs,
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
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
});
