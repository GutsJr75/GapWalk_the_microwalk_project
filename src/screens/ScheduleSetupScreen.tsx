import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { AppIcon } from '../components/AppIcon';
import { ScreenHeader } from '../components/ScreenHeader';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { useThemePalette } from '../theme/palette';
import { buildWeeklyTemplateFromIcsEvents, parseICSFile } from '../utils/ics';
import { ManualScheduleEntry } from '../types';
import { eventsRepo } from '../data/repositories/eventsRepo';
import { manualScheduleRepo } from '../data/repositories/manualScheduleRepo';
import { plansRepo } from '../data/repositories/plansRepo';
import { scheduleSourceRepo } from '../data/repositories/scheduleSourceRepo';
import { syncNudgePlansForCurrentSchedule } from '../services/scheduleSync';
import {
  SAVE_CONFIRM_DECLINE,
  SAVE_CONFIRM_MESSAGE,
} from '../utils/confirmMessages';
import { analyticsService } from '../services/analytics';
import { useAppStore } from '../store';
import {
  googleCalendarService,
  signInWithGoogle,
  isSignInCancelled,
  getGoogleConfigurationError,
  isGoogleConfigured,
} from '../services/googleCalendar';
import { toUserFriendlyError } from '../utils/errorMessages';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduleSetup'>;
type ScheduleOption = 'google' | 'import' | 'manual' | null;
type DialogAction = {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'muted' | 'danger' | 'info';
  onPress?: () => void;
};

type DialogState = {
  title: string;
  message: string;
  actions: DialogAction[];
};

const isFabric = !!(globalThis as any).nativeFabricUIManager;

if (Platform.OS === 'android' && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}



