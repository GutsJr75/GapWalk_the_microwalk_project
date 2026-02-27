import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { TwoActionBar } from '../components/TwoActionBar';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { translateLiteral } from '../lib/i18n';
import { plansRepo } from '../lib/repositories/plansRepo';
import { notificationPlanActions } from '../lib/notificationPlanActions';
import { analyticsRepo } from '../lib/repositories/analyticsRepo';
import { authStorage } from '../lib/authStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const SETTINGS_BLOCK_GAP = 18;
const SETTINGS_GROUP_RADIUS = 14;
const SETTINGS_GROUP_PADDING_X = 14;
const SETTINGS_ITEM_PADDING_Y = 14;
const SETTINGS_SEGMENT_GAP = 10;
const SETTINGS_SECTION_LABEL_MARGIN_BOTTOM = 10;

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { themeMode, setThemeMode, language, setLanguage } = useAppStore();
  const palette = getThemePalette(themeMode);

  const baselineThemeModeRef = useRef(themeMode);
  const baselineLanguageRef = useRef(language);
  const themeModeRef = useRef(themeMode);
  const languageRef = useRef(language);
  const allowExitRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);

  useEffect(() => {
    themeModeRef.current = themeMode;
  }, [themeMode]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Remount content when screen gains focus so theme/language always match the store (fixes stale back chip & pills)
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
      baselineThemeModeRef.current = themeModeRef.current;
      baselineLanguageRef.current = languageRef.current;
      hasUnsavedChangesRef.current = false;
      allowExitRef.current = false;
      return () => {};
    }, [])
  );
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';
  const selectedPillTextColor = palette.pillSelectedText;
  const unselectedPillBg = palette.bgSurface;
  const unselectedPillBorder = palette.borderStrong;
  const pillRipple = palette.inputBg;
  const pillRippleSelected = 'rgba(255,255,255,0.18)';

  const t = (key: string) => translateLiteral(key, language);
  const darkLabel = t('Dark');
  const lightLabel = t('Light');
  const englishLabel = t('English');
  const espanolLabel = t('Espa\u00F1ol');
  const hasUnsavedChanges =
    themeMode !== baselineThemeModeRef.current || language !== baselineLanguageRef.current;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowExitRef.current || !hasUnsavedChangesRef.current) return;
      event.preventDefault();

      const activeLanguage = languageRef.current;
      const title = translateLiteral('Discard changes?', activeLanguage);
      const message = translateLiteral(
        'Your unsaved settings changes will be lost. Do you want to go back?',
        activeLanguage
      );

      const discardAndLeave = () => {
        setThemeMode(baselineThemeModeRef.current);
        setLanguage(baselineLanguageRef.current);
        hasUnsavedChangesRef.current = false;
        allowExitRef.current = true;
        navigation.dispatch(event.data.action);
      };

      if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
        const ok = (globalThis as any).confirm(`${title}\n\n${message}`);
        if (ok) discardAndLeave();
        return;
      }

      Alert.alert(title, message, [
        { text: translateLiteral('Keep editing', activeLanguage), style: 'cancel' },
        { text: translateLiteral('Discard', activeLanguage), style: 'destructive', onPress: discardAndLeave },
      ]);
    });

    return unsubscribe;
  }, [navigation, setLanguage, setThemeMode]);

  const handleBack = () => {
    navigation.navigate('Dashboard', { openMenu: true });
  };

  const handleSave = async () => {
    baselineThemeModeRef.current = themeModeRef.current;
    baselineLanguageRef.current = languageRef.current;
    hasUnsavedChangesRef.current = false;
    allowExitRef.current = true;

    // Persist to SecureStore so they survive app restart
    await authStorage.saveThemeMode(themeModeRef.current);
    await authStorage.saveLanguage(languageRef.current);

    navigation.goBack();
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

  // Remount the container on focus to keep ScreenHeader back chip and segmented rows in sync.
  const contentKey = `settings-${focusKey}`;

  return (
    <Container scrollable key={contentKey}>
      <View style={styles.content}>
        <ScreenHeader
          title="Settings"
          subtitle="Choose how GapWalk looks and which language it uses."
          onBack={handleBack}
          backTestID="settings-back"
          align="center"
          themeMode={themeMode}
        />

        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          {t('Viewer Settings')}
        </Text>

        <Card elevated style={styles.settingsListCard}>
          <View style={styles.settingGroup}>
            <View style={styles.settingLabelRow}>
              <AppIcon name="settings" size={14} color={theme.colors.accentPrimary} />
              <Text variant="bodySmall" style={[styles.settingTitle, { color: palette.textMuted }]}>Appearance</Text>
            </View>
            <View style={styles.segmentRow}>
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
          </View>

          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />

          <View style={styles.settingGroup}>
            <View style={styles.settingLabelRow}>
              <AppIcon name="adjust" size={14} color={theme.colors.accentPrimary} />
              <Text variant="bodySmall" style={[styles.settingTitle, { color: palette.textMuted }]}>Language</Text>
            </View>
            <View style={styles.segmentRow}>
              {renderSegmentPill({
                selected: language === 'en',
                title: englishLabel,
                onPress: () => setLanguage('en'),
                testID: 'settings-lang-en',
              })}
              {renderSegmentPill({
                selected: language === 'es',
                title: espanolLabel,
                onPress: () => setLanguage('es'),
                testID: 'settings-lang-es',
              })}
            </View>
          </View>
        </Card>

        {isE2E && (
          <Card elevated style={styles.e2eCard}>
            <View style={styles.settingLabelRow}>
              <AppIcon name="sync" size={14} color={theme.colors.accentPrimary} />
              <Text variant="bodySmall" style={[styles.settingTitle, { color: palette.textMuted }]}>
                E2E Notification Actions
              </Text>
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

        <TwoActionBar
          style={styles.footer}
          primaryAction={{
            title: 'Save',
            onPress: handleSave,
            testID: 'settings-done',
          }}
        />
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
  sectionLabel: {
    marginLeft: 2,
    marginBottom: SETTINGS_SECTION_LABEL_MARGIN_BOTTOM,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.8,
  },
  settingsListCard: {
    marginBottom: SETTINGS_BLOCK_GAP,
    borderRadius: SETTINGS_GROUP_RADIUS,
    paddingHorizontal: SETTINGS_GROUP_PADDING_X,
    paddingVertical: SETTINGS_ITEM_PADDING_Y,
    gap: SETTINGS_ITEM_PADDING_Y,
  },
  settingGroup: {
    gap: 10,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  settingDivider: {
    height: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: SETTINGS_SEGMENT_GAP,
  },
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
  e2eCard: {
    marginTop: 0,
    marginBottom: SETTINGS_BLOCK_GAP,
  },
  stack: {
    gap: 10,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
  },
});
