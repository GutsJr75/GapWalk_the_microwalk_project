import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { theme } from '../theme';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduleOverview'>;

export const ScheduleOverviewScreen: React.FC<Props> = ({ navigation }) => {
  const { scheduleSource } = useAppStore();

  const sourceLabel = !scheduleSource
    ? 'Not set yet'
    : scheduleSource.type === 'manual'
    ? 'Manual schedule'
    : scheduleSource.type === 'google'
    ? 'Google Calendar'
    : 'Calendar file (.ics)';

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard');
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.8}>
            <Text variant="bodySmall" style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

        <Text variant="title" style={styles.title}>Your Schedule</Text>
        <Text variant="muted" style={styles.sub}>
          See how GapWalk is reading your schedule, and change it anytime.
        </Text>

        <Card elevated style={styles.card}>
          <Text variant="bodySmall" style={styles.label}>Current source</Text>
          <Text variant="body" style={styles.current}>{sourceLabel}</Text>
        </Card>

        <Card elevated style={styles.card}>
          <Text variant="bodySmall" style={styles.label}>What you can do</Text>
          <Text variant="bodySmall" style={styles.bodyText}>
            - Change how GapWalk reads your schedule (manual, calendar file, or Google Calendar).
          </Text>
          <Text variant="bodySmall" style={styles.bodyText}>
            - Update the blocks in your manual schedule so gaps stay accurate.
          </Text>
        </Card>

        <View style={styles.actions}>
          <Button
            title="Change schedule source"
            onPress={() => navigation.navigate('ScheduleSetup')}
            full
            style={styles.actionBtn}
          />
          <Button
            title="Edit manual schedule"
            onPress={() => navigation.navigate('ManualSchedule')}
            full
            variant="secondary"
            style={styles.actionBtn}
          />
        </View>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: 26,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  topRow: { width: '100%', marginBottom: theme.spacing.sm, alignItems: 'flex-start' },
  backBtn: { paddingVertical: 4, paddingHorizontal: 2, marginLeft: -32 },
  backText: { color: theme.colors.textMuted, fontWeight: theme.fontWeight.semibold },
  title: { marginBottom: 4, textAlign: 'center', fontSize: theme.fontSize.xl + 2 },
  sub: { marginBottom: 20, textAlign: 'center' },
  card: { marginBottom: 16 },
  label: { color: theme.colors.textMuted, marginBottom: 4 },
  current: { fontWeight: theme.fontWeight.semibold },
  bodyText: { marginTop: 4 },
  actions: { marginTop: 12, gap: 10 },
  actionBtn: { },
});

