import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { parseISO } from 'date-fns';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { ScreenHeader } from '../components/ScreenHeader';
import { Card } from '../components/Card';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import { calculateWeeklyHistory, WeeklyHistoryEntry } from '../lib/statsUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'WeeklyData'>;

export const WeeklyDataScreen: React.FC<Props> = ({ navigation }) => {
  const { language } = useAppStore();
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
      setLoadError(e instanceof Error ? e.message : 'Failed to load weekly data');
      setWeeklyHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard');
  };

  const locale = language === 'es' ? 'es-ES' : 'en-US';

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="Weekly Data"
          subtitle="Review your weekly walking totals and trends."
          onBack={handleBack}
          backTestID="weekly-data-back"
        />

        {loading ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyBody}>Loading…</Text>
          </Card>
        ) : loadError ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyTitle}>Could not load data</Text>
            <Text variant="bodySmall" style={styles.emptyBody}>{loadError}</Text>
            <Button title="Try again" onPress={() => void load()} variant="outline" style={styles.retryBtn} />
          </Card>
        ) : weeklyHistory.length === 0 ? (
          <Card elevated style={styles.emptyCard}>
            <Text variant="body" style={styles.emptyTitle}>No weekly data yet</Text>
            <Text variant="bodySmall" style={styles.emptyBody}>
              Complete a walk to start building weekly history.
            </Text>
          </Card>
        ) : (
          weeklyHistory.map((week) => {
            const start = parseISO(week.weekStart).toLocaleDateString(locale, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const end = parseISO(week.weekEnd).toLocaleDateString(locale, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <Card key={week.weekStart} elevated style={styles.weekCard}>
                <Text variant="bodySmall" style={styles.weekMeta}>Week of</Text>
                <Text variant="body" style={styles.weekRange}>{start} - {end}</Text>

                <View style={styles.grid}>
                  <View style={styles.gridItem}>
                    <Text variant="title" style={styles.value}>{week.totalMinutes}</Text>
                    <Text variant="bodySmall" style={styles.label}>Minutes</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text variant="title" style={styles.value}>{week.totalSteps.toLocaleString(locale)}</Text>
                    <Text variant="bodySmall" style={styles.label}>Total Steps</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text variant="title" style={styles.value}>{week.daysActive}</Text>
                    <Text variant="bodySmall" style={styles.label}>Active Days</Text>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </View>
    </Container>
  );
};

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
    color: theme.colors.textMuted,
  },
  retryBtn: {
    marginTop: 16,
  },
  weekCard: {
    marginBottom: 14,
  },
  weekMeta: {
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  weekRange: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 4,
    color: theme.colors.accentPrimary,
  },
  label: {
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
