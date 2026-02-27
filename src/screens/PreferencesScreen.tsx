import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  StyleProp,
  TextStyle,
  TouchableOpacity,
  Pressable,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal as RNModal,
  useWindowDimensions,
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
import { screenChrome } from '../theme/screenChrome';
import { getThemePalette } from '../theme/palette';
import { Preferences, DEFAULT_PREFERENCES, PreferredWalkingPeriod } from '../lib/types';
import { preferencesRepo } from '../lib/repositories/preferencesRepo';
import { syncNudgePlansForCurrentSchedule } from '../lib/scheduleSync';
import {
  SAVE_CONFIRM_ACTION,
  SAVE_CONFIRM_DECLINE,
  SAVE_CONFIRM_MESSAGE,
  SAVE_CONFIRM_TITLE,
} from '../lib/confirmMessages';
import { analyticsService } from '../lib/analytics';
import { translateLiteral } from '../lib/i18n';
import { useAppStore } from '../store';
import { requestAllPermissions } from '../lib/permissions';
import { toUserFriendlyError } from '../lib/errorMessages';

const isFabric = !!(globalThis as any).nativeFabricUIManager;

if (Platform.OS === 'android' && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'Preferences'>;
type TimeInputMode = 'hour' | 'minute';
type TimePeriod = 'AM' | 'PM';

interface InfoAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ActiveInfoState {
  id: string;
  text: string;
  anchor: InfoAnchorRect;
}

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

const buildPreferencesSignature = (prefs: Preferences): string => JSON.stringify({
  dailyTargetMinutes: prefs.dailyTargetMinutes,
  bufferMinutes: prefs.bufferMinutes,
  notificationCountPerDay: prefs.notificationCountPerDay,
  notificationMinGapMinutes: prefs.notificationMinGapMinutes,
  whenToNotify: prefs.whenToNotify,
  notifyDelayMinutes: prefs.notifyDelayMinutes,
  quietHoursStart: prefs.quietHoursStart,
  quietHoursEnd: prefs.quietHoursEnd,
  strictnessMode: prefs.strictnessMode,
  stepGoalEnabled: prefs.stepGoalEnabled,
  stepGoal: prefs.stepGoal,
  preferredWalkingPeriodsEnabled: prefs.preferredWalkingPeriodsEnabled,
  preferredWalkingPeriods: (prefs.preferredWalkingPeriods ?? []).map((period) => ({
    start: period.start,
    end: period.end,
  })),
});

const MAX_PREFERRED_PERIODS = 5;
const DEFAULT_PREFERRED_PERIOD: PreferredWalkingPeriod = { start: '09:00', end: '11:00' };

interface PreferredPeriodForm {
  id: string;
  startHourRaw: string;
  startMinuteRaw: string;
  startPeriod: TimePeriod;
  endHourRaw: string;
  endMinuteRaw: string;
  endPeriod: TimePeriod;
}

const makePreferredPeriodId = (): string =>
  `pref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const toPreferredForm = (period: PreferredWalkingPeriod, id: string = makePreferredPeriodId()): PreferredPeriodForm => {
  const start = to12HourParts(period.start);
  const end = to12HourParts(period.end);
  return {
    id,
    startHourRaw: start.hourRaw,
    startMinuteRaw: start.minuteRaw,
    startPeriod: start.period,
    endHourRaw: end.hourRaw,
    endMinuteRaw: end.minuteRaw,
    endPeriod: end.period,
  };
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
  icon?: AppIconName;
  defaultExpanded?: boolean;
  onFirstExpand?: () => void;
  children: React.ReactNode;
}> = ({ title, icon, defaultExpanded = false, onFirstExpand, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasReportedExpand = useRef(false);
  const rotateAnim = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;
  const { themeMode } = useAppStore();
  const palette = getThemePalette(themeMode);

  React.useEffect(() => {
    if (expanded && onFirstExpand && !hasReportedExpand.current) {
      hasReportedExpand.current = true;
      onFirstExpand();
    }
  }, [expanded, onFirstExpand]);

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
  const radioBorderColor = palette.borderStrong;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.radioRow}>
      <View style={[styles.radioCircle, { borderColor: radioBorderColor }, selected && styles.radioCircleActive]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text variant="bodySmall" style={selected ? styles.radioLabelActive : styles.radioLabelDefault}>{label}</Text>
    </TouchableOpacity>
  );
};

/* â”€â”€ info trigger â”€â”€ */
const InfoTip: React.FC<{
  id: string;
  text: string;
  activeInfoId: string | null;
  onToggle: (next: ActiveInfoState) => void;
}> = ({ id, text, activeInfoId, onToggle }) => {
  const anchorRef = useRef<View>(null);
  const isActive = activeInfoId === id;

  const handlePress = useCallback(() => {
    if (!anchorRef.current) return;
    anchorRef.current.measureInWindow((x, y, width, height) => {
      onToggle({
        id,
        text,
        anchor: { x, y, width, height },
      });
    });
  }, [id, onToggle, text]);

  return (
    <View ref={anchorRef} collapsable={false} style={styles.infoWrap}>
      <TouchableOpacity onPress={handlePress} hitSlop={10} style={styles.infoBtn}>
        <View style={[styles.infoCircle, isActive && styles.infoCircleActive]}>
          <Text style={styles.infoLetter}>i</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• main screen â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const PreferencesScreen: React.FC<Props> = ({ navigation, route }) => {
  const { preferences: storedPreferences, setPreferences, setHasSetPreferences, setHasCompletedOnboarding, setHasNotificationPermission, setHasLocationPermission, setHasActivityPermission, setHasRequestedPermissions, themeMode, setThemeMode, language, setLanguage } = useAppStore();
  const manageMode = !!route.params?.manageMode;
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [hasChanges, setHasChanges] = useState(false);
  const [savedPrefsSnapshot, setSavedPrefsSnapshot] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [initialPrefsSignature, setInitialPrefsSignature] = useState<string>(() => buildPreferencesSignature(DEFAULT_PREFERENCES));
  const [manageScreenMode, setManageScreenMode] = useState<'view' | 'edit'>(manageMode ? 'view' : 'edit');
  // Onboarding: user must open each section at least once before Continue (can still use recommended).
  const [hasSeenWalkingGoals, setHasSeenWalkingGoals] = useState(false);
  const [hasSeenNotifications, setHasSeenNotifications] = useState(false);
  const [hasSeenAdvanced, setHasSeenAdvanced] = useState(false);
  const [showQuietModal, setShowQuietModal] = useState(false);
  const [showPreferredModal, setShowPreferredModal] = useState(false);
  const [quietError, setQuietError] = useState<string | null>(null);
  const [preferredError, setPreferredError] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [activeInfo, setActiveInfo] = useState<ActiveInfoState | null>(null);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [quietForm, setQuietForm] = useState(() => {
    const start = to12HourParts(DEFAULT_PREFERENCES.quietHoursStart);
    const end = to12HourParts(DEFAULT_PREFERENCES.quietHoursEnd);
    return { startHourRaw: start.hourRaw, startMinuteRaw: start.minuteRaw, startPeriod: start.period, endHourRaw: end.hourRaw, endMinuteRaw: end.minuteRaw, endPeriod: end.period };
  });
  const [preferredForm, setPreferredForm] = useState<PreferredPeriodForm[]>([
    toPreferredForm(DEFAULT_PREFERRED_PERIOD),
  ]);
  const allowNextBeforeRemoveRef = useRef(false);
  const isManageViewOnly = manageMode && manageScreenMode === 'view';
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
  const infoOverlayTheme = {
    backgroundColor: isDark ? theme.colors.bgSurface : palette.bgSurfaceElevated,
    borderColor: isDark ? 'rgba(46,233,166,0.36)' : 'rgba(18,120,92,0.32)',
    shadowColor: palette.shadow,
  };

  const closeInfoOverlay = useCallback(() => {
    setActiveInfo(null);
  }, []);

  const handleInfoToggle = useCallback((next: ActiveInfoState) => {
    setActiveInfo((prev) => (prev?.id === next.id ? null : next));
  }, []);

  const infoOverlayPosition = useMemo(() => {
    if (!activeInfo) return null;
    const tooltipWidth = Math.min(280, Math.max(220, viewportWidth - 32));
    const anchorCenter = activeInfo.anchor.x + (activeInfo.anchor.width / 2);
    const clampedLeft = Math.min(
      Math.max(16, anchorCenter - (tooltipWidth / 2)),
      Math.max(16, viewportWidth - tooltipWidth - 16)
    );
    const estimatedHeight = 160;
    const belowTop = activeInfo.anchor.y + activeInfo.anchor.height + 10;
    const aboveTop = activeInfo.anchor.y - estimatedHeight - 10;
    const top = belowTop + estimatedHeight <= viewportHeight - 16
      ? belowTop
      : Math.max(16, aboveTop);
    return {
      left: clampedLeft,
      top,
      width: tooltipWidth,
    };
  }, [activeInfo, viewportHeight, viewportWidth]);

  useEffect(() => {
    setManageScreenMode(manageMode ? 'view' : 'edit');
  }, [manageMode]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const fromDb = await preferencesRepo.get();
          if (!active) return;
          const nextPrefs = fromDb ?? storedPreferences ?? DEFAULT_PREFERENCES;
          setPrefs(nextPrefs);
          setSavedPrefsSnapshot(nextPrefs);
          setInitialPrefsSignature(buildPreferencesSignature(nextPrefs));
          const periodSeed = nextPrefs.preferredWalkingPeriods.length > 0
            ? nextPrefs.preferredWalkingPeriods
            : [DEFAULT_PREFERRED_PERIOD];
          setPreferredForm(periodSeed.slice(0, MAX_PREFERRED_PERIODS).map((p) => toPreferredForm(p)));
        } catch (e) { console.error('Failed to load preferences:', e); }
      };
      load();
      return () => {
        active = false;
        closeInfoOverlay();
      };
    }, [closeInfoOverlay, storedPreferences])
  );

  useEffect(() => {
    const unsubscribeBlur = navigation.addListener('blur', closeInfoOverlay);
    return unsubscribeBlur;
  }, [closeInfoOverlay, navigation]);

  useEffect(() => {
    setHasChanges(buildPreferencesSignature(prefs) !== initialPrefsSignature);
  }, [initialPrefsSignature, prefs]);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    if (isManageViewOnly) return;
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  /** Helper: update multiple prefs at once */
  const updateMany = (changes: Partial<Preferences>) => {
    if (isManageViewOnly) return;
    setPrefs(prev => ({ ...prev, ...changes }));
  };

  const runAllowedNavigation = useCallback((action: () => void) => {
    allowNextBeforeRemoveRef.current = true;
    action();
  }, []);

  const confirmDiscardPreferenceChanges = useCallback((
    onDiscard: () => void,
    options?: {
      title?: string;
      message?: string;
    }
  ) => {
    if (!hasChanges) {
      onDiscard();
      return;
    }

    const discardTitle = options?.title ?? 'Discard preference changes?';
    const discardMessage = options?.message ?? 'Your unsaved preference changes will be lost. Do you want to leave this screen?';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${discardTitle}\n\n${discardMessage}`)) {
        onDiscard();
      }
      return;
    }
    Alert.alert(
      discardTitle,
      discardMessage,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: onDiscard },
      ]
    );
  }, [hasChanges]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowNextBeforeRemoveRef.current) {
        allowNextBeforeRemoveRef.current = false;
        return;
      }
      if (!hasChanges || savingPrefs) return;

      e.preventDefault();
      confirmDiscardPreferenceChanges(() => {
        allowNextBeforeRemoveRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return unsubscribe;
  }, [confirmDiscardPreferenceChanges, hasChanges, navigation, savingPrefs]);

  /* â”€â”€ quiet hours â”€â”€ */
  const openQuietModal = () => {
    if (isManageViewOnly) return;
    closeInfoOverlay();
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
    if (isManageViewOnly) return;
    if (!quietStart24 || !quietEnd24) { setQuietError('Enter valid start and end times.'); return; }
    update('quietHoursStart', quietStart24);
    update('quietHoursEnd', quietEnd24);
    setQuietError(null);
    setShowQuietModal(false);
  };

  const openPreferredModal = () => {
    if (isManageViewOnly) return;
    closeInfoOverlay();
    const seed = prefs.preferredWalkingPeriods.length > 0
      ? prefs.preferredWalkingPeriods
      : [DEFAULT_PREFERRED_PERIOD];
    setPreferredForm(seed.slice(0, MAX_PREFERRED_PERIODS).map((period) => toPreferredForm(period)));
    setPreferredError(null);
    setShowPreferredModal(true);
  };

  const updatePreferredFormById = (id: string, patch: Partial<PreferredPeriodForm>) => {
    setPreferredForm((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addPreferredPeriodForm = () => {
    if (preferredForm.length >= MAX_PREFERRED_PERIODS) return;
    // Check if default period already exists to prevent duplicates
    const isDuplicate = preferredForm.some(
      (item) => {
        const existingStart = to24Hour(item.startHourRaw, item.startMinuteRaw, item.startPeriod);
        const existingEnd = to24Hour(item.endHourRaw, item.endMinuteRaw, item.endPeriod);
        return existingStart === DEFAULT_PREFERRED_PERIOD.start && existingEnd === DEFAULT_PREFERRED_PERIOD.end;
      }
    );
    // Use a different default if duplicate would be created
    const newPeriod = isDuplicate
      ? { start: '14:00', end: '16:00' }
      : DEFAULT_PREFERRED_PERIOD;
    // Also check if this alternative already exists
    const altDuplicate = isDuplicate && preferredForm.some(
      (item) => {
        const existingStart = to24Hour(item.startHourRaw, item.startMinuteRaw, item.startPeriod);
        const existingEnd = to24Hour(item.endHourRaw, item.endMinuteRaw, item.endPeriod);
        return existingStart === newPeriod.start && existingEnd === newPeriod.end;
      }
    );
    const finalPeriod = altDuplicate ? { start: '17:00', end: '19:00' } : newPeriod;
    setPreferredForm((prev) => [...prev, toPreferredForm(finalPeriod)]);
  };

  const removePreferredPeriodForm = (id: string) => {
    setPreferredForm((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((item) => item.id !== id);
    });
  };

  const enablePreferredPeriods = () => {
    const nextPeriods = (prefs.preferredWalkingPeriods.length > 0
      ? prefs.preferredWalkingPeriods
      : [DEFAULT_PREFERRED_PERIOD]).slice(0, MAX_PREFERRED_PERIODS);
    updateMany({
      preferredWalkingPeriodsEnabled: true,
      preferredWalkingPeriods: nextPeriods,
    });
    setPreferredForm(nextPeriods.map((period) => toPreferredForm(period)));
    setPreferredError(null);
  };

  const disablePreferredPeriods = () => {
    update('preferredWalkingPeriodsEnabled', false);
    setPreferredError(null);
  };

  const applyPreferredPeriods = () => {
    if (preferredForm.length === 0) {
      setPreferredError('Add at least one preferred walking period.');
      return;
    }
    const nextPeriods: PreferredWalkingPeriod[] = [];
    const seen = new Set<string>();
    for (const item of preferredForm) {
      const start = to24Hour(item.startHourRaw, item.startMinuteRaw, item.startPeriod);
      const end = to24Hour(item.endHourRaw, item.endMinuteRaw, item.endPeriod);
      if (!start || !end) {
        setPreferredError('Enter valid start and end times for each period.');
        return;
      }
      if (start === end) {
        setPreferredError('Start and end times cannot be the same.');
        return;
      }
      const key = `${start}-${end}`;
      if (seen.has(key)) {
        setPreferredError('Duplicate periods are not allowed. Each period must be unique.');
        return;
      }
      seen.add(key);
      nextPeriods.push({ start, end });
    }
    updateMany({
      preferredWalkingPeriodsEnabled: true,
      preferredWalkingPeriods: nextPeriods.slice(0, MAX_PREFERRED_PERIODS),
    });
    setPreferredError(null);
    setShowPreferredModal(false);
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

  let preferredPeriodsError: string | null = null;
  if (prefs.preferredWalkingPeriodsEnabled) {
    if (prefs.preferredWalkingPeriods.length === 0) {
      preferredPeriodsError = 'Add at least one preferred walking period.';
    } else if (prefs.preferredWalkingPeriods.length > MAX_PREFERRED_PERIODS) {
      preferredPeriodsError = 'You can add up to 5 preferred periods.';
    } else if (prefs.preferredWalkingPeriods.some((period) => !period.start || !period.end || period.start === period.end)) {
      preferredPeriodsError = 'Each preferred period needs a valid start and end time.';
    }
  }

  const hasSeenAllSections = hasSeenWalkingGoals && hasSeenNotifications && hasSeenAdvanced;
  const canContinue =
    !dailyTargetError &&
    !notifError &&
    !bufferError &&
    !reminderGapError &&
    !stepGoalError &&
    !preferredPeriodsError &&
    !savingPrefs &&
    (manageMode || hasSeenAllSections);

  /* â”€â”€ save â”€â”€ */
  const savePreferences = async (p: Preferences) => {
    if (savingPrefs) return;
    setSavingPrefs(true);
    const strictnessMode = p.strictnessMode === 'no_excuses' ? 'no_excuses' : 'easygoing';
    const normalizedPreferredWalkingPeriods = (p.preferredWalkingPeriods || [])
      .filter((period) => !!period.start && !!period.end && period.start !== period.end)
      .slice(0, MAX_PREFERRED_PERIODS);
    const normalizedPrefs: Preferences = {
      ...p,
      notificationMinGapMinutes: Math.max(30, Math.min(360, Math.floor(p.notificationMinGapMinutes || 60))),
      strictnessMode,
      stepGoal: Math.max(500, Math.min(6000, Math.floor(p.stepGoal || DEFAULT_PREFERENCES.stepGoal))),
      stepGoalEnabled: strictnessMode === 'no_excuses' ? true : !!p.stepGoalEnabled,
      preferredWalkingPeriodsEnabled:
        !!p.preferredWalkingPeriodsEnabled && normalizedPreferredWalkingPeriods.length > 0,
      preferredWalkingPeriods: normalizedPreferredWalkingPeriods,
    };
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await preferencesRepo.save(normalizedPrefs);
        setPreferences(normalizedPrefs);
        setPrefs(normalizedPrefs);
        setSavedPrefsSnapshot(normalizedPrefs);
        setInitialPrefsSignature(buildPreferencesSignature(normalizedPrefs));
        setHasSetPreferences(true);
        setHasCompletedOnboarding(true);

        // Request ALL permissions (location, notifications, activity recognition)
        try {
          const permResults = await requestAllPermissions();
          setHasNotificationPermission(permResults.notifications);
          setHasActivityPermission(permResults.activityRecognition);
          setHasRequestedPermissions(true);
        } catch (e) {
          if (__DEV__) console.warn('Permission request failed during onboarding:', e);
        }

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
          preferredWalkingPeriodsEnabled: normalizedPrefs.preferredWalkingPeriodsEnabled,
          preferredWalkingPeriodsCount: normalizedPrefs.preferredWalkingPeriods.length,
        });
        setSavingPrefs(false);
        if (manageMode) {
          setManageScreenMode('view');
          if (Platform.OS === 'web' && typeof (globalThis as any).alert === 'function') {
            (globalThis as any).alert('Preferences saved.\n\nYour preference changes were updated.');
          } else {
            Alert.alert('Preferences saved', 'Your preference changes were updated.');
          }
          return;
        }
        runAllowedNavigation(() => {
          navigation.navigate('Dashboard');
        });
        return;
      } catch (error) {
        lastError = error;
        if (__DEV__) console.error(`Save preferences attempt ${attempt + 1} failed:`, error);
        if (attempt === 0) await new Promise(r => setTimeout(r, 500));
      }
    }
    const msg = toUserFriendlyError(lastError);
    Alert.alert('Could Not Save', msg);
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
        { text: SAVE_CONFIRM_DECLINE, style: 'cancel' },
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

  const handleManageBackToOptions = () => {
    confirmDiscardPreferenceChanges(
      () => runAllowedNavigation(() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Dashboard');
      }),
      {
        title: 'Leave preferences?',
        message: 'Your unsaved preference changes will be lost. Do you want to go back?',
      }
    );
  };

  const handleManageStartEdit = () => {
    setManageScreenMode('edit');
  };

  const handleManageCancelEdit = () => {
    if (!hasChanges) {
      setManageScreenMode('view');
      return;
    }
    confirmDiscardPreferenceChanges(
      () => {
        setPrefs(savedPrefsSnapshot);
        setInitialPrefsSignature(buildPreferencesSignature(savedPrefsSnapshot));
        setShowQuietModal(false);
        setShowPreferredModal(false);
        setQuietError(null);
        setPreferredError(null);
        setManageScreenMode('view');
      },
      {
        title: 'Discard preference changes?',
        message: 'This will discard your unsaved preference changes.',
      }
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
    if (savingPrefs || !canContinue || !hasChanges) return;
    confirmAndSavePreferences(prefs, {
      title: 'Save preference changes?',
      message: 'Do you want to update these preference changes?',
      actionLabel: 'Yes, Save',
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
  const preferredPeriodsList = prefs.preferredWalkingPeriods
    .slice(0, MAX_PREFERRED_PERIODS)
    .map((period) => `${formatTime12(period.start)} - ${formatTime12(period.end)}`);
  const preferredPeriodsDisplay = preferredPeriodsList.length > 0
    ? preferredPeriodsList.join('\n')
    : 'No preferred period selected.';

  /* â•â•â•â•â•â•â•â•â•â•â• render â•â•â•â•â•â•â•â•â•â•â• */
  return (
    <Container>
      <View style={styles.screen}>
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={closeInfoOverlay}
          onMomentumScrollBegin={closeInfoOverlay}
        >
          <View style={styles.content}>
            <ScreenHeader
              title="Preferences"
              subtitle={manageMode
                ? (isManageViewOnly
                  ? 'View your preferences. Tap Update to edit.'
                  : 'Change preferences and tap Save when ready.')
                : 'Choose what GapWalk should optimize for you.'}
              onBack={manageMode ? handleManageBackToOptions : undefined}
            />

            {!manageMode && !hasSeenAllSections && (
              <View style={styles.reviewGateWarning}>
                <Text variant="body" style={styles.reviewGateWarningTitle}>Review all sections to continue</Text>
                <Text variant="bodySmall" style={styles.reviewGateWarningBody}>
                  Open Walking Goals, Notifications, and Advanced once. You can keep recommended settings.
                </Text>
              </View>
            )}

            <Section
              title="Walking Goals"
              icon="adjust"
              onFirstExpand={() => setHasSeenWalkingGoals(true)}
            >
              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Walking Goal</Text>
                  <InfoTip
                    id="walking-goal"
                    text="Total walking minutes you aim for each day. GapWalk splits this across your free gaps."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, themedInput]}
                    value={String(prefs.dailyTargetMinutes)}
                    onChangeText={(t) => update('dailyTargetMinutes', parseInt(t, 10) || 0)}
                    editable={!isManageViewOnly}
                    keyboardType="number-pad"
                    placeholderTextColor={palette.textMuted}
                  />
                  <Text variant="muted" style={styles.unit}>min</Text>
                </View>
                {dailyTargetError && <Text variant="bodySmall" style={styles.errorText}>{dailyTargetError}</Text>}
              </View>

              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Walk buffer</Text>
                  <InfoTip
                    id="walk-buffer"
                    text="Adds space before and after busy events so walk suggestions are not too tight. Example: 10 min means no walk suggestion in the 10 min before or after each event."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, themedInput]}
                    value={String(prefs.bufferMinutes)}
                    onChangeText={(t) => update('bufferMinutes', parseInt(t, 10) || 0)}
                    editable={!isManageViewOnly}
                    keyboardType="number-pad"
                    placeholderTextColor={palette.textMuted}
                  />
                  <Text variant="muted" style={styles.unit}>min</Text>
                </View>
                {bufferError && <Text variant="bodySmall" style={styles.errorText}>{bufferError}</Text>}
              </View>

              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Reminders</Text>
                  <InfoTip
                    id="reminders"
                    text="How many walk notifications GapWalk can send per day."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, themedInput]}
                    value={String(prefs.notificationCountPerDay)}
                    onChangeText={(t) => update('notificationCountPerDay', parseInt(t, 10) || 0)}
                    editable={!isManageViewOnly}
                    keyboardType="number-pad"
                    placeholderTextColor={palette.textMuted}
                  />
                  <Text variant="muted" style={styles.unit}>per day</Text>
                </View>
                {notifError && <Text variant="bodySmall" style={styles.errorText}>{notifError}</Text>}
              </View>
            </Section>

            <Section
              title="Notifications"
              icon="bell"
              onFirstExpand={() => setHasSeenNotifications(true)}
            >
              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>When to notify</Text>
                  <InfoTip
                    id="when-to-notify"
                    text="Choose when GapWalk should alert you about a suggested walk."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
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

              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Minimum time between reminders</Text>
                  <InfoTip
                    id="notification-min-gap"
                    text="Prevents reminder overload. Recommended: 60 min. You can set between 30 min and 6 hours."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, themedInput]}
                    value={String(prefs.notificationMinGapMinutes)}
                    onChangeText={(t) => update('notificationMinGapMinutes', parseInt(t, 10) || 0)}
                    editable={!isManageViewOnly}
                    keyboardType="number-pad"
                    placeholderTextColor={palette.textMuted}
                  />
                  <Text variant="muted" style={styles.unit}>min</Text>
                </View>
                {reminderGapError && <Text variant="bodySmall" style={styles.errorText}>{reminderGapError}</Text>}
              </View>

              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Quiet Hours</Text>
                  <InfoTip
                    id="quiet-hours"
                    text="GapWalk will not send reminders during this time range."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
                <TouchableOpacity onPress={openQuietModal} style={[styles.quietBtn, themedSurface]} activeOpacity={0.7}>
                  <View style={styles.quietRow}>
                    <Text variant="body" style={styles.quietValue} numberOfLines={1}>
                      {formatTime12(prefs.quietHoursStart)} - {formatTime12(prefs.quietHoursEnd)}
                    </Text>
                    <Text variant="muted" style={styles.quietEdit} numberOfLines={1}>
                      Tap to edit
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Section>

            <Section
              title="Advanced"
              icon="settings"
              onFirstExpand={() => setHasSeenAdvanced(true)}
            >
              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Strictness</Text>
                  <InfoTip
                    id="strictness"
                    text="No Excuses enforces step-goal checks. Easygoing keeps walk timing flexible."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
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

              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Step Goal</Text>
                  <InfoTip
                    id="step-goal"
                    text="Recommended: 1000 steps. Range: 500 to 6000."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
                {prefs.strictnessMode === 'easygoing' && (
                  <View style={[styles.togglePillRow, styles.controlStartGap]}>
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
                    <View
                      style={[
                        styles.inputRow,
                        prefs.strictnessMode === 'no_excuses' && styles.controlStartGap,
                      ]}
                    >
                      <TextInput
                        style={[styles.input, themedInput]}
                        value={String(prefs.stepGoal)}
                        onChangeText={(t) => update('stepGoal', Math.max(0, parseInt(t, 10) || 0))}
                        editable={!isManageViewOnly}
                        keyboardType="number-pad"
                        placeholderTextColor={palette.textMuted}
                      />
                      <Text variant="muted" style={styles.unit}>steps</Text>
                    </View>
                  </>
                ) : (
                  <Text variant="muted" style={styles.note}>Step goal is currently off.</Text>
                )}
                {stepGoalError && <Text variant="bodySmall" style={styles.errorText}>{stepGoalError}</Text>}
              </View>

              <View style={[styles.field, styles.settingRowCard, themedSurface]}>
                <View style={styles.fieldHeader}>
                  <Text variant="bodySmall" style={styles.fieldLabel}>Preferred walking periods (optional)</Text>
                  <InfoTip
                    id="preferred-periods"
                    text="Pick up to 5 preferred time windows for walks. GapWalk will prioritize these windows when suggesting walk times, but other gaps will still be shown."
                    activeInfoId={activeInfo?.id ?? null}
                    onToggle={handleInfoToggle}
                  />
                </View>
                <View style={[styles.togglePillRow, styles.controlStartGap]}>
                  <TouchableOpacity
                    style={[
                      styles.togglePill,
                      themedSurface,
                      !prefs.preferredWalkingPeriodsEnabled && styles.togglePillActive,
                    ]}
                    activeOpacity={0.75}
                    onPress={disablePreferredPeriods}
                  >
                    <Text
                      variant="bodySmall"
                      style={!prefs.preferredWalkingPeriodsEnabled ? styles.togglePillTextActive : styles.togglePillText}
                    >
                      Off
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.togglePill,
                      themedSurface,
                      prefs.preferredWalkingPeriodsEnabled && styles.togglePillActive,
                    ]}
                    activeOpacity={0.75}
                    onPress={enablePreferredPeriods}
                  >
                    <Text
                      variant="bodySmall"
                      style={prefs.preferredWalkingPeriodsEnabled ? styles.togglePillTextActive : styles.togglePillText}
                    >
                      On
                    </Text>
                  </TouchableOpacity>
                </View>
                {prefs.preferredWalkingPeriodsEnabled ? (
                  <TouchableOpacity
                    onPress={openPreferredModal}
                    style={[styles.preferredSummaryBtn, themedSurface]}
                    activeOpacity={0.7}
                  >
                    <View style={styles.preferredSummaryHeader}>
                      <Text variant="muted" style={styles.preferredSummaryLabel}>Selected periods</Text>
                      <View style={styles.preferredSummaryAction}>
                        <Text variant="bodySmall" style={styles.preferredSummaryActionText}>Edit</Text>
                        <AppIcon name="chevronRight" size={14} color={theme.colors.accentPrimary} />
                      </View>
                    </View>
                    <Text variant="body" style={styles.preferredSummaryValue} numberOfLines={3}>
                      {preferredPeriodsDisplay}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text variant="muted" style={styles.note}>No preferred period selected.</Text>
                )}
                {preferredPeriodsError && <Text variant="bodySmall" style={styles.errorText}>{preferredPeriodsError}</Text>}
              </View>
            </Section>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.btnRow}>
            {manageMode ? (
              isManageViewOnly ? (
                <>
                  <Button
                    title="Back"
                    onPress={handleManageBackToOptions}
                    variant="secondary"
                    style={styles.btnHalf}
                    disabled={savingPrefs}
                    testID="preferences-back"
                  />
                  <Button
                    title="Update"
                    onPress={handleManageStartEdit}
                    style={styles.btnHalf}
                    disabled={savingPrefs}
                    testID="preferences-edit"
                  />
                </>
              ) : (
                <>
                  <Button
                    title="Cancel"
                    onPress={handleManageCancelEdit}
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
                    disabled={!canContinue || !hasChanges}
                    testID="preferences-save"
                  />
                </>
              )
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
      </View>

      <RNModal
        visible={!!activeInfo}
        transparent
        animationType="fade"
        onRequestClose={closeInfoOverlay}
      >
        <View style={styles.infoOverlayRoot}>
          <Pressable style={styles.infoOverlayBackdrop} onPress={closeInfoOverlay} />
          {activeInfo && infoOverlayPosition && (
            <View
              style={[
                styles.infoOverlayCard,
                infoOverlayTheme,
                {
                  left: infoOverlayPosition.left,
                  top: infoOverlayPosition.top,
                  width: infoOverlayPosition.width,
                },
              ]}
            >
              <Text variant="bodySmall" style={styles.infoOverlayText}>{activeInfo.text}</Text>
            </View>
          )}
        </View>
      </RNModal>

      {/* quiet hours modal */}
      <Modal visible={showQuietModal} onClose={() => setShowQuietModal(false)} title="Quiet Hours">
        <Text variant="bodySmall" color={palette.textMuted} style={styles.qDesc}>Select the time frame when GapWalk will not send you notifications.</Text>
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

      <Modal
        visible={showPreferredModal}
        onClose={() => setShowPreferredModal(false)}
        title="Preferred Walking Periods"
      >
        <Text variant="bodySmall" color={palette.textMuted} style={styles.qDesc}>
          Add 1 to 5 preferred time periods. GapWalk will prioritize these windows, but other gaps will still be shown.
        </Text>
        {preferredForm.map((period, idx) => (
          <View key={period.id} style={styles.prefPeriodCard}>
            <View style={styles.prefPeriodHeader}>
              <Text variant="bodySmall" style={styles.fieldLabel}>Period {idx + 1}</Text>
              {preferredForm.length > 1 && (
                <TouchableOpacity onPress={() => removePreferredPeriodForm(period.id)} hitSlop={8}>
                  <Text variant="bodySmall" style={styles.prefRemoveText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.qTimeGroup}>
              <Text variant="muted">Start</Text>
              <View style={styles.qTimeInputRow}>
                <View style={styles.clockRow}>
                  <TwoDigitTimeInput
                    mode="hour"
                    style={[styles.input, styles.timeInput, themedInput]}
                    placeholderTextColor={palette.textMuted}
                    value={period.startHourRaw}
                    onChange={(v) => updatePreferredFormById(period.id, { startHourRaw: v })}
                    onBlurNormalize={() => updatePreferredFormById(period.id, { startHourRaw: normalizeOnBlur('hour', period.startHourRaw) })}
                    placeholder="HH"
                  />
                  <Text variant="body">:</Text>
                  <TwoDigitTimeInput
                    mode="minute"
                    style={[styles.input, styles.timeInput, themedInput]}
                    placeholderTextColor={palette.textMuted}
                    value={period.startMinuteRaw}
                    onChange={(v) => updatePreferredFormById(period.id, { startMinuteRaw: v })}
                    onBlurNormalize={() => updatePreferredFormById(period.id, { startMinuteRaw: normalizeOnBlur('minute', period.startMinuteRaw) })}
                    placeholder="MM"
                  />
                </View>
                <View style={styles.periodRow}>
                  {(['AM', 'PM'] as const).map((per) => (
                    <TouchableOpacity
                      key={`${period.id}-start-${per}`}
                      style={[styles.periodBtn, themedSurface, period.startPeriod === per && styles.periodBtnActive]}
                      onPress={() => updatePreferredFormById(period.id, { startPeriod: per })}
                    >
                      <Text variant="bodySmall" color={period.startPeriod === per ? theme.colors.bgApp : theme.colors.textPrimary}>{per}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.qTimeGroup}>
              <Text variant="muted">End</Text>
              <View style={styles.qTimeInputRow}>
                <View style={styles.clockRow}>
                  <TwoDigitTimeInput
                    mode="hour"
                    style={[styles.input, styles.timeInput, themedInput]}
                    placeholderTextColor={palette.textMuted}
                    value={period.endHourRaw}
                    onChange={(v) => updatePreferredFormById(period.id, { endHourRaw: v })}
                    onBlurNormalize={() => updatePreferredFormById(period.id, { endHourRaw: normalizeOnBlur('hour', period.endHourRaw) })}
                    placeholder="HH"
                  />
                  <Text variant="body">:</Text>
                  <TwoDigitTimeInput
                    mode="minute"
                    style={[styles.input, styles.timeInput, themedInput]}
                    placeholderTextColor={palette.textMuted}
                    value={period.endMinuteRaw}
                    onChange={(v) => updatePreferredFormById(period.id, { endMinuteRaw: v })}
                    onBlurNormalize={() => updatePreferredFormById(period.id, { endMinuteRaw: normalizeOnBlur('minute', period.endMinuteRaw) })}
                    placeholder="MM"
                  />
                </View>
                <View style={styles.periodRow}>
                  {(['AM', 'PM'] as const).map((per) => (
                    <TouchableOpacity
                      key={`${period.id}-end-${per}`}
                      style={[styles.periodBtn, themedSurface, period.endPeriod === per && styles.periodBtnActive]}
                      onPress={() => updatePreferredFormById(period.id, { endPeriod: per })}
                    >
                      <Text variant="bodySmall" color={period.endPeriod === per ? theme.colors.bgApp : theme.colors.textPrimary}>{per}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={[
            styles.prefAddBtn,
            themedSurface,
            preferredForm.length >= MAX_PREFERRED_PERIODS && styles.prefAddBtnDisabled,
          ]}
          onPress={addPreferredPeriodForm}
          disabled={preferredForm.length >= MAX_PREFERRED_PERIODS}
          activeOpacity={0.75}
        >
          <Text variant="bodySmall" style={styles.prefAddText}>
            + Add period
          </Text>
        </TouchableOpacity>
        {!!preferredError && <Text variant="muted" style={styles.qError}>{preferredError}</Text>}
        <Button title="Save periods" onPress={applyPreferredPeriods} />
      </Modal>
    </Container>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• styles â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  contentScrollInner: {
    flexGrow: 1,
    paddingBottom: theme.spacing.lg,
  },
  content: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.TITLE_CONTENT_TOP_PADDING,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  reviewGateWarning: {
    marginBottom: 14,
    alignItems: 'center',
  },
  reviewGateWarningTitle: {
    color: theme.colors.warning,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 3,
    textAlign: 'center',
    textShadowColor: 'rgba(245,158,11,0.32)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  reviewGateWarningBody: {
    color: theme.colors.warning,
    lineHeight: 19,
    textAlign: 'center',
    textShadowColor: 'rgba(245,158,11,0.22)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },

  /* section */
  sectionCard: { marginBottom: 14, paddingVertical: 0, paddingHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  sectionHeaderTextWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  sectionIconWrap: { marginTop: 2 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontWeight: theme.fontWeight.semibold },
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
  field: { marginBottom: 12, zIndex: 1 },
  settingRowCard: {
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, zIndex: 10 },
  fieldLabel: { fontWeight: theme.fontWeight.semibold, color: theme.colors.textPrimary },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    textAlignVertical: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  unit: { minWidth: 48 },
  note: { marginTop: 8, fontSize: theme.fontSize.xs, lineHeight: 17 },

  /* radio */
  radioGroup: { gap: 4, marginTop: 6 },
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
  controlStartGap: { marginTop: 6 },
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

  /* info */
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
  infoCircleActive: {
    backgroundColor: 'rgba(46,233,166,0.16)',
  },
  infoLetter: {
    fontSize: 9,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.accentPrimary,
    lineHeight: 11,
  },
  infoOverlayRoot: {
    flex: 1,
    position: 'relative',
  },
  infoOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,16,40,0.28)',
  },
  infoOverlayCard: {
    position: 'absolute',
    maxWidth: 280,
    minWidth: 220,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,233,166,0.25)',
    elevation: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  infoOverlayText: { color: theme.colors.textPrimary, lineHeight: 19, fontSize: theme.fontSize.sm },

  /* quiet hours */
  quietBtn: {
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 6,
  },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  quietValue: {
    fontWeight: theme.fontWeight.medium,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  quietEdit: {
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
    textAlign: 'right',
  },
  preferredSummaryBtn: {
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 6,
  },
  preferredSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  preferredSummaryLabel: {
    fontSize: theme.fontSize.xs,
  },
  preferredSummaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preferredSummaryActionText: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  preferredSummaryValue: {
    fontWeight: theme.fontWeight.medium,
    lineHeight: 24,
  },

  /* footer */
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  btnRow: { flexDirection: 'row', gap: screenChrome.FOOTER_BUTTON_GAP },
  btnHalf: { flex: 1 },
  privacy: { textAlign: 'center', marginTop: screenChrome.FOOTER_NOTE_MARGIN_TOP },

  /* quiet modal */
  qDesc: { marginBottom: 16, textAlign: 'center' },
  qTimeGroup: { marginBottom: 10 },
  qTimeInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: { flex: 0, width: 56, textAlign: 'center' },
  periodRow: { flexDirection: 'row', gap: 4 },
  periodBtn: { borderRadius: theme.borderRadius.sm, backgroundColor: theme.colors.bgApp, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 8, minWidth: 42 },
  periodBtnActive: { backgroundColor: theme.colors.accentPrimary },
  prefPeriodCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  prefPeriodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  prefRemoveText: {
    color: theme.colors.error,
    fontWeight: theme.fontWeight.medium,
  },
  prefAddBtn: {
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 10,
  },
  prefAddBtnDisabled: {
    opacity: 0.45,
  },
  prefAddText: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.semibold,
  },
  qError: { color: theme.colors.warning, textAlign: 'center', marginBottom: 10 },

  /* appearance & language pills */
  pillRow: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    minHeight: theme.layout.buttonHeight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pillLabel: {
    fontWeight: theme.fontWeight.semibold,
  },

  /* validation */
  errorText: { color: theme.colors.error, marginTop: 6, fontSize: theme.fontSize.sm, lineHeight: 18 },
});
