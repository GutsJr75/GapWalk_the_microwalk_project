import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, Platform, LayoutAnimation, UIManager } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as AuthSession from 'expo-auth-session';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { AppIcon } from '../components/AppIcon';
import { ScreenHeader } from '../components/ScreenHeader';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { useThemePalette } from '../theme/palette';
import { buildWeeklyTemplateFromIcsEvents, parseICSFile } from '../utils/ics';
import { ManualScheduleEntry } from '../types';
import { eventsRepo } from '../data/repositories/eventsRepo';
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
  getGoogleAuthConfig,
  getGoogleRedirectUri,
  isGoogleConfigured,
} from '../services/googleCalendar';
import { toUserFriendlyError } from '../utils/errorMessages';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduleSetup'>;
type ScheduleOption = 'google' | 'import' | 'manual' | null;

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const isFabric = !!(globalThis as any).nativeFabricUIManager;

if (Platform.OS === 'android' && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const ScheduleSetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const [selectedOption, setSelectedOption] = useState<ScheduleOption>(null);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const { setScheduleSource, scheduleSource, preferences, setUpcomingPlans } = useAppStore();
  const palette = useThemePalette();
  const manageMode = !!route.params?.manageMode;
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';

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

  const showMessage = (title: string, message: string, onAcknowledge?: () => void) => {
    if (Platform.OS === 'web' && typeof (globalThis as any).alert === 'function') {
      (globalThis as any).alert(`${title}\n\n${message}`);
      onAcknowledge?.();
      return;
    }
    if (onAcknowledge) {
      Alert.alert(title, message, [{ text: 'OK', onPress: onAcknowledge }]);
      return;
    }
    Alert.alert(title, message);
  };

  // expo-auth-session hook for Google OAuth
  const authConfig = getGoogleAuthConfig();
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: authConfig.clientId,
      scopes: authConfig.scopes,
      redirectUri: authConfig.redirectUri,
      responseType: AuthSession.ResponseType.Token,
    },
    discovery
  );

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      if (access_token) {
        void handleGoogleSync(access_token);
      }
    } else if (response?.type === 'error') {
      setLoading(false);
      const msg = toUserFriendlyError(response.error ?? new Error('Could not sign in with Google'));
      Alert.alert('Sign-in Failed', msg);
    } else if (response?.type === 'dismiss') {
      setLoading(false);
    }
  }, [response]);

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
    if (opt === 'google') return; // Google Calendar is upcoming feature, not selectable
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedOption(selectedOption === opt ? null : opt);
  };

  const onGoogleCardPress = () => {
    Alert.alert('Coming soon', 'Google Calendar linking is coming soon. For now, use Import or Enter manually.');
  };

  /* ── Google Calendar sync ── */
  const handleGoogleSync = async (accessToken: string) => {
    try {
      setLoading(true);
      setSyncStatus('Fetching your calendar events...');

      const events = await googleCalendarService.fetchEvents(accessToken, 14);

      if (events.length === 0) {
        Alert.alert(
          'No Events Found',
          'Your Google Calendar has no events in the next 14 days. You can add events manually instead.',
          [
            { text: 'Enter manually', onPress: () => { setLoading(false); setSyncStatus(null); navigateToManualSchedule(); } },
            { text: 'OK', style: 'cancel', onPress: () => { setLoading(false); setSyncStatus(null); } },
          ]
        );
        return;
      }

      setSyncStatus(`Saving ${events.length} events...`);

      // Atomically replace all existing busy events (rolls back on failure).
      await eventsRepo.replaceAll(events);

      // Save schedule source with token
      const source = {
        type: 'google' as const,
        lastImportedAt: new Date().toISOString(),
        googleConnected: true,
        googleAccessToken: accessToken,
      };
      await scheduleSourceRepo.save(source);
      setScheduleSource(source);
      await finishAfterSave();

      setSyncStatus(null);
      setLoading(false);

      Alert.alert(
        manageMode ? 'Schedule Updated' : 'Calendar Linked',
        `Imported ${events.length} events from Google Calendar.`,
        [{ text: manageMode ? 'Done' : 'Continue', onPress: completeFlow }]
      );
    } catch (error) {
      if (__DEV__) console.error('Google Calendar sync error:', error);
      const msg = toUserFriendlyError(error);
      setLoading(false);
      setSyncStatus(null);
      Alert.alert('Sync Failed', msg);
    }
  };

  const startGoogleAuth = async () => {
    if (!isGoogleConfigured()) {
      const redirectUri = getGoogleRedirectUri();
      Alert.alert(
        'Google Calendar',
        'Google Calendar integration is coming soon. Please use Import or Enter manually for now.',
        [{ text: 'OK' }]
      );
      return;
    }
    setLoading(true);
    setSyncStatus('Opening Google sign-in...');
    await promptAsync();
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
        throw new Error('The selected ICS file is empty.');
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
        showMessage('No Events', 'No events found in the ICS file.');
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
          'The ICS file was imported, but no timed events were available for the weekly grid preview.'
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
    if (selectedOption === 'google') await startGoogleAuth();
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

    Alert.alert(
      'Update schedule source?',
      message,
      [
        { text: SAVE_CONFIRM_DECLINE, style: 'cancel' },
        { text: 'Yes, Update', onPress: () => { void runSelectedOption(); } },
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

        {/* Google Calendar – upcoming feature (not available yet) */}
        <Card
          selected={false}
          onPress={onGoogleCardPress}
          style={[styles.googleCard, styles.upcomingCard, { borderColor: palette.textMuted }]}
          testID="schedule-option-google"
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <AppIcon name="calendar" size={15} color={palette.textMuted} />
              <Text variant="body" style={[styles.cardTitle, { color: palette.textMuted }]}>Link Google Calendar</Text>
            </View>
            <View style={[styles.upcomingBadge, { backgroundColor: palette.borderSoft }]}>
              <Text variant="bodySmall" style={[styles.upcomingBadgeText, { color: palette.textMuted }]}>Coming soon</Text>
            </View>
          </View>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.cardDesc}>
            Sign in with Google to detect your busy times and find the best walking windows.
          </Text>
        </Card>

        {/* Import & Manual – side by side */}
        <View style={styles.row}>
          <Card
            selected={selectedOption === 'import'}
            onPress={() => toggle('import')}
            style={[styles.halfCard, selectedOption === 'import' && styles.selectedHalfCard]}
            testID="schedule-option-import"
          >
            <View style={styles.cardTitleRow}>
              <AppIcon name="calendar" size={15} color={theme.colors.accentPrimary} />
              <Text variant="body" style={styles.cardTitle}>Import</Text>
            </View>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.cardDesc}>
              Upload a .ics file so GapWalk can see when you're busy.
            </Text>
          </Card>

          <Card
            selected={selectedOption === 'manual'}
            onPress={() => toggle('manual')}
            style={[styles.halfCard, selectedOption === 'manual' && styles.selectedHalfCard]}
            testID="schedule-option-manual"
          >
            <View style={styles.cardTitleRow}>
              <AppIcon name="adjust" size={15} color={theme.colors.accentPrimary} />
              <Text variant="body" style={styles.cardTitle}>Input manually</Text>
            </View>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.cardDesc}>
              Build your weekly schedule and one-time events with a simple calendar.
            </Text>
          </Card>
        </View>

        {/* Sync status */}
        {loading && syncStatus && (
          <View style={styles.syncRow}>
            <ActivityIndicator size="small" color={theme.colors.accentPrimary} />
            <Text variant="bodySmall" color={theme.colors.accentPrimary} style={styles.syncText}>{syncStatus}</Text>
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
              disabled={!selectedOption || selectedOption === 'google' || loading}
              loading={loading && !syncStatus}
              style={styles.footerBtn}
              testID="schedule-setup-continue"
            />
          </View>
        ) : (
          <Button
            title="Next"
            onPress={handleContinue}
            disabled={!selectedOption || selectedOption === 'google' || loading}
            loading={loading && !syncStatus}
            full
            testID="schedule-setup-continue"
          />
        )}
        <Text variant="muted" style={styles.privacy}>
          Your schedule stays private. Privacy is our top priority.
        </Text>
      </View>
    </Container>
  );
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
  row: { flexDirection: 'row', gap: 12 },
  halfCard: { flex: 1 },
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
  cardDesc: { lineHeight: 18, marginTop: 6 },
  recommendedBadge: {
    backgroundColor: 'rgba(46,233,166,0.12)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  recommendedText: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.xs,
  },
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
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
  },
  syncText: { fontWeight: theme.fontWeight.medium },
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
  privacy: { textAlign: 'center', marginTop: screenChrome.FOOTER_NOTE_MARGIN_TOP },
});
