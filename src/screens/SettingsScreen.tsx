import React from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { translateLiteral } from '../lib/i18n';
import { plansRepo } from '../lib/repositories/plansRepo';
import { notificationPlanActions } from '../lib/notificationPlanActions';
import { analyticsRepo } from '../lib/repositories/analyticsRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { themeMode, setThemeMode, language, setLanguage } = useAppStore();
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard');
  };

  const confirmLanguageChange = (next: 'en' | 'es') => {
    if (next === language) return;

    const targetLabel = next === 'es' ? 'Spanish' : 'English';
    const title = translateLiteral('Change language?', language);
    const message = translateLiteral(
      `Are you sure you want to switch the app language to ${targetLabel}?`,
      language
    );

    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(`${title}\n\n${message}`);
      if (ok) setLanguage(next);
      return;
    }

    Alert.alert(title, message, [
      { text: translateLiteral('Cancel', language), style: 'cancel' },
      { text: translateLiteral('Yes, change', language), onPress: () => setLanguage(next) },
    ]);
  };

  const simulateNotificationStart = async () => {
    const first = (await plansRepo.getUpcomingPlans(1))[0];
    if (!first) {
      Alert.alert('No upcoming plan', 'Create a schedule first so we can simulate a start action.');
      return;
    }

    const result = await notificationPlanActions.canStartPlan(first.id);
    if (!result.allowed) {
      Alert.alert('Blocked', 'Start action was blocked (likely daily goal already reached).');
      return;
    }

    navigation.navigate('Walking', { planId: first.id });
  };

  const simulateNotificationSkip = async () => {
    const first = (await plansRepo.getUpcomingPlans(1))[0];
    if (!first) {
      Alert.alert('No upcoming plan', 'Create a schedule first so we can simulate skip action.');
      return;
    }
    await notificationPlanActions.skipGap(first.id);
    Alert.alert('Simulated', 'Skip action simulated for the next upcoming plan.');
  };

  const showTelemetrySnapshot = async () => {
    const events = await analyticsRepo.getRecentEvents(20);
    const crashes = await analyticsRepo.getRecentCrashes(5);
    Alert.alert(
      'Telemetry Snapshot',
      `Recent events: ${events.length}\nRecent crashes: ${crashes.length}`
    );
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="Settings"
          subtitle="Tweak how GapWalk looks and speaks."
          onBack={handleBack}
          backTestID="settings-back"
        />

        <Card elevated style={styles.card}>
          <View style={styles.cardLabelRow}>
            <AppIcon name="settings" size={14} color={theme.colors.accentPrimary} />
            <Text variant="bodySmall" style={styles.label}>Appearance</Text>
          </View>
          <View style={styles.row}>
            <Button
              title="Dark"
              onPress={() => setThemeMode('dark')}
              variant={themeMode === 'dark' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
            <Button
              title="Light"
              onPress={() => setThemeMode('light')}
              variant={themeMode === 'light' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
          </View>
        </Card>

        <Card elevated style={styles.card}>
          <View style={styles.cardLabelRow}>
            <AppIcon name="adjust" size={14} color={theme.colors.accentPrimary} />
            <Text variant="bodySmall" style={styles.label}>Language</Text>
          </View>
          <View style={styles.row}>
            <Button
              title="English"
              onPress={() => confirmLanguageChange('en')}
              variant={language === 'en' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
            <Button
              title={"Espa\u00F1ol"}
              onPress={() => confirmLanguageChange('es')}
              variant={language === 'es' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
          </View>
        </Card>

        {isE2E && (
          <Card elevated style={styles.card}>
            <View style={styles.cardLabelRow}>
              <AppIcon name="sync" size={14} color={theme.colors.accentPrimary} />
              <Text variant="bodySmall" style={styles.label}>E2E Notification Actions</Text>
            </View>
            <View style={styles.stack}>
              <Button
                title="Simulate Start Action"
                onPress={() => { void simulateNotificationStart(); }}
                testID="e2e-notification-start"
                full
              />
              <Button
                title="Simulate Skip Action"
                onPress={() => { void simulateNotificationSkip(); }}
                testID="e2e-notification-skip"
                full
                variant="secondary"
              />
              <Button
                title="Show Telemetry Snapshot"
                onPress={() => { void showTelemetrySnapshot(); }}
                testID="e2e-telemetry-snapshot"
                full
                variant="muted"
              />
            </View>
          </Card>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  card: { marginBottom: 16 },
  label: { color: theme.colors.textMuted, marginBottom: 8 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1 },
  stack: { gap: 10 },
});
