import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as AuthSession from 'expo-auth-session';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { theme } from '../theme';
import { buildWeeklyTemplateFromIcsEvents, parseICSFile } from '../lib/ics';
import { eventsRepo } from '../lib/repositories/eventsRepo';
import { manualScheduleRepo } from '../lib/repositories/manualScheduleRepo';
import { plansRepo } from '../lib/repositories/plansRepo';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';
import { syncNudgePlansForCurrentSchedule } from '../lib/scheduleSync';
import { useAppStore } from '../store';
import {
  googleCalendarService,
  getGoogleAuthConfig,
  getGoogleRedirectUri,
  isGoogleConfigured,
} from '../lib/googleCalendar';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduleSetup'>;
type ScheduleOption = 'google' | 'import' | 'manual' | null;

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const ScheduleSetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const [selectedOption, setSelectedOption] = useState<ScheduleOption>(null);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const { setScheduleSource, scheduleSource, preferences, setUpcomingPlans } = useAppStore();
  const manageMode = !!route.params?.manageMode;

  const exitScreen = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate(manageMode ? 'ScheduleOverview' : 'Dashboard');
  };

  const navigateToManualSchedule = () => {
    if (manageMode) {
      navigation.navigate('ManualSchedule', { manageMode: true });
      return;
    }
    navigation.navigate('ManualSchedule');
  };

  const finishAfterSave = async () => {
    try {
      await syncNudgePlansForCurrentSchedule(preferences);
      const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
      setUpcomingPlans(refreshedUpcoming);
    } catch (error) {
      console.error('Failed to sync opportunities after schedule update:', error);
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
      Alert.alert('Sign-in Failed', response.error?.message || 'Could not sign in with Google.');
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
    setSelectedOption(selectedOption === opt ? null : opt);
  };

  const onGoogleCardPress = () => {
    Alert.alert('Coming soon', 'Link Google Calendar will be available in a future update. Use Import or Input Manually for now.');
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
            { text: 'Input Manually', onPress: () => { setLoading(false); setSyncStatus(null); navigateToManualSchedule(); } },
            { text: 'OK', style: 'cancel', onPress: () => { setLoading(false); setSyncStatus(null); } },
          ]
        );
        return;
      }

      setSyncStatus(`Saving ${events.length} events...`);

      // Keep one active schedule source by replacing all existing busy events.
      await eventsRepo.deleteAll();
      await eventsRepo.saveMany(events);

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
        `Successfully imported ${events.length} events from Google Calendar.`,
        [{ text: manageMode ? 'Done' : 'Continue', onPress: completeFlow }]
      );
    } catch (error) {
      console.error('Google Calendar sync error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setLoading(false);
      setSyncStatus(null);
      Alert.alert('Sync Failed', `Could not fetch calendar events: ${msg}`);
    }
  };

  const startGoogleAuth = async () => {
    if (!isGoogleConfigured()) {
      const redirectUri = getGoogleRedirectUri();
      Alert.alert(
        'One-time setup',
        'To connect Google Calendar:\n\n' +
          '1. Go to console.cloud.google.com → your project → APIs & Services → Credentials\n' +
          '2. Create OAuth 2.0 Client ID (Web application)\n' +
          '3. Add this URL under Authorized redirect URIs:\n\n' +
          redirectUri +
          '\n\n' +
          '4. Enable "Google Calendar API" under APIs & Services → Library\n' +
          '5. Create a .env file in the project root with:\n' +
          'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_client_id_here\n\n' +
          '6. Restart the app (npm run web or expo start)',
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
        const warningText = parseResult.errors.slice(0, 3).join('\n');
        showMessage('Import Warning', warningText);
      }
      if (parseResult.events.length === 0) {
        setLoading(false);
        setSyncStatus(null);
        showMessage('No Events', 'No events found in the ICS file.');
        return;
      }

      setSyncStatus(`Importing ${parseResult.events.length} events...`);
      const weeklyTemplate = buildWeeklyTemplateFromIcsEvents(parseResult.events);
      if (weeklyTemplate.length === 0) {
        showMessage(
          'Import Note',
          'The ICS file was imported, but no timed events were available for the weekly grid preview.'
        );
      }
      await eventsRepo.deleteAll();
      await eventsRepo.saveMany(parseResult.events);
      await manualScheduleRepo.deleteAll();
      await manualScheduleRepo.saveMany(weeklyTemplate);
      const source = { type: 'ics' as const, filename: file.name, lastImportedAt: new Date().toISOString() };
      await scheduleSourceRepo.save(source);
      setScheduleSource(source);
      setSyncStatus('Refreshing walking opportunities...');
      await finishAfterSave();
      setLoading(false);
      setSyncStatus(null);
      if (manageMode) {
        navigation.navigate('ManualSchedule', {
          manageMode: true,
          importedFilename: file.name || 'calendar.ics',
        });
        return;
      }
      navigation.navigate('Preferences', {});
    } catch (error) {
      console.error('ICS import failed:', error);
      setLoading(false);
      setSyncStatus(null);
      const msg = error instanceof Error ? error.message : 'Failed to import ICS file. Please try again.';
      showMessage('Import Failed', msg);
    }
  };

  /* ── Continue ── */
  const runSelectedOption = async () => {
    if (!selectedOption) return;
    if (selectedOption === 'google') await startGoogleAuth();
    else if (selectedOption === 'import') await handleImport();
    else navigateToManualSchedule();
  };

  const handleContinue = () => {
    if (!selectedOption || loading) return;
    if (!manageMode) {
      void runSelectedOption();
      return;
    }

    const message = selectedOption === 'import'
      ? 'Save this schedule source and replace your current schedule data? Walking opportunities will be refreshed.'
      : 'Continue to manual schedule editing? Changes are applied only after you save.';

    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(message);
      if (ok) {
        void runSelectedOption();
      }
      return;
    }

    Alert.alert(
      'Save schedule changes?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => { void runSelectedOption(); } },
      ]
    );
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <Text variant="title" style={styles.title}>{manageMode ? 'Manage your schedule' : 'Set up your schedule'}</Text>
        <Text variant="body" color={theme.colors.textMuted} style={styles.subtitle}>
          {manageMode
            ? 'Change your schedule source or update existing schedule data.'
            : 'Tell us when you are busy so GapWalk can find walking windows.'}
        </Text>
        <Text variant="body" style={styles.sectionLabel}>
          {manageMode ? 'Choose how GapWalk should read your schedule' : 'Choose how to add your schedule'}
        </Text>

        {/* Google Calendar – upcoming feature (not available yet) */}
        <Card
          selected={false}
          onPress={onGoogleCardPress}
          style={[styles.googleCard, styles.upcomingCard]}
        >
          <View style={styles.cardHeader}>
            <Text variant="body" style={[styles.cardTitle, styles.upcomingCardTitle]}>Link Google Calendar</Text>
            <View style={styles.upcomingBadge}>
              <Text variant="bodySmall" style={styles.upcomingBadgeText}>Upcoming feature</Text>
            </View>
          </View>
          <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.cardDesc}>
            Sign in with Google to automatically detect your busy times and find the best walking gaps.
          </Text>
        </Card>

        {/* Import & Manual – side by side */}
        <View style={styles.row}>
          <Card
            selected={selectedOption === 'import'}
            onPress={() => toggle('import')}
            style={styles.halfCard}
          >
            <Text variant="body" style={styles.cardTitle}>Import</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.cardDesc}>
              Upload a .ics file so GapWalk can see when you're busy.
            </Text>
          </Card>

          <Card
            selected={selectedOption === 'manual'}
            onPress={() => toggle('manual')}
            style={styles.halfCard}
          >
            <Text variant="body" style={styles.cardTitle}>Input Manually</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.cardDesc}>
              Build your weekly schedule on a simple calendar.
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
            />
            <Button
              title="Save"
              onPress={handleContinue}
              disabled={!selectedOption || selectedOption === 'google' || loading}
              loading={loading && !syncStatus}
              style={styles.footerBtn}
            />
          </View>
        ) : (
          <Button
            title="Continue"
            onPress={handleContinue}
            disabled={!selectedOption || selectedOption === 'google' || loading}
            loading={loading && !syncStatus}
            full
          />
        )}
        <Text variant="muted" style={styles.privacy}>
          Your schedule stays private. Privacy is our utmost importance.
        </Text>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: 28,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  title: { marginBottom: 6, textAlign: 'center' },
  subtitle: { marginBottom: 28, textAlign: 'center', lineHeight: 20 },
  sectionLabel: { marginBottom: 16, fontWeight: theme.fontWeight.semibold, textAlign: 'center' },
  googleCard: { marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  halfCard: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: { fontWeight: theme.fontWeight.semibold, marginBottom: 6 },
  cardDesc: { lineHeight: 18 },
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
    opacity: 0.85,
    borderColor: theme.colors.textMuted,
  },
  upcomingCardTitle: {
    color: theme.colors.textMuted,
  },
  upcomingBadge: {
    backgroundColor: 'rgba(128,128,128,0.2)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  upcomingBadgeText: {
    color: theme.colors.textMuted,
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
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingVertical: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  footerBtn: {
    flex: 1,
  },
  privacy: { textAlign: 'center', marginTop: 14 },
});
