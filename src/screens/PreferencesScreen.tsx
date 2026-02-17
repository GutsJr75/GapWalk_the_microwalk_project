import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  StyleProp,
  TextStyle,
  TouchableOpacity,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppIcon, AppIconName } from '../components/AppIcon';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { Preferences, DEFAULT_PREFERENCES } from '../lib/types';
import { preferencesRepo } from '../lib/repositories/preferencesRepo';
import { notificationService, isNotificationsSupported } from '../lib/notifications';
import { syncNudgePlansForCurrentSchedule } from '../lib/scheduleSync';
import { SAVE_CONFIRM_ACTION, SAVE_CONFIRM_MESSAGE, SAVE_CONFIRM_TITLE } from '../lib/confirmMessages';
import { analyticsService } from '../lib/analytics';
import { useAppStore } from '../store';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'Preferences'>;
type TimeInputMode = 'hour' | 'minute';
type TimePeriod = 'AM' | 'PM';

/* â”€â”€â”€â”€â”€ time-input helpers â”€â”€â”€â”€â”€ */
const onlyDigits = (value: string): string => value.replace(/[^0-9]/g, '').slice(0, 2);
const normalizeHourTyping = (nextText: string): string => {
  const digits = onlyDigits(nextText);
  if (digits.length === 0) return '';
  if (digits.length === 1) {
    const first = digits[0];
    if (first === '0' || first === '1') return first;
    return `0${first}`;
  }
  const [first, second] = digits;
  if (first === '0') return second === '0' ? '0' : `0${second}`;
  if (first === '1') return Number(second) <= 2 ? `1${second}` : '1';
  return `0${first}`;
};
const normalizeMinuteTyping = (nextText: string): string => {
  const digits = onlyDigits(nextText);
  if (digits.length === 0) return '';
  if (digits.length === 1) {
    const first = Number(digits[0]);
    if (first >= 6) return `0${digits[0]}`;
    return digits[0];
  }
  const [first, second] = digits;
  if (Number(first) > 5) return `0${first}`;
  const n = Number(`${first}${second}`);
  return n <= 59 ? `${first}${second}` : first;
};
const normalizeTyping = (mode: TimeInputMode, nextText: string): string =>
  mode === 'hour' ? normalizeHourTyping(nextText) : normalizeMinuteTyping(nextText);
