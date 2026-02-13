import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as AuthSession from 'expo-auth-session';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { theme } from '../theme';
import { parseICSFile } from '../lib/ics';
import { eventsRepo } from '../lib/repositories/eventsRepo';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';
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

export const ScheduleSetupScreen: React.FC<Props> = ({ navigation }) => {
  const [selectedOption, setSelectedOption] = useState<ScheduleOption>(null);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const { setScheduleSource } = useAppStore();

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
        handleGoogleSync(access_token);
      }
    } else if (response?.type === 'error') {
      setLoading(false);
      Alert.alert('Sign-in Failed', response.error?.message || 'Could not sign in with Google.');
    } else if (response?.type === 'dismiss') {
      setLoading(false);
    }
  }, [response]);

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
            { text: 'Input Manually', onPress: () => { setLoading(false); setSyncStatus(null); navigation.navigate('ManualSchedule'); } },
            { text: 'OK', style: 'cancel', onPress: () => { setLoading(false); setSyncStatus(null); } },
          ]
        );
        return;
      }

      setSyncStatus(`Saving ${events.length} events...`);

      // Clear old google events and save new ones
      await eventsRepo.deleteBySource('google');
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

      setSyncStatus(null);
      setLoading(false);

      Alert.alert(
        'Calendar Linked',
        `Successfully imported ${events.length} events from Google Calendar.`,
        [{ text: 'Continue', onPress: () => navigation.navigate('Preferences', {}) }]
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
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/calendar',
        copyToCacheDirectory: true,
      });
      if (result.canceled) { setLoading(false); return; }
      const file = result.assets[0];
      const resp = await fetch(file.uri);
      const content = await resp.text();
      const parseResult = await parseICSFile(content);
      if (parseResult.errors.length > 0) Alert.alert('Import Warning', parseResult.errors.join('\n'));
      if (parseResult.events.length === 0) { Alert.alert('No Events', 'No events found in the ICS file.'); setLoading(false); return; }
      await eventsRepo.saveMany(parseResult.events);
      const source = { type: 'ics' as const, filename: file.name, lastImportedAt: new Date().toISOString() };
      await scheduleSourceRepo.save(source);
      setScheduleSource(source);
      setLoading(false);
      navigation.navigate('Preferences', {});
    } catch {
      setLoading(false);
      Alert.alert('Import Failed', 'Failed to import ICS file. Please try again.');
    }
  };

  /* ── Continue ── */
  const handleContinue = async () => {
    if (!selectedOption) return;
    if (selectedOption === 'google') await startGoogleAuth();
    else if (selectedOption === 'import') await handleImport();
    else navigation.navigate('ManualSchedule');
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <Text variant="title" style={styles.title}>Set up your schedule</Text>
        <Text variant="body" color={theme.colors.textMuted} style={styles.subtitle}>
          Tell us when you're busy so GapWalk can find walking windows.
        </Text>
        <Text variant="body" style={styles.sectionLabel}>Choose how to add your schedule</Text>

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
        <Button
          title="Continue"
          onPress={handleContinue}
          disabled={!selectedOption || selectedOption === 'google' || loading}
          loading={loading && !syncStatus}
          full
        />
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
  privacy: { textAlign: 'center', marginTop: 14 },
});