const ScheduleSetupScreenInner: React.FC<Props> = ({ navigation, route }) => {
  const [selectedOption, setSelectedOption] = useState<ScheduleOption>(null);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const { setScheduleSource, scheduleSource, preferences, setUpcomingPlans } = useAppStore();
  const palette = useThemePalette();
  const manageMode = !!route.params?.manageMode;
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';

  const closeDialog = () => setDialogState(null);
  const showDialog = (title: string, message: string, actions: DialogAction[]) => {
    setDialogState({ title, message, actions });
  };

  const exitScreen = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard', { openMenu: true });
  };

  const navigateToManualSchedule = async () => {
    if (manageMode) {
      // Clear imported events when switching to manual
      await eventsRepo.deleteBySource('ics');
      await eventsRepo.deleteBySource('google');
      navigation.navigate('ManualSchedule', { manageMode: true, startWithEmpty: true });
      return;
    }
    navigation.navigate('ManualSchedule', {
      startWithEmpty: true,
      requireSaveBeforeContinue: true,
    });
  };

  const finishAfterSave = async () => {
    try {
      await syncNudgePlansForCurrentSchedule(preferences);
      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
    } catch (error) {
      if (__DEV__) console.error('Failed to sync opportunities after schedule update:', error);
    }
  };

  const completeFlow = () => {
    if (manageMode) {
      exitScreen();
      return;
    }
    navigation.navigate('Preferences', {});
  };

  const handleSetUpLater = async () => {
    if (loading || manageMode) return;

    analyticsService.track('schedule_setup_deferred', {
      existingSourceType: scheduleSource?.type ?? 'none',
    });

    try {
      if (!scheduleSource) {
        const deferredSource = {
          type: 'manual' as const,
          lastImportedAt: new Date().toISOString(),
        };
        await scheduleSourceRepo.save(deferredSource);
        setScheduleSource(deferredSource);
      }

      completeFlow();
    } catch (error) {
      if (__DEV__) console.error('Failed to defer schedule setup:', error);
      showMessage('Could not continue', toUserFriendlyError(error));
    }
  };

  const showMessage = (title: string, message: string, onAcknowledge?: () => void) => {
    if (Platform.OS === 'web' && typeof (globalThis as any).alert === 'function') {
      (globalThis as any).alert(`${title}\n\n${message}`);
      onAcknowledge?.();
      return;
    }
    showDialog(title, message, [{ label: 'OK', onPress: onAcknowledge }]);
  };


  useEffect(() => {
    if (!manageMode || !scheduleSource) return;
    if (scheduleSource.type === 'manual') {
      setSelectedOption('manual');
    } else if (scheduleSource.type === 'ics') {
      setSelectedOption('import');
    } else if (scheduleSource.type === 'google') {
      setSelectedOption('google');
    }
  }, [manageMode, scheduleSource]);

  const toggle = (opt: ScheduleOption) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedOption(selectedOption === opt ? null : opt);
  };

  /* ── Google Calendar sync ── */
  const handleGoogleSync = async (accessToken: string) => {
    try {
      setLoading(true);
      setSyncStatus('Fetching your calendar events...');

      const events = await googleCalendarService.fetchEvents(accessToken, 14);

      if (events.length === 0) {
        showDialog(
          'No Events Found',
          'Your Google Calendar has no events in the next 14 days. You can add events manually instead.',
          [
            {
              label: 'Enter manually',
              variant: 'secondary',
              onPress: () => {
                setLoading(false);
                setSyncStatus(null);
                navigateToManualSchedule();
              },
            },
            {
              label: 'OK',
              onPress: () => {
                setLoading(false);
                setSyncStatus(null);
              },
            },
          ]
        );
        return;
      }

      const weeklyTemplate: ManualScheduleEntry[] = buildWeeklyTemplateFromIcsEvents(events, 'gcal');
      setSyncStatus(`Saving ${events.length} events...`);

      // Persist the derived weekly template so Manage Schedule can render the
      // imported Google schedule immediately after onboarding.
      await manualScheduleRepo.replaceAll(weeklyTemplate);

      // Atomically replace all existing busy events (rolls back on failure).
      await eventsRepo.replaceAll(events);

      // Save schedule source metadata.
      const source = {
        type: 'google' as const,
        lastImportedAt: new Date().toISOString(),
        googleConnected: true,
      };
      await scheduleSourceRepo.save(source);
      setScheduleSource(source);
      await finishAfterSave();

      setSyncStatus(null);
      setLoading(false);

      showDialog(
        manageMode ? 'Schedule Updated' : 'Calendar Linked',
        `Imported ${events.length} events from Google Calendar.`,
        [{ label: manageMode ? 'Done' : 'Continue', onPress: completeFlow }]
      );
    } catch (error) {
      if (__DEV__) console.error('Google Calendar sync error:', error);
      const msg = toUserFriendlyError(error);
      setLoading(false);
      setSyncStatus(null);
      showMessage('Sync failed', msg);
    }
  };

  const startGoogleAuth = async () => {
    const configError = getGoogleConfigurationError();
    if (configError || !isGoogleConfigured()) {
      showMessage('Google Calendar', configError ?? 'Google Calendar is not configured.');
      return;
    }
    setLoading(true);
    setSyncStatus('Opening Google sign-in...');
    try {
      const accessToken = await signInWithGoogle();
      await handleGoogleSync(accessToken);
    } catch (error) {
      if (isSignInCancelled(error)) {
        setLoading(false);
        setSyncStatus(null);
        return;
      }
      setLoading(false);
      setSyncStatus(null);
      const msg = toUserFriendlyError(error);
      showMessage('Sign-in Failed', msg);
    }
  };

  /* ── ICS import ── */
  const handleImport = async () => {
    try {
      setLoading(true);
      setSyncStatus('Opening file picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/calendar', 'application/octet-stream', '.ics', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setLoading(false);
        setSyncStatus(null);
        return;
      }
      const file = result.assets[0];
      setSyncStatus(`Reading ${file.name || 'calendar file'}...`);

      let content = '';
      const webFile = (file as any).file;
      if (Platform.OS === 'web' && webFile && typeof webFile.text === 'function') {
        content = await webFile.text();
      } else {
        const resp = await fetch(file.uri);
        if (!resp.ok) {
          throw new Error(`Could not read selected file (${resp.status}).`);
        }
        content = await resp.text();
      }

      if (!content.trim()) {
        throw new Error('The selected calendar file is empty.');
      }

      setSyncStatus('Parsing calendar...');
      const parseResult = await parseICSFile(content);
      if (parseResult.errors.length > 0) {
        const warningText = parseResult.errors
          .slice(0, 3)
          .map((e) => toUserFriendlyError(new Error(e)))
          .join('\n');
        showMessage('Import Warning', warningText);
      }
      if (parseResult.events.length === 0) {
        setLoading(false);
        setSyncStatus(null);
        showMessage('No Events', 'No events found in the calendar file.');
        return;
      }

      setSyncStatus('Preparing weekly grid preview...');
      const weeklyTemplate: ManualScheduleEntry[] = buildWeeklyTemplateFromIcsEvents(parseResult.events);
      analyticsService.track('ics_import_parsed', {
        filename: file.name || 'calendar.ics',
        eventsParsed: parseResult.events.length,
        weeklyTemplateEntries: weeklyTemplate.length,
      });
      if (weeklyTemplate.length === 0) {
        showMessage(
          'Import Note',
          'The calendar file was imported, but no timed events were available for the weekly grid preview.'
        );
      }
      setLoading(false);
      setSyncStatus(null);
      navigation.navigate('ManualSchedule', {
        ...(manageMode ? { manageMode: true } : { requireSaveBeforeContinue: true }),
        importedFilename: file.name || 'calendar.ics',
        importedEventCount: parseResult.events.length,
        prefillTemplate: weeklyTemplate,
      });
    } catch (error) {
      if (__DEV__) console.error('ICS import failed:', error);
      setLoading(false);
      setSyncStatus(null);
      const msg = toUserFriendlyError(error);
      showMessage('Import Failed', msg);
    }
  };

  const handleE2ESampleImport = async () => {
    try {
      setLoading(true);
      setSyncStatus('Loading sample calendar...');
      const sampleIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GapWalk//E2E Sample//EN',
        'BEGIN:VEVENT',
        'UID:e2e-1',
        'DTSTAMP:20260101T080000Z',
        'DTSTART:20260106T090000Z',
        'DTEND:20260106T103000Z',
        'SUMMARY:E2E Sample Meeting',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:e2e-2',
        'DTSTAMP:20260101T080000Z',
        'DTSTART:20260107T140000Z',
        'DTEND:20260107T150000Z',
        'SUMMARY:E2E Sample Class',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n');

      const parseResult = await parseICSFile(sampleIcs);
      const weeklyTemplate: ManualScheduleEntry[] = buildWeeklyTemplateFromIcsEvents(parseResult.events);
      analyticsService.track('ics_import_parsed', {
        filename: 'sample-e2e.ics',
        eventsParsed: parseResult.events.length,
        weeklyTemplateEntries: weeklyTemplate.length,
        source: 'e2e_sample',
      });
      setLoading(false);
      setSyncStatus(null);

      navigation.navigate('ManualSchedule', {
        ...(manageMode ? { manageMode: true } : { requireSaveBeforeContinue: true }),
        importedFilename: 'sample-e2e.ics',
        importedEventCount: parseResult.events.length,
        prefillTemplate: weeklyTemplate,
      });
    } catch (error) {
      if (__DEV__) console.error('E2E sample import failed:', error);
      setLoading(false);
      setSyncStatus(null);
      showMessage('Import Failed', 'The sample calendar could not be loaded. Please try again.');
    }
  };

  /* ── Next ── */
  const runSelectedOption = async () => {
    if (!selectedOption) return;
    if (selectedOption === 'google') {
      analyticsService.track('schedule_source_selected', { source: 'google', manageMode });
      await startGoogleAuth();
    }
    else if (selectedOption === 'import') {
      analyticsService.track('schedule_source_selected', { source: 'import', manageMode });
      await handleImport();
    } else {
      analyticsService.track('schedule_source_selected', { source: 'manual', manageMode });
      navigateToManualSchedule();
    }
  };

  const selectionMatchesCurrent = (option: ScheduleOption): boolean => {
    const currentSourceType = scheduleSource?.type;
    return (
      (option === 'manual' && currentSourceType === 'manual') ||
      (option === 'import' && currentSourceType === 'ics') ||
      (option === 'google' && currentSourceType === 'google')
    );
  };

  const hasUnsavedSourceSelection =
    !!manageMode && !!selectedOption && !selectionMatchesCurrent(selectedOption);

  useUnsavedChangesGuard({
    navigation,
    enabled: hasUnsavedSourceSelection,
    title: 'Leave without saving source change?',
    message: 'You changed your schedule source but have not saved it yet. If you leave now, your change will be lost.',
    onRequestConfirm: ({ title, message, onLeave }) => {
      showDialog(title, message, [
        { label: 'Stay', variant: 'secondary' },
        { label: 'Leave', variant: 'danger', onPress: onLeave },
      ]);
    },
  });

  const handleContinue = () => {
    if (!selectedOption || loading) return;
    if (!manageMode) {
      void runSelectedOption();
      return;
    }

    const sameAsCurrent = selectionMatchesCurrent(selectedOption);

    if (sameAsCurrent) {
      const sourceLabel =
        scheduleSource?.type === 'manual'
          ? 'manual entry'
          : scheduleSource?.type === 'ics'
            ? 'calendar import'
            : 'Google Calendar';
      showMessage(
        'No changes to update',
        `Your schedule is already using ${sourceLabel}. Choose a different option if you want to switch, or tap Cancel to leave.`
      );
      return;
    }

    const message = SAVE_CONFIRM_MESSAGE;

    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(message);
      if (ok) {
        void runSelectedOption();
      }
      return;
    }

    showDialog(
      'Update schedule source?',
      message,
      [
        { label: SAVE_CONFIRM_DECLINE, variant: 'secondary' },
        { label: 'Yes, update', onPress: () => { void runSelectedOption(); } },
      ]
    );
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title={manageMode ? 'Manage your schedule' : 'Set up your schedule'}
          subtitle={
            manageMode
              ? 'Change your schedule source or update existing schedule data.'
              : 'Tell us when you are busy so GapWalk can find walking windows.'
          }
        />
        <Text variant="body" style={styles.sectionLabel}>
          {manageMode ? 'Choose how GapWalk should read your schedule' : 'Choose how to add your schedule'}
        </Text>

        {/* Google Calendar */}
        <Card
          selected={selectedOption === 'google'}
          onPress={() => toggle('google')}
          style={styles.googleCard}
          testID="schedule-option-google"
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <AppIcon name="google" size={15} color={theme.colors.accentPrimary} />
              <Text variant="body" style={styles.cardTitle}>Link Google Calendar</Text>
            </View>
            {scheduleSource?.type === 'google' && (
              <View style={[styles.recommendedBadge]}>
                <Text style={styles.recommendedText}>Active</Text>
              </View>
            )}
          </View>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.cardDesc}>
            Sign in with Google to detect your busy times and find the best walking windows.
          </Text>
          <Text variant="muted" style={styles.cardMicrocopy}>Reads event times from your primary calendar</Text>
        </Card>

        {/* Import & Manual – side by side */}
        <View style={styles.row}>
          <View style={styles.halfCard}>
            <Card
              selected={selectedOption === 'import'}
              onPress={() => toggle('import')}
              style={[styles.halfCardContent, selectedOption === 'import' && styles.selectedHalfCard]}
              testID="schedule-option-import"
            >
              <View style={styles.cardTitleRow}>
                <AppIcon name="calendar" size={15} color={palette.accentPrimary} />
                <Text variant="body" style={styles.cardTitle}>Import</Text>
              </View>
              <Text variant="bodySmall" color={palette.textMuted} style={styles.cardDesc}>
                Upload a .ics file so GapWalk can see when you're busy.
              </Text>
            </Card>
          </View>

          <View style={styles.halfCard}>
            <Card
              selected={selectedOption === 'manual'}
              onPress={() => toggle('manual')}
              style={[styles.halfCardContent, selectedOption === 'manual' && styles.selectedHalfCard]}
              testID="schedule-option-manual"
            >
              <View style={styles.cardTitleRow}>
                <AppIcon name="adjust" size={15} color={palette.accentPrimary} />
                <Text variant="body" style={styles.cardTitle}>Input manually</Text>
              </View>
              <Text variant="bodySmall" color={palette.textMuted} style={styles.cardDesc}>
                Build your weekly schedule and one-time events with a simple calendar.
              </Text>
            </Card>
          </View>
        </View>

        {/* Sync status overlay */}
        {loading && syncStatus && (
          <View style={[styles.syncOverlay, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}>
            <ActivityIndicator size="large" color={palette.accentPrimary} />
            <Text variant="body" style={styles.syncOverlayText}>{syncStatus}</Text>
          </View>
        )}

        {isE2E && !manageMode && (
          <Button
            title="Use sample import (E2E)"
            variant="muted"
            onPress={() => { void handleE2ESampleImport(); }}
            testID="e2e-sample-import-btn"
            style={styles.e2eBtn}
            disabled={loading}
          />
        )}
      </View>

      <View style={styles.footer}>
        {manageMode ? (
          <View style={styles.footerActions}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={exitScreen}
              style={styles.footerBtn}
              disabled={loading}
              testID="schedule-setup-cancel"
            />
            <Button
              title="Update"
              onPress={handleContinue}
              disabled={!selectedOption || loading}
              loading={loading && !syncStatus}
              style={styles.footerBtn}
              testID="schedule-setup-continue"
            />
          </View>
        ) : (
          <>
            <View style={styles.footerActions}>
              <Button
                title="Set it up later"
                variant="secondary"
                onPress={() => { void handleSetUpLater(); }}
                style={styles.footerBtn}
                disabled={loading}
                testID="schedule-setup-later"
              />
              <Button
                title="Next"
                onPress={handleContinue}
                disabled={!selectedOption || loading}
                loading={loading && !syncStatus}
                style={styles.footerBtn}
                testID="schedule-setup-continue"
              />
            </View>
            <Text variant="muted" style={styles.deferHint}>
              If you want, you can finish this part later from Dashboard -&gt; Manage Schedule -&gt; Change Option
            </Text>
          </>
        )}
        <Text variant="muted" style={styles.privacy}>
          Your schedule stays private. Privacy is our top priority.
        </Text>
      </View>
      <Modal visible={!!dialogState} onClose={closeDialog} title={dialogState?.title}>
        <Text variant="body" style={[styles.dialogMessage, { color: palette.textPrimary }]}>
          {dialogState?.message}
        </Text>
        <View style={styles.dialogActions}>
          {(dialogState?.actions ?? []).map((action, index) => (
            <Button
              key={`${action.label}-${index}`}
              title={action.label}
              variant={action.variant ?? 'primary'}
              onPress={() => {
                closeDialog();
                action.onPress?.();
              }}
              style={styles.dialogButton}
            />
          ))}
        </View>
      </Modal>
    </Container>
  );
};

