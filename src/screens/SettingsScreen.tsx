import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Alert, Platform, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { translateLiteral } from '../lib/i18n';
import { plansRepo } from '../lib/repositories/plansRepo';
import { notificationPlanActions } from '../lib/notificationPlanActions';
import { analyticsRepo } from '../lib/repositories/analyticsRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { themeMode, setThemeMode, language, setLanguage } = useAppStore();
  const palette = getThemePalette(themeMode);

  // Remount content when screen gains focus so theme/language always match the store (fixes stale back chip & pills)
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
      return () => {};
    }, [])
  );
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';
  const selectedPillTextColor = '#06261d';
  const unselectedPillBg = palette.bgSurface;
  const unselectedPillBorder = palette.borderStrong;
  const pillRipple = themeMode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)';
  const pillRippleSelected = themeMode === 'dark' ? 'rgba(0,0,0,0.12)' : 'rgba(15,23,42,0.16)';

  const t = (key: string) => translateLiteral(key, language);
  const darkLabel = t('Dark');
  const lightLabel = t('Light');
  const englishLabel = t('English');
  const espanolLabel = t('Espa\u00F1ol');

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
      Alert.alert('No upcoming plan', 'Create a schedule first so we can simulate the start action.');
      return;
    }

    const result = await notificationPlanActions.canStartPlan(first.id);
    if (!result.allowed) {
      Alert.alert('Action blocked', 'The start action was blocked, likely because today\'s goal is already complete.');
      return;
    }

    navigation.navigate('Walking', { planId: first.id });
  };

  const simulateNotificationSkip = async () => {
    const first = (await plansRepo.getUpcomingPlans(1))[0];
    if (!first) {
      Alert.alert('No upcoming plan', 'Create a schedule first so we can simulate the skip action.');
      return;
    }
    await notificationPlanActions.skipGap(first.id);
    Alert.alert('Done', 'Skip action simulated for the next upcoming plan.');
  };

  const showTelemetrySnapshot = async () => {
    const events = await analyticsRepo.getRecentEvents(20);
    const crashes = await analyticsRepo.getRecentCrashes(5);
    Alert.alert(
      'Telemetry Snapshot',
      `Recent events: ${events.length}\nRecent crashes: ${crashes.length}`
    );
  };

  const renderSegmentPill = ({
    selected,
    title,
    onPress,
    testID,
  }: {
    selected: boolean;
    title: string;
    onPress: () => void;
    testID: string;
  }) => (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      testID={testID}
      accessibilityLabel={testID}
      accessibilityRole="button"
      android_ripple={{ color: selected ? pillRippleSelected : pillRipple }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? theme.colors.accentPrimary : unselectedPillBg,
          borderColor: selected ? 'transparent' : unselectedPillBorder,
        },
        pressed && styles.pillPressed,
      ]}
    >
      <Text
        variant="body"
        style={[
          styles.pillLabel,
          { color: selected ? selectedPillTextColor : palette.textPrimary },
        ]}
      >
        {selected ? `\u2713  ${title}` : title}
      </Text>
    </Pressable>
  );

  // Force remount when theme/language changes or when screen gains focus so back chip and pills never show stale styles
  const contentKey = `settings-${themeMode}-${language}-${focusKey}`;

  return (
    <Container scrollable key={contentKey}>
      <View style={styles.content}>
        <ScreenHeader
          title="Settings"
          subtitle="Choose how GapWalk looks and which language it uses."
          onBack={handleBack}
          backTestID="settings-back"
          themeMode={themeMode}
        />

        <Card elevated style={styles.card}>
          <View style={styles.cardLabelRow}>
            <AppIcon name="settings" size={14} color={theme.colors.accentPrimary} />
            <Text variant="bodySmall" style={[styles.label, { color: palette.textMuted }]}>Appearance</Text>
          </View>
          <View style={styles.row}>
            {renderSegmentPill({
              selected: themeMode === 'dark',
              title: darkLabel,
              onPress: () => setThemeMode('dark'),
              testID: 'settings-theme-dark',
            })}
            {renderSegmentPill({
              selected: themeMode === 'light',
              title: lightLabel,
              onPress: () => setThemeMode('light'),
              testID: 'settings-theme-light',
            })}
          </View>
        </Card>

        <Card elevated style={styles.card}>
          <View style={styles.cardLabelRow}>
            <AppIcon name="adjust" size={14} color={theme.colors.accentPrimary} />
            <Text variant="bodySmall" style={[styles.label, { color: palette.textMuted }]}>Language</Text>
          </View>
          <View style={styles.row}>
            {renderSegmentPill({
              selected: language === 'en',
              title: englishLabel,
              onPress: () => confirmLanguageChange('en'),
              testID: 'settings-lang-en',
            })}
            {renderSegmentPill({
              selected: language === 'es',
              title: espanolLabel,
              onPress: () => confirmLanguageChange('es'),
              testID: 'settings-lang-es',
            })}
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
  card: { marginBottom: 20 },
  label: { marginBottom: 10 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    minHeight: theme.layout.buttonHeight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pillPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.85,
  },
  pillLabel: {
    fontWeight: theme.fontWeight.semibold,
  },
  stack: { gap: 10 },
});
