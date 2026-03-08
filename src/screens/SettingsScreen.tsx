import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Pressable, Linking, Switch } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
import { Modal as AppModal } from '../components/Modal';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import {
  WalkDisplayCard,
  ALL_WALK_DISPLAY_CARDS,
  WALK_DISPLAY_CARD_LABELS,
  NotificationTimerMode,
  NOTIFICATION_TIMER_MODE_LABELS,
} from '../types';
import { translateLiteral } from '../i18n';
import { plansRepo } from '../data/repositories/plansRepo';
import { notificationPlanActions } from '../services/notificationPlanActions';
import { analyticsRepo } from '../data/repositories/analyticsRepo';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { getDatabase } from '../data/db';
import { authStorage } from '../data/authStorage';
import { format } from 'date-fns';
import { androidWalkTracking } from '../services/androidWalkTracking';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const PRIVACY_POLICY_URL = 'https://gapwalk.com/privacy';
const TERMS_URL = 'https://gapwalk.com/terms';

/* ------------------------------------------------------------------ */
/*  SegmentPill                                                        */
/*  Self-contained themed pill. Computes ALL colours from themeMode    */
/*  prop so Android's native ripple layer never caches stale values.   */
/*  Background lives on a View; Pressable only handles ripple + tap.   */
/* ------------------------------------------------------------------ */
const SegmentPill: React.FC<{
  selected: boolean;
  title: string;
  onPress: () => void;
  testID: string;
  themeMode: 'dark' | 'light';
}> = React.memo(({ selected, title, onPress, testID, themeMode }) => {
  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';

  const bg = selected ? palette.accentPrimary : palette.bgSurface;
  const border = selected ? 'transparent' : palette.borderStrong;
  const textColor = selected ? palette.pillSelectedText : palette.textPrimary;
  const ripple = selected
    ? (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)')
    : palette.inputBg;

  return (
    <View
      key={`${testID}-${themeMode}`}
      style={[styles.pill, { backgroundColor: bg, borderColor: border }]}
    >
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web')
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        testID={testID}
        accessibilityLabel={testID}
        accessibilityRole="button"
        android_ripple={{ color: ripple }}
        style={styles.pillInner}
      >
        <Text variant="body" style={[styles.pillLabel, { color: textColor }]}>
          {title}
        </Text>
      </Pressable>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/*  SettingsScreen                                                     */
/* ------------------------------------------------------------------ */
export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const {
    themeMode, setThemeMode,
    language, setLanguage,
    distanceUnit, setDistanceUnit,
    firstDayOfWeek, setFirstDayOfWeek,
    vibrationEnabled, setVibrationEnabled,
    notificationTimerMode, setNotificationTimerMode,
    walkDisplayCards, setWalkDisplayCards,
  } = useAppStore();
  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';

  const baselineThemeModeRef = useRef(themeMode);
  const baselineLanguageRef = useRef(language);
  const baselineDistanceUnitRef = useRef(distanceUnit);
  const baselineFirstDayRef = useRef(firstDayOfWeek);
  const baselineVibrationRef = useRef(vibrationEnabled);
  const baselineNotificationTimerModeRef = useRef(notificationTimerMode);
  const baselineWalkDisplayCardsRef = useRef(walkDisplayCards);
  const themeModeRef = useRef(themeMode);
  const languageRef = useRef(language);
  const distanceUnitRef = useRef(distanceUnit);
  const firstDayRef = useRef(firstDayOfWeek);
  const vibrationRef = useRef(vibrationEnabled);
  const notificationTimerModeRef = useRef(notificationTimerMode);
  const walkDisplayCardsRef = useRef(walkDisplayCards);
  const allowExitRef = useRef(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState('Settings saved');
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void; destructive?: boolean } | null>(null);
  const showMessage = (title: string, message: string) => setMessageDialog({ title, message });
  const showBinaryConfirm = (title: string, message: string, confirmText: string, onConfirm: () => void, style: 'default' | 'destructive' = 'default') => setConfirmDialog({ title, message, confirmText, onConfirm, destructive: style === 'destructive' });
  const [exporting, setExporting] = useState(false);
  const hasUnsavedChangesRef = useRef(false);

  useEffect(() => { themeModeRef.current = themeMode; }, [themeMode]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { distanceUnitRef.current = distanceUnit; }, [distanceUnit]);
  useEffect(() => { firstDayRef.current = firstDayOfWeek; }, [firstDayOfWeek]);
  useEffect(() => { vibrationRef.current = vibrationEnabled; }, [vibrationEnabled]);
  useEffect(() => { notificationTimerModeRef.current = notificationTimerMode; }, [notificationTimerMode]);
  useEffect(() => { walkDisplayCardsRef.current = walkDisplayCards; }, [walkDisplayCards]);

  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
      baselineThemeModeRef.current = themeModeRef.current;
      baselineLanguageRef.current = languageRef.current;
      baselineDistanceUnitRef.current = distanceUnitRef.current;
      baselineFirstDayRef.current = firstDayRef.current;
      baselineVibrationRef.current = vibrationRef.current;
      baselineNotificationTimerModeRef.current = notificationTimerModeRef.current;
      baselineWalkDisplayCardsRef.current = walkDisplayCardsRef.current;
      hasUnsavedChangesRef.current = false;
      allowExitRef.current = false;
      return () => {};
    }, [])
  );

  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';

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
    vibrationEnabled !== baselineVibrationRef.current ||
    notificationTimerMode !== baselineNotificationTimerModeRef.current ||
    JSON.stringify(walkDisplayCards) !== JSON.stringify(baselineWalkDisplayCardsRef.current);

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
        setNotificationTimerMode(baselineNotificationTimerModeRef.current);
        setWalkDisplayCards(baselineWalkDisplayCardsRef.current);
        hasUnsavedChangesRef.current = false;
        allowExitRef.current = true;
        navigation.dispatch(event.data.action);
      };

      if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
        const ok = (globalThis as any).confirm(`${title}\n\n${message}`);
        if (ok) discardAndLeave();
        return;
      }

      showBinaryConfirm(title, message, translateLiteral('Discard', activeLanguage), discardAndLeave, 'destructive');
    });

    return unsubscribe;
  }, [navigation, setLanguage, setThemeMode, setDistanceUnit, setFirstDayOfWeek, setVibrationEnabled, setNotificationTimerMode, setWalkDisplayCards]);

  const handleBack = () => {
    navigation.navigate('Dashboard', { openMenu: true });
  };

  const handleReplayTour = () => {
    navigation.navigate('Dashboard', { startTour: true });
  };

  const handleSave = async () => {
    baselineThemeModeRef.current = themeModeRef.current;
    baselineLanguageRef.current = languageRef.current;
    baselineDistanceUnitRef.current = distanceUnitRef.current;
    baselineFirstDayRef.current = firstDayRef.current;
    baselineVibrationRef.current = vibrationRef.current;
    baselineNotificationTimerModeRef.current = notificationTimerModeRef.current;
    baselineWalkDisplayCardsRef.current = walkDisplayCardsRef.current;
    hasUnsavedChangesRef.current = false;
    allowExitRef.current = true;

    await authStorage.saveThemeMode(themeModeRef.current);
    await authStorage.saveLanguage(languageRef.current);
    await authStorage.saveDistanceUnit(distanceUnitRef.current);
    await authStorage.saveFirstDayOfWeek(firstDayRef.current);
    await authStorage.saveVibrationEnabled(vibrationRef.current);
    await authStorage.saveNotificationTimerMode(notificationTimerModeRef.current);
    await authStorage.saveWalkDisplayCards(walkDisplayCardsRef.current);

    if (androidWalkTracking.isSupported()) {
      await androidWalkTracking.updateNotificationTimerMode(notificationTimerModeRef.current);
    }

    setSaveToastMessage(t('Settings saved'));
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
        showMessage('No Data', 'There are no walk sessions to export yet.');
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

      const filename = `gapwalk-walks-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      const file = new File(Paths.cache, filename);
      await file.write(csv);

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Walk History',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        showMessage('Sharing not available', 'Your device does not support file sharing.');
      }
    } catch (error) {
      if (__DEV__) console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleClearWalkHistory = () => {
    showBinaryConfirm(
      'Clear Walk History',
      'This will permanently delete all your walk sessions, routes, and related data. This cannot be undone.',
      'Delete All',
      async () => {
        try {
          const db = await getDatabase();
          await db.runAsync('DELETE FROM walk_sessions');
          await db.runAsync('DELETE FROM walk_routes');
          await db.runAsync('DELETE FROM walk_pause_events');
          await db.runAsync('DELETE FROM walk_checkpoint');
          setSaveToastMessage(t('Walk history cleared'));
          setShowSaveToast(true);
        } catch (error) {
          if (__DEV__) console.error('Clear walk history failed:', error);
          showMessage('Error', 'Could not clear walk history. Please try again.');
        }
      },
      'destructive'
    );
  };

  const handleClearCache = async () => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM analytics_events');
      await db.runAsync('DELETE FROM crash_reports');
      setSaveToastMessage(t('Cache cleared'));
      setShowSaveToast(true);
    } catch (error) {
      if (__DEV__) console.error('Clear cache failed:', error);
    }
  };


  // --- E2E helpers ---

  const simulateNotificationStart = async () => {
    const first = (await plansRepo.getUpcomingPlans(1))[0];
    if (!first) {
      showMessage('No upcoming plan', 'Create a schedule first so we can simulate the start action.');
      return;
    }
    const result = await notificationPlanActions.canStartPlan(first.id);
    if (!result.allowed) {
      showMessage('Action blocked', 'The start action was blocked, likely because today\'s goal is already complete.');
      return;
    }
    navigation.navigate('Walking', { planId: first.id, startedFromNotification: true });
  };

  const simulateNotificationSkip = async () => {
    const first = (await plansRepo.getUpcomingPlans(1))[0];
    if (!first) {
      showMessage('No upcoming plan', 'Create a schedule first so we can simulate the skip action.');
      return;
    }
    await notificationPlanActions.skipGap(first.id);
    showMessage('Done', 'Skip action simulated for the next upcoming plan.');
  };

  const showTelemetrySnapshot = async () => {
    const events = await analyticsRepo.getRecentEvents(20);
    const crashes = await analyticsRepo.getRecentCrashes(5);
    showMessage('Telemetry Snapshot', `Recent events: ${events.length}\nRecent crashes: ${crashes.length}`);
  };

  // --- UI helpers ---

  const handleToggleWalkCard = (card: WalkDisplayCard) => {
    if (card === 'walkDuration') return; // always on
    const isOn = walkDisplayCards.includes(card);
    if (isOn) {
      if (walkDisplayCards.length <= 2) {
        showMessage('Minimum Cards', 'At least 2 cards must be visible on the walking screen.');
        return;
      }
      setWalkDisplayCards(walkDisplayCards.filter((c) => c !== card));
    } else {
      // Add in canonical order
      const ordered = ALL_WALK_DISPLAY_CARDS.filter((c) => walkDisplayCards.includes(c) || c === card);
      setWalkDisplayCards(ordered);
    }
  };

  const handleNotificationTimerMode = (mode: NotificationTimerMode) => {
    setNotificationTimerMode(mode);
  };

  const actionRipple = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';

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
      android_ripple={{ color: actionRipple }}
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

  // Force full remount when theme changes so every native view is recreated.
  const contentKey = `settings-${themeMode}-${focusKey}`;

  return (
    <Container scrollable key={contentKey}>
      <View style={styles.content}>
        <ScreenHeader
          title={t('Settings')}
          subtitle={t('Customize your GapWalk experience.')}
          onBack={handleBack}
          backTestID="settings-back"
          align="center"
          themeMode={themeMode}
        />

        {/* ===== GENERAL ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          {t('General')}
        </Text>

        <Card elevated style={styles.settingsCard}>
          {/* Appearance */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="moon-outline" size={16} color={palette.accentPrimary} />
              <Text variant="body" style={[styles.settingTitle, { color: palette.textPrimary }]}>
                {t('Appearance')}
              </Text>
            </View>
            <View style={styles.segmentRow}>
              <SegmentPill
                selected={themeMode === 'dark'}
                title={darkLabel}
                onPress={() => setThemeMode('dark')}
                testID="settings-theme-dark"
                themeMode={themeMode}
              />
              <SegmentPill
                selected={themeMode === 'light'}
                title={lightLabel}
                onPress={() => setThemeMode('light')}
                testID="settings-theme-light"
                themeMode={themeMode}
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />

          {/* Language */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="language-outline" size={16} color={palette.accentPrimary} />
              <Text variant="body" style={[styles.settingTitle, { color: palette.textPrimary }]}>
                {t('Language')}
              </Text>
            </View>
            <View style={styles.segmentRow}>
              <SegmentPill
                selected={language === 'en'}
                title={englishLabel}
                onPress={() => setLanguage('en')}
                testID="settings-lang-en"
                themeMode={themeMode}
              />
              <SegmentPill
                selected={language === 'es'}
                title={espanolLabel}
                onPress={() => setLanguage('es')}
                testID="settings-lang-es"
                themeMode={themeMode}
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />

          {/* Distance unit */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="speedometer-outline" size={16} color={palette.accentPrimary} />
              <Text variant="body" style={[styles.settingTitle, { color: palette.textPrimary }]}>
                {t('Distance Unit')}
              </Text>
            </View>
            <View style={styles.segmentRow}>
              <SegmentPill
                selected={distanceUnit === 'km'}
                title={t('Kilometers')}
                onPress={() => setDistanceUnit('km')}
                testID="settings-unit-km"
                themeMode={themeMode}
              />
              <SegmentPill
                selected={distanceUnit === 'mi'}
                title={t('Miles')}
                onPress={() => setDistanceUnit('mi')}
                testID="settings-unit-mi"
                themeMode={themeMode}
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />

          {/* Vibration */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="phone-portrait-outline" size={16} color={palette.accentPrimary} />
              <Text variant="body" style={[styles.settingTitle, { color: palette.textPrimary }]}>
                {t('Vibration')}
              </Text>
            </View>
            <View style={styles.segmentRow}>
              <SegmentPill
                selected={vibrationEnabled}
                title={t('On')}
                onPress={() => setVibrationEnabled(true)}
                testID="settings-vibration-on"
                themeMode={themeMode}
              />
              <SegmentPill
                selected={!vibrationEnabled}
                title={t('Off')}
                onPress={() => setVibrationEnabled(false)}
                testID="settings-vibration-off"
                themeMode={themeMode}
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />

          {/* Live notification timer */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="notifications-outline" size={16} color={palette.accentPrimary} />
              <Text variant="body" style={[styles.settingTitle, { color: palette.textPrimary }]}>
                {t('Live Notification Timer')}
              </Text>
            </View>
            <View style={styles.segmentRowStack}>
              {(['smart', 'elapsed', 'remaining'] as NotificationTimerMode[]).map((mode) => (
                <SegmentPill
                  key={mode}
                  selected={notificationTimerMode === mode}
                  title={NOTIFICATION_TIMER_MODE_LABELS[mode]}
                  onPress={() => handleNotificationTimerMode(mode)}
                  testID={`settings-notification-timer-${mode}`}
                  themeMode={themeMode}
                />
              ))}
            </View>
            <Text variant="bodySmall" style={[styles.walkCardHint, { color: palette.textMuted }]}>
              {t('Choose what the live walk notification timer shows.')}
            </Text>
          </View>
        </Card>

        {/* ===== WALK DISPLAY ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          {t('Walk Display')}
        </Text>

        <Card elevated style={styles.settingsCard}>
          {ALL_WALK_DISPLAY_CARDS.map((card, idx) => {
            const isOn = walkDisplayCards.includes(card);
            const isMandatory = card === 'walkDuration';
            return (
              <React.Fragment key={card}>
                {idx > 0 && <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />}
                <View style={styles.walkCardToggleRow}>
                  <View style={styles.settingLabelRow}>
                    <Ionicons
                      name={
                        card === 'walkDuration' ? 'time-outline' :
                        card === 'steps' ? 'footsteps-outline' :
                        card === 'distance' ? 'navigate-outline' :
                        card === 'calories' ? 'flame-outline' :
                        card === 'speed' ? 'speedometer-outline' :
                        'trophy-outline'
                      }
                      size={16}
                      color={isMandatory ? palette.textMuted : palette.accentPrimary}
                    />
                    <Text
                      variant="body"
                      style={[
                        styles.settingTitle,
                        { color: isMandatory ? palette.textMuted : palette.textPrimary },
                      ]}
                    >
                      {WALK_DISPLAY_CARD_LABELS[card]}
                    </Text>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={() => handleToggleWalkCard(card)}
                    disabled={isMandatory}
                    trackColor={{ false: palette.borderStrong, true: palette.accentPrimary }}
                    thumbColor={isOn ? palette.accentOnSolid : palette.bgSurface}
                    testID={`settings-walk-card-${card}`}
                  />
                </View>
              </React.Fragment>
            );
          })}
          <Text variant="bodySmall" style={[styles.walkCardHint, { color: palette.textMuted }]}>
            {t('Choose which cards appear on the walking screen. First 2 are always visible.')}
          </Text>
        </Card>

        {/* ===== DATA & STORAGE ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          {t('Data & Storage')}
        </Text>

        <Card elevated style={styles.settingsCard}>
          {renderActionRow({
            icon: 'download-outline',
            label: t('Export Walk History'),
            onPress: handleExportWalkHistory,
            testID: 'settings-export',
          })}
          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'trash-outline',
            label: t('Clear Walk History'),
            onPress: handleClearWalkHistory,
            destructive: true,
            testID: 'settings-clear-history',
          })}
          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'refresh-outline',
            label: t('Clear Cache'),
            onPress: handleClearCache,
            testID: 'settings-clear-cache',
          })}
        </Card>

        {/* ===== ABOUT ===== */}
        <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
          {t('About')}
        </Text>

        <Card elevated style={styles.settingsCard}>
          {renderActionRow({
            icon: 'information-circle-outline',
            label: t('App Version'),
            onPress: () => {},
            rightText: `v${APP_VERSION}`,
            testID: 'settings-version',
          })}
          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'shield-checkmark-outline',
            label: t('Privacy Policy'),
            onPress: () => { void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL); },
            testID: 'settings-privacy',
          })}
          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'document-text-outline',
            label: t('Terms of Service'),
            onPress: () => { void WebBrowser.openBrowserAsync(TERMS_URL); },
            testID: 'settings-terms',
          })}
          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'star-outline',
            label: t('Rate GapWalk'),
            onPress: () => {
              const storeUrl = Platform.OS === 'ios'
                ? 'https://apps.apple.com/app/gapwalk/id0000000000'
                : 'https://play.google.com/store/apps/details?id=com.gapwalk.app';
              Linking.openURL(storeUrl).catch(() => {});
            },
            testID: 'settings-rate',
          })}
          <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
          {renderActionRow({
            icon: 'help-circle-outline',
            label: t('Replay Tour'),
            onPress: handleReplayTour,
            testID: 'settings-replay-tour',
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
            title: t('Save'),
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
      <AppModal visible={messageDialog !== null} onClose={() => setMessageDialog(null)} title={messageDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{messageDialog?.message}</Text>
          <Button title="OK" onPress={() => setMessageDialog(null)} />
        </View>
      </AppModal>
      <AppModal visible={confirmDialog !== null} onClose={() => setConfirmDialog(null)} title={confirmDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{confirmDialog?.message}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Cancel" variant="secondary" onPress={() => setConfirmDialog(null)} style={{ flex: 1 }} />
            <Button title={confirmDialog?.confirmText ?? 'Yes'} variant={confirmDialog?.destructive ? 'danger' : 'primary'} onPress={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }} style={{ flex: 1 }} />
          </View>
        </View>
      </AppModal>
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
    marginBottom: 10,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  settingsCard: {
    marginBottom: 18,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  settingRow: {
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
  divider: {
    height: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentRowStack: {
    flexDirection: 'column',
    gap: 10,
  },
  pill: {
    flex: 1,
    minHeight: theme.layout.buttonHeight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pillLabel: {
    fontWeight: theme.fontWeight.semibold,
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
    marginBottom: 18,
  },
  stack: {
    gap: 10,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
  },
  walkCardToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  walkCardHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
});
