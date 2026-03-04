import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert, Platform, Pressable, Linking, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { SuccessToast } from '../components/SuccessToast';
import { TwoActionBar } from '../components/TwoActionBar';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { translateLiteral } from '../i18n';
import { plansRepo } from '../data/repositories/plansRepo';
import { notificationPlanActions } from '../services/notificationPlanActions';
import { analyticsRepo } from '../data/repositories/analyticsRepo';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { getDatabase } from '../data/db';
import { authStorage } from '../data/authStorage';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const SETTINGS_BLOCK_GAP = 18;
const SETTINGS_GROUP_RADIUS = 14;
const SETTINGS_GROUP_PADDING_X = 14;
const SETTINGS_ITEM_PADDING_Y = 14;
const SETTINGS_SEGMENT_GAP = 10;
const SETTINGS_SECTION_LABEL_MARGIN_BOTTOM = 10;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const PRIVACY_POLICY_URL = 'https://gapwalk.com/privacy';
const TERMS_URL = 'https://gapwalk.com/terms';

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const {
    themeMode, setThemeMode,
    language, setLanguage,
    distanceUnit, setDistanceUnit,
    firstDayOfWeek, setFirstDayOfWeek,
    vibrationEnabled, setVibrationEnabled,
    hasNotificationPermission,
  } = useAppStore();
  const palette = getThemePalette(themeMode);

  const baselineThemeModeRef = useRef(themeMode);
  const baselineLanguageRef = useRef(language);
  const baselineDistanceUnitRef = useRef(distanceUnit);
  const baselineFirstDayRef = useRef(firstDayOfWeek);
  const baselineVibrationRef = useRef(vibrationEnabled);
  const themeModeRef = useRef(themeMode);
  const languageRef = useRef(language);
  const distanceUnitRef = useRef(distanceUnit);
  const firstDayRef = useRef(firstDayOfWeek);
  const vibrationRef = useRef(vibrationEnabled);
  const allowExitRef = useRef(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState('Settings saved');
  const [exporting, setExporting] = useState(false);
  const hasUnsavedChangesRef = useRef(false);

  useEffect(() => { themeModeRef.current = themeMode; }, [themeMode]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { distanceUnitRef.current = distanceUnit; }, [distanceUnit]);
  useEffect(() => { firstDayRef.current = firstDayOfWeek; }, [firstDayOfWeek]);
  useEffect(() => { vibrationRef.current = vibrationEnabled; }, [vibrationEnabled]);

  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
      baselineThemeModeRef.current = themeModeRef.current;
      baselineLanguageRef.current = languageRef.current;
      baselineDistanceUnitRef.current = distanceUnitRef.current;
      baselineFirstDayRef.current = firstDayRef.current;
      baselineVibrationRef.current = vibrationRef.current;
      hasUnsavedChangesRef.current = false;
      allowExitRef.current = false;
      return () => {};
    }, [])
  );

  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';
  const selectedPillTextColor = palette.accentOnSolid;
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
    themeMode !== baselineThemeModeRef.current ||
    language !== baselineLanguageRef.current ||
    distanceUnit !== baselineDistanceUnitRef.current ||
    firstDayOfWeek !== baselineFirstDayRef.current ||
    vibrationEnabled !== baselineVibrationRef.current;

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
        setDistanceUnit(baselineDistanceUnitRef.current);
        setFirstDayOfWeek(baselineFirstDayRef.current);
        setVibrationEnabled(baselineVibrationRef.current);
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
  }, [navigation, setLanguage, setThemeMode, setDistanceUnit, setFirstDayOfWeek, setVibrationEnabled]);

  const handleBack = () => {
    navigation.navigate('Dashboard', { openMenu: true });
  };

  const handleSave = async () => {
    baselineThemeModeRef.current = themeModeRef.current;
    baselineLanguageRef.current = languageRef.current;
    baselineDistanceUnitRef.current = distanceUnitRef.current;
    baselineFirstDayRef.current = firstDayRef.current;
    baselineVibrationRef.current = vibrationRef.current;
    hasUnsavedChangesRef.current = false;
    allowExitRef.current = true;

    await authStorage.saveThemeMode(themeModeRef.current);
    await authStorage.saveLanguage(languageRef.current);
    await authStorage.saveDistanceUnit(distanceUnitRef.current);
    await authStorage.saveFirstDayOfWeek(firstDayRef.current);
    await authStorage.saveVibrationEnabled(vibrationRef.current);

    setSaveToastMessage('Settings saved');
    setShowSaveToast(true);
    setTimeout(() => navigation.goBack(), 1200);
  };

  // --- Data & Storage actions ---

  const handleExportWalkHistory = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const sessions = await sessionsRepo.getAll();
      if (sessions.length === 0) {
        Alert.alert('No Data', 'There are no walk sessions to export yet.');
        return;
      }

      const header = 'Date,Start Time,End Time,Duration (min),Steps,Distance (m),Calories';
      const rows = sessions.map((s) => {
        const startDate = format(new Date(s.start), 'yyyy-MM-dd');
        const startTime = format(new Date(s.start), 'HH:mm');
        const endTime = format(new Date(s.end), 'HH:mm');
        const durationMin = Math.round(s.activeSeconds / 60);
        const steps = s.steps ?? 0;
        const distance = s.distanceMeters != null ? Math.round(s.distanceMeters) : '';
        const calories = s.calories != null ? Math.round(s.calories) : '';
        return `${startDate},${startTime},${endTime},${durationMin},${steps},${distance},${calories}`;
      });

      const csv = [header, ...rows].join('\n');
      await Share.share({ message: csv, title: 'GapWalk Walk History' });
    } catch (error) {
      if (__DEV__) console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleClearWalkHistory = () => {
    Alert.alert(
      'Clear Walk History',
      'This will permanently delete all your walk sessions, routes, and related data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await getDatabase();
              await db.runAsync('DELETE FROM walk_sessions');
              await db.runAsync('DELETE FROM walk_routes');
              await db.runAsync('DELETE FROM walk_pause_events');
              await db.runAsync('DELETE FROM walk_checkpoint');
              setSaveToastMessage('Walk history cleared');
              setShowSaveToast(true);
            } catch (error) {
              if (__DEV__) console.error('Clear walk history failed:', error);
              Alert.alert('Error', 'Could not clear walk history. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleClearCache = async () => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM analytics_events');
      await db.runAsync('DELETE FROM crash_reports');
      setSaveToastMessage('Cache cleared');
      setShowSaveToast(true);
    } catch (error) {
      if (__DEV__) console.error('Clear cache failed:', error);
    }
  };

  // --- E2E helpers ---

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

  // --- UI helpers ---

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
          backgroundColor: selected ? palette.accentPrimary : unselectedPillBg,
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
        {title}
      </Text>
    </Pressable>
  );

  const renderActionRow = ({
    icon,
    label,
    onPress,
    destructive,
    rightText,
    testID,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    destructive?: boolean;
    rightText?: string;
    testID?: string;
  }) => (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
      android_ripple={{ color: pillRipple }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={destructive ? '#ef4444' : palette.accentPrimary}
        style={styles.actionRowIcon}
      />
      <Text
        variant="body"
        style={[
          styles.actionRowLabel,
          { color: destructive ? '#ef4444' : palette.textPrimary },
        ]}
      >
        {label}
      </Text>
      {rightText ? (
        <Text variant="bodySmall" style={[styles.actionRowRight, { color: palette.textMuted }]}>
          {rightText}
        </Text>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
      )}
    </Pressable>
  );

  const contentKey = `settings-${focusKey}`;

  const notifStatusText = hasNotificationPermission ? 'Enabled' : 'Disabled';
  const notifStatusColor = hasNotificationPermission ? palette.accentPrimary : '#ef4444';

  return (
    <Container scrollable key={contentKey}>
      <View style={styles.content}>
        <ScreenHeader
          title="Settings"
          subtitle="Customize your GapWalk experience."
          onBack={handleBack}
          backTestID="settings-back"
          align="center"
          themeMode={themeMode}
        />

        {/* ===== VIEWER SETTINGS ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          {t('Viewer Settings')}
        </Text>

        <Card elevated style={styles.settingsListCard}>
          <View style={styles.settingGroup}>
            <View style={styles.settingLabelRow}>
              <AppIcon name="settings" size={14} color={palette.accentPrimary} />
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
              <AppIcon name="adjust" size={14} color={palette.accentPrimary} />
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

        {/* ===== UNITS & DISPLAY ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          Units & Display
        </Text>

        <Card elevated style={styles.settingsListCard}>
          <View style={styles.settingGroup}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="speedometer-outline" size={14} color={palette.accentPrimary} />
              <Text variant="bodySmall" style={[styles.settingTitle, { color: palette.textMuted }]}>Distance Unit</Text>
            </View>
            <View style={styles.segmentRow}>
              {renderSegmentPill({
                selected: distanceUnit === 'km',
                title: 'Kilometers',
                onPress: () => setDistanceUnit('km'),
                testID: 'settings-unit-km',
              })}
              {renderSegmentPill({
                selected: distanceUnit === 'mi',
                title: 'Miles',
                onPress: () => setDistanceUnit('mi'),
                testID: 'settings-unit-mi',
              })}
            </View>
          </View>

          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />

          <View style={styles.settingGroup}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="calendar-outline" size={14} color={palette.accentPrimary} />
              <Text variant="bodySmall" style={[styles.settingTitle, { color: palette.textMuted }]}>First Day of Week</Text>
            </View>
            <View style={styles.segmentRow}>
              {renderSegmentPill({
                selected: firstDayOfWeek === 'sun',
                title: 'Sunday',
                onPress: () => setFirstDayOfWeek('sun'),
                testID: 'settings-firstday-sun',
              })}
              {renderSegmentPill({
                selected: firstDayOfWeek === 'mon',
                title: 'Monday',
                onPress: () => setFirstDayOfWeek('mon'),
                testID: 'settings-firstday-mon',
              })}
            </View>
          </View>
        </Card>

        {/* ===== NOTIFICATIONS ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          Notifications
        </Text>

        <Card elevated style={styles.settingsListCard}>
          <View style={styles.settingGroup}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="notifications-outline" size={14} color={palette.accentPrimary} />
              <Text variant="bodySmall" style={[styles.settingTitle, { color: palette.textMuted }]}>Permission Status</Text>
            </View>
            <View style={styles.notifStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: notifStatusColor }]} />
              <Text variant="body" style={{ color: notifStatusColor, fontWeight: theme.fontWeight.semibold as any }}>
                {notifStatusText}
              </Text>
              {!hasNotificationPermission && Platform.OS !== 'web' && (
                <Pressable
                  onPress={() => Linking.openSettings()}
                  style={[styles.openSettingsBtn, { borderColor: palette.accentBorder }]}
                >
                  <Text variant="bodySmall" style={{ color: palette.accentPrimary, fontWeight: theme.fontWeight.semibold as any }}>
                    Open Settings
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />

          <View style={styles.settingGroup}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="phone-portrait-outline" size={14} color={palette.accentPrimary} />
              <Text variant="bodySmall" style={[styles.settingTitle, { color: palette.textMuted }]}>Vibration on Reminders</Text>
            </View>
            <View style={styles.segmentRow}>
              {renderSegmentPill({
                selected: vibrationEnabled,
                title: 'On',
                onPress: () => setVibrationEnabled(true),
                testID: 'settings-vibration-on',
              })}
              {renderSegmentPill({
                selected: !vibrationEnabled,
                title: 'Off',
                onPress: () => setVibrationEnabled(false),
                testID: 'settings-vibration-off',
              })}
            </View>
          </View>
        </Card>

        {/* ===== DATA & STORAGE ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          Data & Storage
        </Text>

        <Card elevated style={styles.settingsListCard}>
          {renderActionRow({
            icon: 'download-outline',
            label: 'Export Walk History',
            onPress: handleExportWalkHistory,
            testID: 'settings-export',
          })}
          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'trash-outline',
            label: 'Clear Walk History',
            onPress: handleClearWalkHistory,
            destructive: true,
            testID: 'settings-clear-history',
          })}
          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'refresh-outline',
            label: 'Clear Cache',
            onPress: handleClearCache,
            testID: 'settings-clear-cache',
          })}
        </Card>

        {/* ===== ABOUT ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          About
        </Text>

        <Card elevated style={styles.settingsListCard}>
          {renderActionRow({
            icon: 'information-circle-outline',
            label: 'App Version',
            onPress: () => {},
            rightText: `v${APP_VERSION}`,
            testID: 'settings-version',
          })}
          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'shield-checkmark-outline',
            label: 'Privacy Policy',
            onPress: () => { void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL); },
            testID: 'settings-privacy',
          })}
          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'document-text-outline',
            label: 'Terms of Service',
            onPress: () => { void WebBrowser.openBrowserAsync(TERMS_URL); },
            testID: 'settings-terms',
          })}
          <View style={[styles.settingDivider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'star-outline',
            label: 'Rate GapWalk',
            onPress: () => {
              const storeUrl = Platform.OS === 'ios'
                ? 'https://apps.apple.com/app/gapwalk/id0000000000'
                : 'https://play.google.com/store/apps/details?id=com.gapwalk.app';
              Linking.openURL(storeUrl).catch(() => {});
            },
            testID: 'settings-rate',
          })}
        </Card>

        {isE2E && (
          <Card elevated style={styles.e2eCard}>
            <View style={styles.settingLabelRow}>
              <AppIcon name="sync" size={14} color={palette.accentPrimary} />
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
      <SuccessToast
        visible={showSaveToast}
        message={saveToastMessage}
        onDismiss={() => setShowSaveToast(false)}
      />
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
    textTransform: 'uppercase',
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
  notifStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  openSettingsBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  actionRowPressed: {
    opacity: 0.6,
  },
  actionRowIcon: {
    marginRight: 10,
  },
  actionRowLabel: {
    flex: 1,
    fontWeight: theme.fontWeight.medium,
  },
  actionRowRight: {
    fontWeight: theme.fontWeight.medium,
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