export const ScheduleSetupScreen: React.FC<Props> = (props) => {
  return <ScheduleSetupScreenInner {...props} />;
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.TITLE_CONTENT_TOP_PADDING,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  sectionLabel: { marginBottom: 16, fontWeight: theme.fontWeight.semibold, textAlign: 'center' },
  googleCard: { marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  halfCard: { flex: 1, alignSelf: 'stretch' },
  halfCardContent: { flex: 1 },
  selectedHalfCard: {
    paddingHorizontal: theme.spacing.md - 1,
    paddingVertical: theme.spacing.md - 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { fontWeight: theme.fontWeight.semibold },
  recommendedBadge: {
    borderRadius: theme.borderRadius.xl,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(46,233,166,0.35)',
    backgroundColor: 'rgba(46,233,166,0.12)',
  },
  recommendedText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.accentPrimary,
  },
  cardDesc: { lineHeight: 18, marginTop: 6 },
  upcomingCard: {
    opacity: 0.7,
  },
  upcomingCardTitle: {
  },
  upcomingBadge: {
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  upcomingBadgeText: {
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.xs,
  },
  syncOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  syncOverlayText: { fontWeight: theme.fontWeight.medium, textAlign: 'center' },
  cardMicrocopy: {
    fontSize: theme.fontSize.xs,
    marginTop: 6,
    lineHeight: 16,
  },
  e2eBtn: {
    marginTop: 12,
  },
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  footerActions: {
    flexDirection: 'row',
    gap: screenChrome.FOOTER_BUTTON_GAP,
  },
  footerBtn: {
    flex: 1,
  },
  deferHint: {
    textAlign: 'center',
    marginTop: 10,
  },
  privacy: { textAlign: 'center', marginTop: screenChrome.FOOTER_NOTE_MARGIN_TOP },
  dialogMessage: {
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dialogButton: {
    minWidth: 110,
  },
});