const isValidHour = (v: string): boolean => { if (v === '') return false; const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 12; };
const isValidMinute = (v: string): boolean => { if (v === '') return false; const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 59; };
const normalizeOnBlur = (mode: TimeInputMode, value: string): string => {
  if (value === '') return '';
  if (mode === 'hour') return isValidHour(value) ? String(Number(value)).padStart(2, '0') : '';
  return isValidMinute(value) ? String(Number(value)).padStart(2, '0') : '';
};
const to24Hour = (hourText: string, minuteText: string, period: TimePeriod): string | null => {
  if (!isValidHour(hourText) || !isValidMinute(minuteText)) return null;
  let h = Number(hourText) % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(Number(minuteText)).padStart(2, '0')}`;
};
const parse24Hour = (value: string): { hour24: number; minute: number } => {
  const [ht = '', mt = ''] = value.split(':');
  return { hour24: Math.max(0, Math.min(23, Number(ht) || 0)), minute: Math.max(0, Math.min(59, Number(mt) || 0)) };
};
const to12HourParts = (value: string): { hourRaw: string; minuteRaw: string; period: TimePeriod } => {
  const { hour24, minute } = parse24Hour(value);
  const period: TimePeriod = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hourRaw: String(hour12).padStart(2, '0'), minuteRaw: String(minute).padStart(2, '0'), period };
};
const formatTime12 = (value: string): string => {
  const { hour24, minute } = parse24Hour(value);
  const period: TimePeriod = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
};

/* â”€â”€â”€â”€â”€ sub-components â”€â”€â”€â”€â”€ */
interface TwoDigitTimeInputProps { mode: TimeInputMode; value: string; onChange: (v: string) => void; onBlurNormalize: () => void; placeholder: string; style: StyleProp<TextStyle>; placeholderTextColor?: string; }
const TwoDigitTimeInput: React.FC<TwoDigitTimeInputProps> = ({ mode, value, onChange, onBlurNormalize, placeholder, style, placeholderTextColor }) => (
  <TextInput
    style={style}
    value={value}
    onChangeText={(t) => onChange(normalizeTyping(mode, t))}
    onBlur={onBlurNormalize}
    keyboardType="number-pad"
    maxLength={2}
    placeholder={placeholder}
    placeholderTextColor={placeholderTextColor ?? theme.colors.textMuted}
    selectTextOnFocus
  />
);

/* â”€â”€ collapsible section â”€â”€ */
const Section: React.FC<{
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, defaultExpanded = false, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotateAnim = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;
  const { themeMode } = useAppStore();
  const palette = getThemePalette(themeMode);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotateAnim, { toValue: expanded ? 0 : 1, duration: 200, useNativeDriver: true }).start();
    setExpanded(e => !e);
  };

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Card style={styles.sectionCard} elevated>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTextWrap}>
          {icon && (
            <View style={styles.sectionIconWrap}>
              <AppIcon name={icon} size={14} color={theme.colors.accentPrimary} />
            </View>
          )}
          <View style={styles.sectionHeaderText}>
          <Text variant="body" style={styles.sectionTitle}>{title}</Text>
          {subtitle && <Text variant="muted" style={styles.sectionSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        <Animated.View
          style={[
            styles.chevronButton,
            {
              backgroundColor: palette.bgSurface,
              borderColor: palette.borderSoft,
              shadowColor: palette.shadow,
              transform: [{ rotate }],
            },
          ]}
        >
          <AppIcon name="chevronDown" size={15} color={palette.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      {expanded && <View style={styles.sectionBody}>{children}</View>}
    </Card>
  );
};

/* â”€â”€ radio option â”€â”€ */
const RadioOption: React.FC<{ selected: boolean; label: string; onPress: () => void }> = ({ selected, label, onPress }) => {
  const { themeMode } = useAppStore();
  const palette = getThemePalette(themeMode);
  const radioBorderColor = themeMode === 'dark' ? 'rgba(255,255,255,0.2)' : palette.borderStrong;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.radioRow}>
      <View style={[styles.radioCircle, { borderColor: radioBorderColor }, selected && styles.radioCircleActive]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text variant="bodySmall" style={selected ? styles.radioLabelActive : styles.radioLabelDefault}>{label}</Text>
    </TouchableOpacity>
  );
};

/* â”€â”€ info tooltip (mint accent, renders ABOVE the label) â”€â”€ */
const InfoTip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  const { themeMode } = useAppStore();
  const palette = getThemePalette(themeMode);
  const tooltipTheme = {
    backgroundColor: themeMode === 'dark' ? theme.colors.bgSurface : palette.bgSurfaceElevated,
    borderColor: themeMode === 'dark' ? 'rgba(46,233,166,0.25)' : 'rgba(46,233,166,0.45)',
    shadowColor: themeMode === 'dark' ? '#000' : '#0f172a',
  };

  return (
    <View style={styles.infoWrap}>
      <TouchableOpacity onPress={() => setShow(s => !s)} hitSlop={10} style={styles.infoBtn}>
        <View style={styles.infoCircle}>
          <Text style={styles.infoLetter}>i</Text>
        </View>
      </TouchableOpacity>
      {show && (
        <TouchableOpacity activeOpacity={1} onPress={() => setShow(false)} style={styles.tooltipBackdrop} />
      )}
      {show && (
        <View style={[styles.tooltip, tooltipTheme]}>
          <Text variant="bodySmall" style={styles.tooltipText}>{text}</Text>
        </View>
      )}
    </View>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• main screen â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const PreferencesScreen: React.FC<Props> = ({ navigation, route }) => {
  const { preferences: storedPreferences, setPreferences, setHasSetPreferences, setHasNotificationPermission, themeMode } = useAppStore();
  const manageMode = !!route.params?.manageMode;
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [hasChanges, setHasChanges] = useState(false);
  const [showQuietModal, setShowQuietModal] = useState(false);
  const [quietError, setQuietError] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [quietForm, setQuietForm] = useState(() => {
    const start = to12HourParts(DEFAULT_PREFERENCES.quietHoursStart);
    const end = to12HourParts(DEFAULT_PREFERENCES.quietHoursEnd);
    return { startHourRaw: start.hourRaw, startMinuteRaw: start.minuteRaw, startPeriod: start.period, endHourRaw: end.hourRaw, endMinuteRaw: end.minuteRaw, endPeriod: end.period };
  });
  const notificationsSupported = isNotificationsSupported;
  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';
  const themedInput = {
    backgroundColor: isDark ? theme.colors.bgApp : palette.bgSurfaceElevated,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : palette.borderStrong,
    color: palette.textPrimary,
  };
  const themedSurface = {
    backgroundColor: isDark ? theme.colors.bgApp : palette.bgSurfaceElevated,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : palette.borderStrong,
    borderWidth: 1,
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const fromDb = await preferencesRepo.get();
          if (!active) return;
          setPrefs(fromDb ?? storedPreferences ?? DEFAULT_PREFERENCES);
          setHasChanges(false);
        } catch (e) { console.error('Failed to load preferences:', e); }
      };
      load();
      return () => { active = false; };
    }, [storedPreferences])
  );

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  /** Helper: update multiple prefs at once */
  const updateMany = (changes: Partial<Preferences>) => {
    setPrefs(prev => ({ ...prev, ...changes }));
    setHasChanges(true);
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ManualSchedule');
  };

  /* â”€â”€ quiet hours â”€â”€ */
  const openQuietModal = () => {
    const start = to12HourParts(prefs.quietHoursStart);
    const end = to12HourParts(prefs.quietHoursEnd);
    setQuietForm({ startHourRaw: start.hourRaw, startMinuteRaw: start.minuteRaw, startPeriod: start.period, endHourRaw: end.hourRaw, endMinuteRaw: end.minuteRaw, endPeriod: end.period });
    setQuietError(null);
    setShowQuietModal(true);
  };
  const quietStart24 = to24Hour(quietForm.startHourRaw, quietForm.startMinuteRaw, quietForm.startPeriod);
  const quietEnd24 = to24Hour(quietForm.endHourRaw, quietForm.endMinuteRaw, quietForm.endPeriod);
  const canSaveQuiet = !!quietStart24 && !!quietEnd24;
  const applyQuietHours = () => {
    if (!quietStart24 || !quietEnd24) { setQuietError('Enter valid start and end times.'); return; }
    update('quietHoursStart', quietStart24);
    update('quietHoursEnd', quietEnd24);
    setQuietError(null);
    setShowQuietModal(false);
  };

  /* â”€â”€ validation â”€â”€ */
  const dailyTarget = prefs.dailyTargetMinutes;
  const notifCount = prefs.notificationCountPerDay;

  let dailyTargetError: string | null = null;
  if (dailyTarget < 5) dailyTargetError = 'Set at least 5 minutes for micro walks.';
  else if (dailyTarget > 60) dailyTargetError = 'Keep it under 60 min for micro walks.';

  const allowedMaxByTarget = Math.max(1, Math.floor(dailyTarget / 4));
  const ruleMax = dailyTarget > 60 ? 5 : allowedMaxByTarget;
  const effectiveMax = Math.min(15, ruleMax);
  let notifError: string | null = null;
  if (notifCount < 1) notifError = 'At least 1 notification required.';
  else if (notifCount > 15) notifError = 'Maximum 15 notifications allowed.';
  else if (notifCount > effectiveMax) notifError = dailyTarget > 60
    ? 'Target > 60 min limits notifications to 5.'
    : `Max ${effectiveMax} notifications for ${dailyTarget} min.`;

  let bufferError: string | null = null;
  if (prefs.bufferMinutes < 0) bufferError = 'Buffer cannot be negative.';
  else if (prefs.bufferMinutes > 30) bufferError = 'Please enter a value between 0 and 30 minutes.';

  let reminderGapError: string | null = null;
  if (prefs.notificationMinGapMinutes < 30) reminderGapError = 'Use at least 30 minutes between reminders.';
  else if (prefs.notificationMinGapMinutes > 360) reminderGapError = 'Maximum spacing is 6 hours (360 minutes).';

  const strictStepGoalRequired = prefs.strictnessMode === 'no_excuses';
  const stepGoalEnabled = strictStepGoalRequired || prefs.stepGoalEnabled;
  let stepGoalError: string | null = null;
  if (stepGoalEnabled) {
    if (prefs.stepGoal < 500 || prefs.stepGoal > 6000) {
      stepGoalError = 'Set a step goal between 500 and 6000.';
    }
  }

  const canContinue =
    !dailyTargetError &&
    !notifError &&
    !bufferError &&
    !reminderGapError &&
    !stepGoalError &&
    !savingPrefs;

  /* â”€â”€ save â”€â”€ */
  const savePreferences = async (p: Preferences) => {
    if (savingPrefs) return;
    setSavingPrefs(true);
    const strictnessMode = p.strictnessMode === 'no_excuses' ? 'no_excuses' : 'easygoing';
    const normalizedPrefs: Preferences = {
      ...p,
      notificationMinGapMinutes: Math.max(30, Math.min(360, Math.floor(p.notificationMinGapMinutes || 60))),
      strictnessMode,
      stepGoal: Math.max(500, Math.min(6000, Math.floor(p.stepGoal || DEFAULT_PREFERENCES.stepGoal))),
      stepGoalEnabled: strictnessMode === 'no_excuses' ? true : !!p.stepGoalEnabled,
    };
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await preferencesRepo.save(normalizedPrefs);
        setPreferences(normalizedPrefs);
        setHasSetPreferences(true);
        const perm = notificationsSupported ? await notificationService.requestPermissions() : false;
        setHasNotificationPermission(perm);
        try {
          await syncNudgePlansForCurrentSchedule(normalizedPrefs);
        } catch (e) { console.error(e); }
        analyticsService.track('preferences_saved', {
          dailyTargetMinutes: normalizedPrefs.dailyTargetMinutes,
          notificationCountPerDay: normalizedPrefs.notificationCountPerDay,
          whenToNotify: normalizedPrefs.whenToNotify,
          notifyDelayMinutes: normalizedPrefs.notifyDelayMinutes,
          strictnessMode: normalizedPrefs.strictnessMode,
          stepGoalEnabled: normalizedPrefs.stepGoalEnabled,
          stepGoal: normalizedPrefs.stepGoal,
        });
        setSavingPrefs(false);
        navigation.navigate('Dashboard');
        return;
      } catch (error) {
        lastError = error;
        console.error(`Save preferences attempt ${attempt + 1} failed:`, error);
        if (attempt === 0) await new Promise(r => setTimeout(r, 500));
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    Alert.alert('Could not save preferences', `Please try again.\n\nDetails: ${msg}`);
    setSavingPrefs(false);
  };

  const confirmAndSavePreferences = (
    nextPrefs: Preferences,
    options?: {
      title?: string;
      message?: string;
      actionLabel?: string;
      onConfirm?: () => void;
    }
  ) => {
    if (savingPrefs) return;
    const title = options?.title ?? SAVE_CONFIRM_TITLE;
    const message = options?.message ?? SAVE_CONFIRM_MESSAGE;
    const actionLabel = options?.actionLabel ?? SAVE_CONFIRM_ACTION;

    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(message);
      if (ok) {
        options?.onConfirm?.();
        void savePreferences(nextPrefs);
      }
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          onPress: () => {
            options?.onConfirm?.();
            void savePreferences(nextPrefs);
          },
        },
      ]
    );
  };

  const handleManageCancel = () => {
    if (!hasChanges) {
      navigation.navigate('Dashboard');
      return;
    }

    const discardMessage = 'If you cancel now, your unsaved changes will be lost. Continue';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(discardMessage)) {
        navigation.navigate('Dashboard');
      }
      return;
    }
    Alert.alert(
      'Discard changes?',
      discardMessage,
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.navigate('Dashboard') },
      ]
    );
  };

  const handleOnboardingContinue = () => {
    if (savingPrefs || !canContinue) return;
    if (!hasChanges) {
      confirmAndSavePreferences(DEFAULT_PREFERENCES, {
        title: 'Use recommended preferences',
        message: 'Continue with GapWalk recommended settings',
        actionLabel: 'Yes, continue',
      });
      return;
    }
    confirmAndSavePreferences(prefs);
  };

  const handleManageSave = () => {
    if (savingPrefs || !canContinue) return;
    confirmAndSavePreferences(prefs, {
      title: 'Save preferences?',
      message: 'Do you want to save these preference changes?',
      actionLabel: 'Save',
    });
  };

  /* â”€â”€ derive "When to Notify" selection key for the 3 simple radio options â”€â”€ */
  type NotifyChoice = 'gap' | '5min' | '10min';
  const getNotifyChoice = (): NotifyChoice => {
    if (prefs.whenToNotify === 'delay' && prefs.notifyDelayMinutes === 10) return '10min';
    if (prefs.whenToNotify === 'delay' && prefs.notifyDelayMinutes === 5) return '5min';
    return 'gap'; // 'now' or 'next_gap' or anything else â†’ default to "gap"
  };
  const setNotifyChoice = (choice: NotifyChoice) => {
    if (choice === 'gap') updateMany({ whenToNotify: 'now', notifyDelayMinutes: 0 });
    else if (choice === '5min') updateMany({ whenToNotify: 'delay', notifyDelayMinutes: 5 });
    else updateMany({ whenToNotify: 'delay', notifyDelayMinutes: 10 });
  };
  const notifyChoice = getNotifyChoice();

  /* â•â•â•â•â•â•â•â•â•â•â• render â•â•â•â•â•â•â•â•â•â•â• */
  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="Preferences"
          subtitle={manageMode ? 'Review your choices and save when ready.' : 'You can change this anytime.'}
          onBack={manageMode ? undefined : handleBack}
          backTestID={manageMode ? undefined : 'preferences-back'}
        />

        {/* â•â•â•â•â•â•â•â•â•â• Walking Goals â•â•â•â•â•â•â•â•â•â• */}
        <Section title="Walking Goals" subtitle="Target, buffer & reminders" icon="adjust" defaultExpanded>
          {/* Walking Goal */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="bodySmall" style={styles.fieldLabel}>Walking Goal</Text>
              <InfoTip text="Total walking minutes you aim for each day. GapWalk splits this across your free gaps." />
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, themedInput]}
                value={String(prefs.dailyTargetMinutes)}
                onChangeText={t => update('dailyTargetMinutes', parseInt(t) || 0)}
                keyboardType="number-pad"
                placeholderTextColor={palette.textMuted}
              />
              <Text variant="muted" style={styles.unit}>min</Text>
            </View>
            {dailyTargetError && <Text variant="bodySmall" style={styles.errorText}>{dailyTargetError}</Text>}
          </View>

          {/* Buffer (input field) */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="bodySmall" style={styles.fieldLabel}>Buffer</Text>
              <InfoTip text="Breathing room around your busy events so notifications aren't too tight together." />
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, themedInput]}
                value={String(prefs.bufferMinutes)}
                onChangeText={t => update('bufferMinutes', parseInt(t) || 0)}
                keyboardType="number-pad"
                placeholderTextColor={palette.textMuted}
              />
              <Text variant="muted" style={styles.unit}>min</Text>
            </View>
            {bufferError && <Text variant="bodySmall" style={styles.errorText}>{bufferError}</Text>}
          </View>

          {/* Reminders */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="bodySmall" style={styles.fieldLabel}>Reminders</Text>
              <InfoTip text="How many walk notifications GapWalk can send per day." />
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, themedInput]}
                value={String(prefs.notificationCountPerDay)}
                onChangeText={t => update('notificationCountPerDay', parseInt(t) || 0)}
                keyboardType="number-pad"
                placeholderTextColor={palette.textMuted}
              />
              <Text variant="muted" style={styles.unit}>per day</Text>
            </View>
            {notifError && <Text variant="bodySmall" style={styles.errorText}>{notifError}</Text>}
            {!notificationsSupported && (
              <Text variant="muted" style={styles.note}>Notifications are limited in Expo Go.</Text>
            )}
          </View>
        </Section>

        {/* â•â•â•â•â•â•â•â•â•â• Other Settings â•â•â•â•â•â•â•â•â•â• */}
        <Section title="Other Settings" subtitle="Notifications & quiet hours" icon="settings">
          {/* When to Notify (simplified radio) */}
          <View style={styles.field}>
            <Text variant="bodySmall" style={styles.fieldLabel}>When to notify</Text>
            <View style={styles.radioGroup}>
              <RadioOption
                selected={notifyChoice === 'gap'}
                label="When the app finds a gap"
                onPress={() => setNotifyChoice('gap')}
              />
              <RadioOption
                selected={notifyChoice === '5min'}
                label="5 minutes before the micro walk"
                onPress={() => setNotifyChoice('5min')}
              />
              <RadioOption
                selected={notifyChoice === '10min'}
                label="10 minutes before the micro walk"
                onPress={() => setNotifyChoice('10min')}
              />
            </View>
          </View>

          {/* Reminder spacing limiter */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="bodySmall" style={styles.fieldLabel}>Minimum time between reminders</Text>
              <InfoTip text="Prevents reminder overload. Recommended: 60 min. You can set between 30 min and 6 hours." />
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, themedInput]}
                value={String(prefs.notificationMinGapMinutes)}
                onChangeText={t => update('notificationMinGapMinutes', parseInt(t) || 0)}
                keyboardType="number-pad"
                placeholderTextColor={palette.textMuted}
              />
              <Text variant="muted" style={styles.unit}>min</Text>
            </View>
            {reminderGapError && <Text variant="bodySmall" style={styles.errorText}>{reminderGapError}</Text>}
          </View>

          {/* Strictness */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="bodySmall" style={styles.fieldLabel}>Strictness</Text>
              <InfoTip text="No Excuses enforces step-goal checks. Easygoing keeps walk timing flexible." />
            </View>
            <View style={styles.radioGroup}>
              <RadioOption
                selected={prefs.strictnessMode === 'easygoing'}
                label="Easygoing"
                onPress={() => updateMany({ strictnessMode: 'easygoing' })}
              />
              <RadioOption
                selected={prefs.strictnessMode === 'no_excuses'}
                label="No Excuses"
                onPress={() =>
                  updateMany({
                    strictnessMode: 'no_excuses',
                    stepGoalEnabled: true,
                    stepGoal: Math.max(500, prefs.stepGoal || DEFAULT_PREFERENCES.stepGoal),
                  })
                }
              />
            </View>
            <Text variant="muted" style={styles.note}>
              {prefs.strictnessMode === 'no_excuses'
                ? 'Step goal is required in No Excuses mode.'
                : 'Easygoing keeps your step goal optional.'}
            </Text>
          </View>

          {/* Step goal */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="bodySmall" style={styles.fieldLabel}>Step Goal</Text>
              <InfoTip text="Recommended: 1000 steps. Range: 500 to 6000." />
            </View>
            {prefs.strictnessMode === 'easygoing' && (
              <View style={styles.togglePillRow}>
                <TouchableOpacity
                  style={[
                    styles.togglePill,
                    themedSurface,
                    !prefs.stepGoalEnabled && styles.togglePillActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => update('stepGoalEnabled', false)}
                >
                  <Text
                    variant="bodySmall"
                    style={!prefs.stepGoalEnabled ? styles.togglePillTextActive : styles.togglePillText}
                  >
                    Off
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.togglePill,
                    themedSurface,
                    prefs.stepGoalEnabled && styles.togglePillActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => updateMany({
                    stepGoalEnabled: true,
                    stepGoal: Math.max(500, prefs.stepGoal || DEFAULT_PREFERENCES.stepGoal),
                  })}
                >
                  <Text
                    variant="bodySmall"
                    style={prefs.stepGoalEnabled ? styles.togglePillTextActive : styles.togglePillText}
                  >
                    On
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {stepGoalEnabled ? (
              <>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, themedInput]}
                    value={String(prefs.stepGoal)}
                    onChangeText={(t) => update('stepGoal', Math.max(0, parseInt(t, 10) || 0))}
                    keyboardType="number-pad"
                    placeholderTextColor={palette.textMuted}
                  />
                  <Text variant="muted" style={styles.unit}>steps</Text>
                </View>
                <Text variant="muted" style={styles.note}>Recommended: 1000 steps</Text>
              </>
            ) : (
              <Text variant="muted" style={styles.note}>Step goal is currently off.</Text>
            )}
            {stepGoalError && <Text variant="bodySmall" style={styles.errorText}>{stepGoalError}</Text>}
          </View>

          {/* Quiet Hours */}
          <View style={styles.field}>
            <Text variant="bodySmall" style={styles.fieldLabel}>Quiet Hours</Text>
            <TouchableOpacity onPress={openQuietModal} style={[styles.quietBtn, themedSurface]} activeOpacity={0.7}>
              <Text variant="body" style={styles.quietValue}>{formatTime12(prefs.quietHoursStart)} - {formatTime12(prefs.quietHoursEnd)}</Text>
              <Text variant="muted" style={styles.quietEdit}>Tap to edit</Text>
            </TouchableOpacity>
          </View>
        </Section>
      </View>

      {/* footer */}
      <View style={styles.footer}>
        <View style={styles.btnRow}>
          {manageMode ? (
            <>
              <Button
                title="Cancel"
                onPress={handleManageCancel}
                variant="danger"
                style={styles.btnHalf}
                disabled={savingPrefs}
                testID="preferences-cancel"
              />
              <Button
                title="Save"
                onPress={handleManageSave}
                style={styles.btnHalf}
                loading={savingPrefs}
                disabled={!canContinue}
                testID="preferences-save"
              />
            </>
          ) : (
            <Button
              title="Continue"
              onPress={handleOnboardingContinue}
              style={styles.btnHalf}
              loading={savingPrefs}
              disabled={!canContinue}
              testID="preferences-continue"
            />
          )}
        </View>
        <Text variant="muted" style={styles.privacy}>Your schedule stays private. Privacy is our top priority.</Text>
      </View>

      {/* quiet hours modal */}
      <Modal visible={showQuietModal} onClose={() => setShowQuietModal(false)} title="Quiet Hours">
        <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.qDesc}>Select the time frame when GapWalk will not send you notifications.</Text>
        <View style={styles.qTimeGroup}>
          <Text variant="muted">Start</Text>
          <View style={styles.qTimeInputRow}>
            <View style={styles.clockRow}>
              <TwoDigitTimeInput mode="hour" style={[styles.input, styles.timeInput, themedInput]} placeholderTextColor={palette.textMuted} value={quietForm.startHourRaw} onChange={v => setQuietForm(p => ({ ...p, startHourRaw: v }))} onBlurNormalize={() => setQuietForm(p => ({ ...p, startHourRaw: normalizeOnBlur('hour', p.startHourRaw) }))} placeholder="HH" />
              <Text variant="body">:</Text>
              <TwoDigitTimeInput mode="minute" style={[styles.input, styles.timeInput, themedInput]} placeholderTextColor={palette.textMuted} value={quietForm.startMinuteRaw} onChange={v => setQuietForm(p => ({ ...p, startMinuteRaw: v }))} onBlurNormalize={() => setQuietForm(p => ({ ...p, startMinuteRaw: normalizeOnBlur('minute', p.startMinuteRaw) }))} placeholder="MM" />
            </View>
            <View style={styles.periodRow}>
              {(['AM', 'PM'] as const).map(per => (
                <TouchableOpacity key={`qs-${per}`} style={[styles.periodBtn, themedSurface, quietForm.startPeriod === per && styles.periodBtnActive]} onPress={() => setQuietForm(p => ({ ...p, startPeriod: per }))}>
                  <Text variant="bodySmall" color={quietForm.startPeriod === per ? theme.colors.bgApp : theme.colors.textPrimary}>{per}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.qTimeGroup}>
          <Text variant="muted">End</Text>
          <View style={styles.qTimeInputRow}>
            <View style={styles.clockRow}>
              <TwoDigitTimeInput mode="hour" style={[styles.input, styles.timeInput, themedInput]} placeholderTextColor={palette.textMuted} value={quietForm.endHourRaw} onChange={v => setQuietForm(p => ({ ...p, endHourRaw: v }))} onBlurNormalize={() => setQuietForm(p => ({ ...p, endHourRaw: normalizeOnBlur('hour', p.endHourRaw) }))} placeholder="HH" />
              <Text variant="body">:</Text>
              <TwoDigitTimeInput mode="minute" style={[styles.input, styles.timeInput, themedInput]} placeholderTextColor={palette.textMuted} value={quietForm.endMinuteRaw} onChange={v => setQuietForm(p => ({ ...p, endMinuteRaw: v }))} onBlurNormalize={() => setQuietForm(p => ({ ...p, endMinuteRaw: normalizeOnBlur('minute', p.endMinuteRaw) }))} placeholder="MM" />
            </View>
            <View style={styles.periodRow}>
              {(['AM', 'PM'] as const).map(per => (
                <TouchableOpacity key={`qe-${per}`} style={[styles.periodBtn, themedSurface, quietForm.endPeriod === per && styles.periodBtnActive]} onPress={() => setQuietForm(p => ({ ...p, endPeriod: per }))}>
                  <Text variant="bodySmall" color={quietForm.endPeriod === per ? theme.colors.bgApp : theme.colors.textPrimary}>{per}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        {!!quietError && <Text variant="muted" style={styles.qError}>{quietError}</Text>}
        <Button title="Done" onPress={applyQuietHours} disabled={!canSaveQuiet} />
      </Modal>
    </Container>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• styles â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.lg,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },

  /* section */
  sectionCard: { marginBottom: 16, paddingVertical: 0, paddingHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  sectionHeaderTextWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  sectionIconWrap: { marginTop: 2 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontWeight: theme.fontWeight.semibold },
  sectionSubtitle: { fontSize: theme.fontSize.xs, marginTop: 2 },
  chevronButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionBody: { paddingHorizontal: 16, paddingBottom: 16 },

  /* fields */
  field: { marginBottom: 22, zIndex: 1 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, zIndex: 10 },
  fieldLabel: { fontWeight: theme.fontWeight.semibold, color: theme.colors.textPrimary },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  unit: { minWidth: 48 },
  note: { marginTop: 6, fontSize: theme.fontSize.xs },

  /* radio */
  radioGroup: { gap: 4, marginTop: 8 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: { borderColor: theme.colors.accentPrimary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accentPrimary },
  radioLabelDefault: { color: theme.colors.textPrimary },
  radioLabelActive: { color: theme.colors.accentPrimary, fontWeight: theme.fontWeight.semibold },
  togglePillRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  togglePill: {
    flex: 1,
    minHeight: 38,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePillActive: {
    borderColor: theme.colors.accentPrimary,
    backgroundColor: 'rgba(46,233,166,0.12)',
  },
  togglePillText: { color: theme.colors.textPrimary },
  togglePillTextActive: { color: theme.colors.accentPrimary, fontWeight: theme.fontWeight.semibold },

  /* info tooltip (mint accent) */
  infoWrap: { position: 'relative', zIndex: 100 },
  infoBtn: { padding: 2 },
  infoCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: theme.colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLetter: {
    fontSize: 9,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.accentPrimary,
    lineHeight: 11,
  },
  tooltipBackdrop: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
  },
  tooltip: {
    position: 'absolute',
    bottom: 28,
    left: -8,
    width: 240,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,233,166,0.25)',
    zIndex: 999,
    elevation: 20,
    // shadow for native
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tooltipText: { color: theme.colors.textPrimary, lineHeight: 18, fontSize: theme.fontSize.sm },

  /* quiet hours */
  quietBtn: {
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 6,
  },
  quietValue: { fontWeight: theme.fontWeight.medium },
  quietEdit: { fontSize: theme.fontSize.xs },

  /* footer */
  footer: { paddingHorizontal: theme.layout.contentHorizontal, paddingBottom: 20, alignSelf: 'center', width: '100%', maxWidth: theme.layout.contentMaxWidth },
  btnRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  btnHalf: { flex: 1 },
  privacy: { textAlign: 'center' },

  /* quiet modal */
  qDesc: { marginBottom: 16, textAlign: 'center' },
  qTimeGroup: { marginBottom: 10 },
  qTimeInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: { flex: 0, width: 56, textAlign: 'center' },
  periodRow: { flexDirection: 'row', gap: 4 },
  periodBtn: { borderRadius: theme.borderRadius.sm, backgroundColor: theme.colors.bgApp, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 8, minWidth: 42 },
  periodBtnActive: { backgroundColor: theme.colors.accentPrimary },
  qError: { color: theme.colors.warning, textAlign: 'center', marginBottom: 10 },

  /* validation */
  errorText: { color: theme.colors.error, marginTop: 6, fontSize: theme.fontSize.sm, lineHeight: 18 },
});
