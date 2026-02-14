import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduleOverview'>;

export const ScheduleOverviewScreen: React.FC<Props> = ({ navigation }) => {
  const { scheduleSource, setScheduleSource } = useAppStore();

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const load = async () => {
        const latest = await scheduleSourceRepo.get();
        if (!active) return;
        setScheduleSource(latest);
      };
      void load();
      return () => {
        active = false;
      };
    }, [setScheduleSource])
  );

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

  const openSourceSetup = () => {
    navigation.navigate('ScheduleSetup', { manageMode: true });
  };

  const updateCurrentSchedule = () => {
    if (scheduleSource?.type === 'manual' || !scheduleSource) {
      navigation.navigate('ManualSchedule', { manageMode: true });
      return;
    }
    if (scheduleSource.type === 'ics') {
      navigation.navigate('ManualSchedule', {
        manageMode: true,
        importedFilename: scheduleSource.filename,
      });
      return;
    }
    navigation.navigate('ScheduleSetup', { manageMode: true });
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.8}>
            <Text variant="bodySmall" style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

        <Text variant="title" style={styles.title}>Manage Schedule</Text>
        <Text variant="muted" style={styles.sub}>
          Change your schedule source or update your current schedule without repeating onboarding.
        </Text>

        <Card elevated style={styles.card}>
          <Text variant="bodySmall" style={styles.label}>Current source</Text>
          {scheduleSource?.type === 'ics' && !!scheduleSource.filename ? (
            <Text variant="body" style={styles.current}>
              File:{' '}
              <Text variant="body" style={styles.fileName}>
                {scheduleSource.filename}
              </Text>
            </Text>
          ) : (
            <Text variant="body" style={styles.current}>{sourceLabel}</Text>
          )}
        </Card>

        <Card elevated style={[styles.card, styles.guideCard]}>
          <Text variant="body" style={styles.guideHeading}>How This Works</Text>
          <Text variant="bodySmall" style={styles.guideSub}>
            Choose an action below. Your schedule updates are applied only after you save.
          </Text>

          <View style={styles.guideList}>
            <View style={styles.guideItem}>
              <View style={styles.guideIndex}>
                <Text variant="bodySmall" style={styles.guideIndexText}>1</Text>
              </View>
              <View style={styles.guideItemTextWrap}>
                <Text variant="bodySmall" style={styles.guideItemTitle}>Change Schedule Source</Text>
                <Text variant="bodySmall" style={styles.guideItemDesc}>
                  Switch how GapWalk reads your schedule, such as manual entry or calendar import.
                </Text>
              </View>
            </View>

            <View style={styles.guideItem}>
              <View style={styles.guideIndex}>
                <Text variant="bodySmall" style={styles.guideIndexText}>2</Text>
              </View>
              <View style={styles.guideItemTextWrap}>
                <Text variant="bodySmall" style={styles.guideItemTitle}>Update and Sync Opportunities</Text>
                <Text variant="bodySmall" style={styles.guideItemDesc}>
                  Save your changes to refresh today's walking opportunities automatically.
                </Text>
              </View>
            </View>
          </View>

          <Text variant="bodySmall" style={styles.guideNote}>
            Tip: If you open this screen and make no changes, you can cancel safely.
          </Text>
        </Card>

        <View style={styles.actions}>
          <Button
            title="Change schedule source"
            onPress={openSourceSetup}
            full
            style={styles.actionBtn}
          />
          <Button
            title={scheduleSource?.type === 'manual' || !scheduleSource ? 'Update current schedule' : 'Update imported schedule'}
            onPress={updateCurrentSchedule}
            full
            variant="secondary"
            style={styles.actionBtn}
          />
          <Button
            title="Cancel"
            onPress={handleBack}
            full
            variant="muted"
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
  fileName: { color: theme.colors.accentPrimary, fontWeight: theme.fontWeight.semibold },
  guideCard: { paddingVertical: 16 },
  guideHeading: { fontWeight: theme.fontWeight.semibold, marginBottom: 6 },
  guideSub: { color: theme.colors.textMuted, marginBottom: 12, lineHeight: 18 },
  guideList: { gap: 10 },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(46,233,166,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(46,233,166,0.18)',
  },
  guideIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46,233,166,0.16)',
    marginTop: 1,
  },
  guideIndexText: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.xs,
  },
  guideItemTextWrap: { flex: 1 },
  guideItemTitle: { fontWeight: theme.fontWeight.semibold, marginBottom: 2 },
  guideItemDesc: { color: theme.colors.textMuted, lineHeight: 18 },
  guideNote: { marginTop: 12, color: theme.colors.textMuted, fontStyle: 'italic' },
  actions: { marginTop: 12, gap: 10 },
  actionBtn: { },
});

