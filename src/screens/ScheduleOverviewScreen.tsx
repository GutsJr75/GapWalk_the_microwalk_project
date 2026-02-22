import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduleOverview'>;

export const ScheduleOverviewScreen: React.FC<Props> = ({ navigation }) => {
  const { scheduleSource, setScheduleSource, themeMode } = useAppStore();
  const palette = useThemePalette();
  const isDark = themeMode === 'dark';
  const mintTextOnTint = isDark ? theme.colors.accentPrimary : '#0f5132';

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

  const guideItemStyle = {
    backgroundColor: isDark ? 'rgba(46,233,166,0.08)' : 'rgba(46,233,166,0.10)',
    borderColor: isDark ? 'rgba(46,233,166,0.22)' : 'rgba(46,233,166,0.28)',
  };
  const guideIndexStyle = {
    backgroundColor: isDark ? 'rgba(46,233,166,0.16)' : 'rgba(46,233,166,0.20)',
  };

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
        <ScreenHeader
          title="Manage your schedule"
          subtitle="Change your schedule source or update your current schedule without repeating onboarding."
          onBack={handleBack}
        />

        <Card elevated style={styles.card}>
          <View style={styles.labelRow}>
            <AppIcon name="calendar" size={14} color={palette.accentPrimary} />
            <Text variant="bodySmall" style={[styles.label, { color: palette.textMuted }]}>Current source</Text>
          </View>
          {scheduleSource?.type === 'ics' && !!scheduleSource.filename ? (
            <Text variant="body" style={styles.current}>
              File:{' '}
              <Text variant="body" style={[styles.fileName, { color: palette.accentPrimary }]}>
                {scheduleSource.filename}
              </Text>
            </Text>
          ) : (
            <Text variant="body" style={styles.current}>{sourceLabel}</Text>
          )}
        </Card>

        <Card elevated style={[styles.card, styles.guideCard]}>
          <View style={styles.labelRow}>
            <AppIcon name="adjust" size={14} color={palette.accentPrimary} />
            <Text variant="body" style={styles.guideHeading}>How it works</Text>
          </View>
          <Text variant="bodySmall" style={[styles.guideSub, { color: palette.textMuted }]}>
            Choose an action below. Your schedule updates are applied only after you save.
          </Text>

          <View style={styles.guideList}>
            <View style={[styles.guideItem, guideItemStyle]}>
              <View style={[styles.guideIndex, guideIndexStyle]}>
                <AppIcon name="calendar" size={14} color={mintTextOnTint} />
              </View>
              <View style={styles.guideItemTextWrap}>
                <Text variant="bodySmall" style={styles.guideItemTitle}>Change schedule source</Text>
                <Text variant="bodySmall" style={[styles.guideItemDesc, { color: palette.textMuted }]}>
                  Switch how GapWalk reads your schedule, such as manual entry or calendar import.
                </Text>
              </View>
            </View>

            <View style={[styles.guideItem, guideItemStyle]}>
              <View style={[styles.guideIndex, guideIndexStyle]}>
                <AppIcon name="sync" size={14} color={mintTextOnTint} />
              </View>
              <View style={styles.guideItemTextWrap}>
                <Text variant="bodySmall" style={styles.guideItemTitle}>Update and sync opportunities</Text>
                <Text variant="bodySmall" style={[styles.guideItemDesc, { color: palette.textMuted }]}>
                  Save your changes to refresh today's walking opportunities automatically.
                </Text>
              </View>
            </View>
          </View>

          <Text variant="bodySmall" style={[styles.guideNote, { color: palette.textMuted }]}>
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
    paddingTop: theme.spacing.lg,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  card: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  label: {},
  current: { fontWeight: theme.fontWeight.semibold },
  fileName: { fontWeight: theme.fontWeight.semibold },
  guideCard: { paddingVertical: 16 },
  guideHeading: { fontWeight: theme.fontWeight.semibold, marginBottom: 6 },
  guideSub: { marginBottom: 12, lineHeight: 18 },
  guideList: { gap: 10 },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  guideIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  guideItemTextWrap: { flex: 1 },
  guideItemTitle: { fontWeight: theme.fontWeight.semibold, marginBottom: 2 },
  guideItemDesc: { lineHeight: 18 },
  guideNote: { marginTop: 12, fontStyle: 'italic' },
  actions: { marginTop: 12, gap: 10 },
  actionBtn: { },
});
