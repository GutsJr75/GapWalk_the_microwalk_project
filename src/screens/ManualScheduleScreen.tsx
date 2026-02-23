import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
  Alert,
  TextInput,
  StyleProp,
  TextStyle,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { ManualScheduleEntry } from '../lib/types';
import { buildWeeklyTemplateFromIcsEvents, parseICSFile } from '../lib/ics';
import { manualScheduleRepo } from '../lib/repositories/manualScheduleRepo';
import { eventsRepo } from '../lib/repositories/eventsRepo';
import { plansRepo } from '../lib/repositories/plansRepo';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';
import { syncNudgePlansForCurrentSchedule } from '../lib/scheduleSync';
import { SAVE_CONFIRM_ACTION, SAVE_CONFIRM_MESSAGE, SAVE_CONFIRM_TITLE } from '../lib/confirmMessages';
import { analyticsService } from '../lib/analytics';
import { useAppStore } from '../store';
import { addDays, format, setHours, setMinutes, startOfDay } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualSchedule'>;
const DAY_TAB_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
// 6:00 AM to next day 6:00 AM = 24 hours = 48 x 30-min slots
const GRID_START_MIN = 6 * 60;   // 6:00 AM
const GRID_END_MIN = 6 * 60 + 24 * 60;   // next day 6:00 AM (1800)
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 60; // 60px per 30-min slot = 120px per hour (open, clickable)
const NUM_SLOTS = 48;
const GRID_BODY_HEIGHT = NUM_SLOTS * SLOT_HEIGHT;
const TIME_COL_WIDTH = 56;
const SLOT_INDEX_8_AM = (8 - 6) * 2;
const GRID_PADDING = 20;

// Full-hour labels only: "6 AM", "7 AM", ... "5 AM" (next day)
const FULL_HOUR_LABELS: string[] = (() => {
  const out: string[] = [];
  for (let i = 0; i < 24; i++) {
    const h = (6 + i) % 24;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push(`${h12} ${period}`);
  }
  return out;
})();

// All slot indices for iteration (labels: full hour = text, half hour = line only)
const SLOT_INDICES = Array.from({ length: NUM_SLOTS }, (_, i) => i);

type TimeInputMode = 'hour' | 'minute';

const onlyDigits = (value: string, max = 2): string => value.replace(/[^0-9]/g, '').slice(0, max);

const normalizeHourTyping = (nextText: string): string => {
  const digits = onlyDigits(nextText, 2);
  if (digits.length === 0) return '';

  if (digits.length === 1) {
    const first = digits[0];
    if (first === '0' || first === '1') return first;
    return `0${first}`; // 2-9 completes as 02-09.
  }

  const [first, second] = digits;
  if (first === '0') {
    if (second === '0') return '0';
    return `0${second}`; // 01-09
  }
  if (first === '1') {
    return Number(second) <= 2 ? `1${second}` : '1';
  }
  return `0${first}`;
};

const normalizeMinuteTyping = (nextText: string): string => {
  const digits = onlyDigits(nextText, 2);
  if (digits.length === 0) return '';

  if (digits.length === 1) {
    const first = Number(digits[0]);
    if (first >= 6) return `0${digits[0]}`; // 6-9 completes as 06-09.
    return digits[0];
  }

  const [first, second] = digits;
  if (Number(first) > 5) return `0${first}`;
  const n = Number(`${first}${second}`);
  return n <= 59 ? `${first}${second}` : first;
};

const normalizeTyping = (mode: TimeInputMode, nextText: string): string =>
  mode === 'hour' ? normalizeHourTyping(nextText) : normalizeMinuteTyping(nextText);

const isValidHour = (value: string): boolean => {
  if (value === '') return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12;
};

const isValidMinute = (value: string): boolean => {
  if (value === '') return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 59;
};

const normalizeOnBlur = (mode: TimeInputMode, value: string): string => {
  if (value === '') return '';
  if (mode === 'hour') return isValidHour(value) ? String(Number(value)).padStart(2, '0') : '';
  return isValidMinute(value) ? String(Number(value)).padStart(2, '0') : '';
};

interface TwoDigitTimeInputProps {
  mode: TimeInputMode;
  value: string;
  onChange: (value: string) => void;
  onBlurNormalize: () => void;
  placeholder: string;
  style: StyleProp<TextStyle>;
  placeholderTextColor?: string;
}

const TwoDigitTimeInput: React.FC<TwoDigitTimeInputProps> = ({
  mode,
  value,
  onChange,
  onBlurNormalize,
  placeholder,
  style,
  placeholderTextColor,
}) => {
  const { themeMode } = useAppStore();
  const palette = getThemePalette(themeMode);

  return (
    <TextInput
      style={style}
      value={value}
      onChangeText={(nextText) => onChange(normalizeTyping(mode, nextText))}
      onBlur={onBlurNormalize}
      keyboardType="number-pad"
      maxLength={2}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor ?? palette.textMuted}
      selectTextOnFocus
    />
  );
};

interface TemplateEvent {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isOneTime?: boolean;
  oneTimeDate?: string;
}

type ManualRepeatMode = 'weekly' | 'one_time';

interface ManualFormState {
  title: string;
  dayOfWeek: number;
  repeatDays: number[];
  repeatMode: ManualRepeatMode;
  oneTimeDate: string;
  oneTimeMonthRaw: string;
  oneTimeDayRaw: string;
  oneTimeYearRaw: string;
  startHourRaw: string;
  startMinuteRaw: string;
  startPeriod: 'AM' | 'PM';
  endHourRaw: string;
  endMinuteRaw: string;
  endPeriod: 'AM' | 'PM';
  description: string;
}

const minutesToHHmm = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const hhmmToMinutes = (hhmm: string): number => {
  const parts = hhmm.split(':').map(Number);
  const h = isNaN(parts[0]) ? 0 : Math.max(0, Math.min(23, parts[0]));
  const m = isNaN(parts[1]) ? 0 : Math.max(0, Math.min(59, parts[1] || 0));
  return h * 60 + m;
};

const parseDateKeyParts = (dateKey: string): { monthRaw: string; dayRaw: string; yearRaw: string } => {
  const [year = '', month = '', day = ''] = dateKey.split('-');
  return {
    monthRaw: month,
    dayRaw: day,
    yearRaw: year,
  };
};

const normalizeDatePartOnBlur = (value: string, mode: 'month' | 'day' | 'year'): string => {
  const max = mode === 'year' ? 4 : 2;
  const digits = onlyDigits(value, max);
  if (!digits) return '';
  if (mode === 'year') return digits;
  return digits.padStart(2, '0');
};

const resolveDateKeyFromParts = (
  monthRaw: string,
  dayRaw: string,
  yearRaw: string
): { dateKey: string | null; error: string | null } => {
  if (!monthRaw || !dayRaw || !yearRaw) {
    return { dateKey: null, error: 'Enter month, day, and year.' };
  }

  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const year = Number(yearRaw);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { dateKey: null, error: 'Month must be between 1 and 12.' };
  }

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return { dateKey: null, error: 'Year must be between 1900 and 2100.' };
  }

  const maxDay = new Date(year, month, 0).getDate();
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    return { dateKey: null, error: 'Day is not valid for this month.' };
  }

  return {
    dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    error: null,
  };
};

const toDateKey = (value: Date): string => format(value, 'yyyy-MM-dd');

const getDayOfWeekFromDateKey = (dateKey: string): number => {
  const dt = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return 0;
  return dt.getDay();
};

const getNextDateForDayOfWeek = (dayIndex: number): string => {
  const base = startOfDay(new Date());
  const diff = (dayIndex - base.getDay() + 7) % 7;
  return toDateKey(addDays(base, diff));
};

const createDefaultFormState = (dayIndex: number): ManualFormState => {
  const defaultOneTimeDate = getNextDateForDayOfWeek(dayIndex);
  const defaultParts = parseDateKeyParts(defaultOneTimeDate);
  return {
    title: '',
    dayOfWeek: dayIndex,
    repeatDays: [dayIndex],
    repeatMode: 'weekly',
    oneTimeDate: defaultOneTimeDate,
    oneTimeMonthRaw: defaultParts.monthRaw,
    oneTimeDayRaw: defaultParts.dayRaw,
    oneTimeYearRaw: defaultParts.yearRaw,
    startHourRaw: '09',
    startMinuteRaw: '00',
    startPeriod: 'AM',
    endHourRaw: '10',
    endMinuteRaw: '00',
    endPeriod: 'AM',
    description: '',
  };
};

const createEmptyEntriesByDay = (): Record<number, TemplateEvent[]> => ({
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
});

const groupTemplateEntries = (entries: ManualScheduleEntry[]): Record<number, TemplateEvent[]> => {
  const grouped = createEmptyEntriesByDay();
  for (const entry of entries) {
    const dayOfWeek =
      entry.isOneTime && entry.oneTimeDate
        ? getDayOfWeekFromDateKey(entry.oneTimeDate)
        : entry.dayOfWeek;
    if (dayOfWeek < 0 || dayOfWeek > 6) continue;
    grouped[dayOfWeek] = [
      ...grouped[dayOfWeek],
      {
        id: entry.id,
        title: entry.title,
        startTime: entry.startTime,
        endTime: entry.endTime,
        isOneTime: !!entry.isOneTime,
        oneTimeDate: entry.oneTimeDate,
      },
    ];
  }
  return grouped;
};

const buildScheduleSignature = (entriesByDay: Record<number, TemplateEvent[]>): string => {
  const normalized = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const items = [...(entriesByDay[day] ?? [])]
      .map((e) => ({
        title: e.title.trim(),
        startTime: e.startTime,
        endTime: e.endTime,
        isOneTime: !!e.isOneTime,
        oneTimeDate: e.oneTimeDate ?? '',
      }))
      .sort((a, b) => {
        if (a.isOneTime !== b.isOneTime) return a.isOneTime ? 1 : -1;
        if (a.oneTimeDate !== b.oneTimeDate) return a.oneTimeDate.localeCompare(b.oneTimeDate);
        if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
        if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
        return a.title.localeCompare(b.title);
      });
    return { day, items };
  });
  return JSON.stringify(normalized);
};

export const ManualScheduleScreen: React.FC<Props> = ({ navigation, route }) => {
  const today = new Date();
  const todayIndex = Number.isFinite(today.getDay()) ? today.getDay() : 1;
  const manageMode = !!route.params?.manageMode;
  const importedFilename = route.params?.importedFilename?.trim();
  const importedEventCount = route.params?.importedEventCount;
  const prefillTemplate = route.params?.prefillTemplate;
  const startWithEmpty = !!route.params?.startWithEmpty && !manageMode;
  const requireSaveBeforeContinue = !!route.params?.requireSaveBeforeContinue && !manageMode;
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';
  const usingIcsTemplate = !!importedFilename;
  const [entriesByDay, setEntriesByDay] = useState<Record<number, TemplateEvent[]>>(createEmptyEntriesByDay());
  const [initialSignature, setInitialSignature] = useState<string>(buildScheduleSignature(createEmptyEntriesByDay()));
  const [showAdd, setShowAdd] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [savingDone, setSavingDone] = useState(false);
  const [hasSavedSchedule, setHasSavedSchedule] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [form, setForm] = useState<ManualFormState>(() => createDefaultFormState(todayIndex));
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [currentSourceLabel, setCurrentSourceLabel] = useState<string>('');
  const [showEditor, setShowEditor] = useState(!manageMode);
  const [selectedSource, setSelectedSource] = useState<'manual' | 'import'>('manual');

  // Reset showEditor when the screen is re-focused with different params.
  // navigate() reuses existing screens, so the initial useState(!manageMode)
  // value becomes stale when route.params change on subsequent navigations.
  useFocusEffect(
    useCallback(() => {
      setShowEditor(!manageMode);
    }, [manageMode])
  );
  const gridScrollRef = useRef<ScrollView>(null);
  const oneTimeMonthRef = useRef<TextInput>(null);
  const oneTimeDayRef = useRef<TextInput>(null);
  const oneTimeYearRef = useRef<TextInput>(null);
  const appearAnim = useRef(new Animated.Value(0)).current;
  const { scheduleSource, setScheduleSource, setUpcomingPlans, preferences, themeMode } = useAppStore();

  // Hide scrollbar (web) and auto-scroll to 8:00 AM on mount
  useEffect(() => {
    if (Platform.OS === 'web') {
      const doc = (globalThis as any).document;
      if (doc) {
        const styleId = 'gapwalk-schedule-grid-scrollbar';
        if (!doc.getElementById(styleId)) {
          const el = doc.createElement('style');
          el.id = styleId;
          el.textContent = `
          [data-gapwalk-schedule-scroll]::-webkit-scrollbar { display: none; }
          [data-gapwalk-schedule-scroll] { scrollbar-width: none; }
        `;
          doc.head.appendChild(el);
        }
      }
    }
    const t = setTimeout(() => {
      if (Platform.OS === 'web') {
        const node = (gridScrollRef.current as any)?.getScrollableNode?.();
        if (node) node.setAttribute('data-gapwalk-schedule-scroll', 'true');
      }
      gridScrollRef.current?.scrollTo({
        y: SLOT_INDEX_8_AM * SLOT_HEIGHT,
        animated: true,
      });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    Animated.timing(appearAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appearAnim]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadSavedTemplate = async () => {
        if (Array.isArray(prefillTemplate)) {
          const grouped = groupTemplateEntries(prefillTemplate);
          if (!active) return;
          setEntriesByDay(grouped);
          setInitialSignature(buildScheduleSignature(grouped));
          setHasSavedSchedule(false);
          return;
        }
        if (startWithEmpty) {
          const empty = createEmptyEntriesByDay();
          if (!active) return;
          setEntriesByDay(empty);
          setInitialSignature(buildScheduleSignature(empty));
          setHasSavedSchedule(false);
          return;
        }
        try {
          const saved = await manualScheduleRepo.getAll();
          const todayKey = toDateKey(new Date());
          const cleaned = saved.filter(
            (entry) => !(entry.isOneTime && entry.oneTimeDate && entry.oneTimeDate < todayKey)
          );
          if (cleaned.length !== saved.length) {
            await manualScheduleRepo.deleteAll();
            await manualScheduleRepo.saveMany(cleaned);
          }
          const grouped = groupTemplateEntries(cleaned);
          if (!active) return;
          setEntriesByDay(grouped);
          setInitialSignature(buildScheduleSignature(grouped));
          setHasSavedSchedule(!requireSaveBeforeContinue);
        } catch (error) {
          if (!active) return;
          const empty = createEmptyEntriesByDay();
          setEntriesByDay(empty);
          setInitialSignature(buildScheduleSignature(empty));
          setHasSavedSchedule(false);
          console.error('Failed to load saved manual schedule:', error);
        }
      };
      void loadSavedTemplate();
      return () => {
        active = false;
      };
    }, [prefillTemplate, requireSaveBeforeContinue, startWithEmpty])
  );

  // Load current source label in manage mode
  useEffect(() => {
    if (!manageMode) return;
    const loadSource = async () => {
      const src = scheduleSource ?? (await scheduleSourceRepo.get());
      if (!src) { setCurrentSourceLabel('Not set yet'); setSelectedSource('manual'); return; }
      if (src.type === 'manual') { setCurrentSourceLabel('Manual schedule'); setSelectedSource('manual'); }
      else if (src.type === 'ics') { setCurrentSourceLabel(src.filename ? `Calendar file: ${src.filename}` : 'Calendar file (.ics)'); setSelectedSource('import'); }
      else if (src.type === 'google') { setCurrentSourceLabel('Google Calendar'); setSelectedSource('manual'); }
      else { setCurrentSourceLabel('Not set yet'); setSelectedSource('manual'); }
    };
    void loadSource();
  }, [manageMode, scheduleSource]);

  /* ── ICS re-import (inline, no extra screen) ── */
  const handleReImportIcs = async () => {
    try {
      setImportLoading(true);
      setImportStatus('Opening file picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/calendar', 'application/octet-stream', '.ics', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setImportLoading(false);
        setImportStatus(null);
        return;
      }
      const file = result.assets[0];
      setImportStatus(`Reading ${file.name || 'calendar file'}...`);
      let content = '';
      const webFile = (file as any).file;
      if (Platform.OS === 'web' && webFile && typeof webFile.text === 'function') {
        content = await webFile.text();
      } else {
        const resp = await fetch(file.uri);
        if (!resp.ok) throw new Error(`Could not read selected file (${resp.status}).`);
        content = await resp.text();
      }
      if (!content.trim()) throw new Error('The selected ICS file is empty.');

      setImportStatus('Parsing calendar...');
      const parseResult = await parseICSFile(content);
      if (parseResult.errors.length > 0) {
        const warningText = parseResult.errors.slice(0, 3).join('\n');
        showMessage('Import Warning', warningText);
      }
      if (parseResult.events.length === 0) {
        setImportLoading(false);
        setImportStatus(null);
        showMessage('No Events', 'No events found in the ICS file.');
        return;
      }
      const weeklyTemplate: ManualScheduleEntry[] = buildWeeklyTemplateFromIcsEvents(parseResult.events);
      analyticsService.track('ics_import_parsed', {
        filename: file.name || 'calendar.ics',
        eventsParsed: parseResult.events.length,
        weeklyTemplateEntries: weeklyTemplate.length,
      });
      const grouped = groupTemplateEntries(weeklyTemplate);
      setEntriesByDay(grouped);
      setImportLoading(false);
      setImportStatus(null);
      setShowEditor(true);
      showMessage('Imported', `Loaded ${parseResult.events.length} events from ${file.name || 'calendar.ics'}. Review the grid and save.`);
    } catch (error) {
      console.error('ICS re-import failed:', error);
      setImportLoading(false);
      setImportStatus(null);
      const msg = error instanceof Error ? error.message : 'Failed to import ICS file. Please try again.';
      showMessage('Import Failed', msg);
    }
  };

  /* ── Landing: proceed to editor ── */
  const handleLandingProceed = () => {
    setShowEditor(true);
  };

  const handleLandingCancel = () => {
    navigation.navigate('Dashboard');
  };

  const currentSignature = useMemo(() => buildScheduleSignature(entriesByDay), [entriesByDay]);
  const hasUnsavedChanges = currentSignature !== initialSignature;
  const hasPendingImportedSchedule = usingIcsTemplate && Array.isArray(prefillTemplate) && !hasSavedSchedule;
  const isReadyToContinue = hasSavedSchedule && !hasUnsavedChanges;

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

  const confirmDiscardChanges = (onDiscard: () => void) => {
    if (!hasUnsavedChanges && !hasPendingImportedSchedule) {
      onDiscard();
      return;
    }
    const message = hasPendingImportedSchedule
      ? 'Discard this imported schedule before saving?'
      : 'Discard unsaved schedule changes?';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(message);
      if (ok) onDiscard();
      return;
    }
    Alert.alert(
      'Discard changes?',
      message,
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onDiscard },
      ]
    );
  };

  const exitManualScreen = () => {
    const goOut = () => {
      if (manageMode) {
        navigation.navigate('Dashboard');
        return;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigation.navigate('ScheduleSetup');
    };
    confirmDiscardChanges(goOut);
  };

  const to24Hour = (hourText: string, minuteText: string, period: 'AM' | 'PM'): string | null => {
    if (!isValidHour(hourText) || !isValidMinute(minuteText)) return null;
    const hour = Number(hourText);
    const minute = Number(minuteText);
    let h = hour % 12;
    if (period === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const startValue24 = to24Hour(form.startHourRaw, form.startMinuteRaw, form.startPeriod);
  const endValue24 = to24Hour(form.endHourRaw, form.endMinuteRaw, form.endPeriod);
  const hasTitle = form.title.trim().length > 0;
  const hasValidTimes = !!startValue24 && !!endValue24;
  const isRangeValid = hasValidTimes && startValue24 < endValue24;
  const oneTimeDateResolution = resolveDateKeyFromParts(
    form.oneTimeMonthRaw,
    form.oneTimeDayRaw,
    form.oneTimeYearRaw
  );
  const todayDateKey = toDateKey(new Date());
  const isOneTimeFutureOrToday = !!oneTimeDateResolution.dateKey && oneTimeDateResolution.dateKey >= todayDateKey;
  const oneTimeDateError = form.repeatMode === 'one_time'
    ? oneTimeDateResolution.error
      ? oneTimeDateResolution.error
      : !isOneTimeFutureOrToday
        ? 'One-time event date must be today or later.'
        : null
    : null;
  const canAdd = hasTitle && isRangeValid && (form.repeatMode === 'weekly' || !oneTimeDateError);
  const timeError = !hasValidTimes
    ? 'Enter a valid start and end time.'
    : !isRangeValid
      ? 'End time must be after start time.'
      : '';

  const getPreferredOneTimeDateForDay = useCallback((dayIndex: number): string => {
    return getNextDateForDayOfWeek(dayIndex);
  }, []);

  const setOneTimeDateInput = useCallback(
    (field: 'oneTimeMonthRaw' | 'oneTimeDayRaw' | 'oneTimeYearRaw', rawValue: string) => {
      const max = field === 'oneTimeYearRaw' ? 4 : 2;
      const nextValue = onlyDigits(rawValue, max);
      setForm((prev) => {
        const next = { ...prev, [field]: nextValue };
        const resolved = resolveDateKeyFromParts(next.oneTimeMonthRaw, next.oneTimeDayRaw, next.oneTimeYearRaw);
        if (resolved.dateKey) {
          const dayOfWeek = getDayOfWeekFromDateKey(resolved.dateKey);
          next.oneTimeDate = resolved.dateKey;
          next.dayOfWeek = dayOfWeek;
          next.repeatDays = [dayOfWeek];
        } else {
          next.oneTimeDate = '';
        }
        return next;
      });
    },
    []
  );

  const handleOneTimeDateInputChange = useCallback(
    (field: 'oneTimeMonthRaw' | 'oneTimeDayRaw' | 'oneTimeYearRaw', rawValue: string) => {
      const max = field === 'oneTimeYearRaw' ? 4 : 2;
      const nextValue = onlyDigits(rawValue, max);
      setOneTimeDateInput(field, nextValue);

      if (nextValue.length !== max) return;
      if (field === 'oneTimeMonthRaw') {
        oneTimeDayRef.current?.focus();
        return;
      }
      if (field === 'oneTimeDayRaw') {
        oneTimeYearRef.current?.focus();
      }
    },
    [setOneTimeDateInput]
  );

  const blurOneTimeDateInput = useCallback(
    (field: 'oneTimeMonthRaw' | 'oneTimeDayRaw' | 'oneTimeYearRaw', mode: 'month' | 'day' | 'year') => {
      setForm((prev) => {
        const normalized = normalizeDatePartOnBlur(prev[field], mode);
        const next = { ...prev, [field]: normalized };
        const resolved = resolveDateKeyFromParts(next.oneTimeMonthRaw, next.oneTimeDayRaw, next.oneTimeYearRaw);
        if (resolved.dateKey) {
          const dayOfWeek = getDayOfWeekFromDateKey(resolved.dateKey);
          next.oneTimeDate = resolved.dateKey;
          next.dayOfWeek = dayOfWeek;
          next.repeatDays = [dayOfWeek];
        } else {
          next.oneTimeDate = '';
        }
        return next;
      });
    },
    []
  );

  const handleSlotClick = (dayIndex: number, slotIndex: number) => {
    openModalFromSlot(dayIndex, slotIndex);
  };

  const openModalFromSlot = (dayIndex: number, slotIndex: number) => {
    const startMin = GRID_START_MIN + slotIndex * SLOT_MINUTES;
    const endMin = Math.min(startMin + SLOT_MINUTES, GRID_END_MIN);
    const [sh, sm] = [Math.floor(startMin / 60) % 12 || 12, startMin % 60];
    const [eh, em] = [Math.floor(endMin / 60) % 12 || 12, endMin % 60];
    const startPeriod = startMin >= 12 * 60 ? 'PM' : 'AM';
    const endPeriod = endMin >= 12 * 60 ? 'PM' : 'AM';
    const defaultOneTimeDate = getPreferredOneTimeDateForDay(dayIndex);
    const defaultParts = parseDateKeyParts(defaultOneTimeDate);
    setEditingEventId(null);
    setForm({
      ...createDefaultFormState(dayIndex),
      oneTimeDate: defaultOneTimeDate,
      oneTimeMonthRaw: defaultParts.monthRaw,
      oneTimeDayRaw: defaultParts.dayRaw,
      oneTimeYearRaw: defaultParts.yearRaw,
      startHourRaw: String(sh).padStart(2, '0'),
      startMinuteRaw: String(sm).padStart(2, '0'),
      startPeriod,
      endHourRaw: String(eh).padStart(2, '0'),
      endMinuteRaw: String(em).padStart(2, '0'),
      endPeriod,
    });
    setShowAdd(true);
  };

  const openModalFromEvent = (event: TemplateEvent, dayIndex: number) => {
    const startMin = hhmmToMinutes(event.startTime);
    const endMin = hhmmToMinutes(event.endTime);
    const sh = Math.floor(startMin / 60) % 12 || 12;
    const eh = Math.floor(endMin / 60) % 12 || 12;
    const repeatMode: ManualRepeatMode = event.isOneTime ? 'one_time' : 'weekly';
    const oneTimeDate = event.oneTimeDate ?? getPreferredOneTimeDateForDay(dayIndex);
    const oneTimeParts = parseDateKeyParts(oneTimeDate);
    const oneTimeDay = getDayOfWeekFromDateKey(oneTimeDate);
    setEditingEventId(event.id);
    setForm({
      title: event.title,
      dayOfWeek: repeatMode === 'one_time' ? oneTimeDay : dayIndex,
      repeatDays: repeatMode === 'one_time' ? [oneTimeDay] : [dayIndex],
      repeatMode,
      oneTimeDate,
      oneTimeMonthRaw: oneTimeParts.monthRaw,
      oneTimeDayRaw: oneTimeParts.dayRaw,
      oneTimeYearRaw: oneTimeParts.yearRaw,
      startHourRaw: String(sh).padStart(2, '0'),
      startMinuteRaw: String(startMin % 60).padStart(2, '0'),
      startPeriod: startMin >= 12 * 60 ? 'PM' : 'AM',
      endHourRaw: String(eh).padStart(2, '0'),
      endMinuteRaw: String(endMin % 60).padStart(2, '0'),
      endPeriod: endMin >= 12 * 60 ? 'PM' : 'AM',
      description: '',
    });
    setShowAdd(true);
  };

  const toggleRepeatDay = (dayIndex: number) => {
    setForm((prev) => {
      const next = prev.repeatDays.includes(dayIndex)
        ? prev.repeatDays.filter((d) => d !== dayIndex)
        : [...prev.repeatDays, dayIndex].sort((a, b) => a - b);
      const repeatDays = next.length > 0 ? next : [prev.dayOfWeek];
      return { ...prev, repeatDays, dayOfWeek: repeatDays[0] };
    });
  };

  const setRepeatMode = (mode: ManualRepeatMode) => {
    setForm((prev) => {
      if (mode === prev.repeatMode) return prev;
      if (mode === 'one_time') {
        const nextDate = prev.oneTimeDate || getPreferredOneTimeDateForDay(prev.dayOfWeek);
        const nextParts = parseDateKeyParts(nextDate);
        const dayOfWeek = getDayOfWeekFromDateKey(nextDate);
        return {
          ...prev,
          repeatMode: 'one_time',
          oneTimeDate: nextDate,
          oneTimeMonthRaw: nextParts.monthRaw,
          oneTimeDayRaw: nextParts.dayRaw,
          oneTimeYearRaw: nextParts.yearRaw,
          dayOfWeek,
          repeatDays: [dayOfWeek],
        };
      }
      return {
        ...prev,
        repeatMode: 'weekly',
        repeatDays: prev.repeatDays.length > 0 ? prev.repeatDays : [prev.dayOfWeek],
      };
    });
  };

  const addOrUpdateEntry = () => {
    const title = form.title.trim();
    if (title.length === 0) {
      Alert.alert('Title Required', 'Enter an event title.');
      return;
    }
    const start = to24Hour(form.startHourRaw, form.startMinuteRaw, form.startPeriod);
    const end = to24Hour(form.endHourRaw, form.endMinuteRaw, form.endPeriod);
    if (!start || !end) {
      Alert.alert('Invalid Time', 'Enter valid start and end times.');
      return;
    }
    if (start >= end) {
      Alert.alert('Invalid Time', 'End time must be after start time.');
      return;
    }
    if (form.repeatMode === 'one_time') {
      if (oneTimeDateResolution.error || !oneTimeDateResolution.dateKey) {
        Alert.alert('Select date', oneTimeDateResolution.error ?? 'Choose a date for this one-time event.');
        return;
      }
      if (!isOneTimeFutureOrToday) {
        Alert.alert('Select date', 'One-time event date must be today or later.');
        return;
      }
    }
    const resolvedOneTimeDate = form.repeatMode === 'one_time' ? oneTimeDateResolution.dateKey : null;
    if (form.repeatMode === 'one_time' && !resolvedOneTimeDate) {
      Alert.alert('Select date', 'Choose a date for this one-time event.');
      return;
    }

    // Duplicate time-frame check: no two events on the same day with identical start & end
    const targetDays = form.repeatMode === 'one_time'
      ? [getDayOfWeekFromDateKey(resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek))]
      : (form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek]);
    for (const d of targetDays) {
      const existing = (entriesByDay[d] ?? []).filter((e) => e.id !== editingEventId);
      const duplicate = existing.find((e) => e.startTime === start && e.endTime === end);
      if (duplicate) {
        const dayName = DAY_FULL_NAMES[d];
        Alert.alert(
          'Duplicate time',
          `${dayName} already has an event ("${duplicate.title}") from ${formatTime12(start)} to ${formatTime12(end)}. Two events cannot share the exact same time frame.`,
        );
        return;
      }
    }

    if (editingEventId) {
      const id = editingEventId;
      setEntriesByDay((prev) => {
        const next = { ...prev };
        for (const d of [0, 1, 2, 3, 4, 5, 6]) {
          next[d] = (next[d] ?? []).filter((e) => e.id !== id);
        }
        if (form.repeatMode === 'one_time') {
          const oneTimeDate = resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek);
          const oneTimeDay = getDayOfWeekFromDateKey(oneTimeDate);
          const event: TemplateEvent = {
            id,
            title,
            startTime: start,
            endTime: end,
            isOneTime: true,
            oneTimeDate,
          };
          next[oneTimeDay] = [...(next[oneTimeDay] ?? []), event];
          return next;
        }
        const daysToUpdate = form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek];
        for (let i = 0; i < daysToUpdate.length; i++) {
          const d = daysToUpdate[i];
          const eventId = i === 0 ? id : `${id}-dup-${i}`;
          const event: TemplateEvent = { id: eventId, title, startTime: start, endTime: end, isOneTime: false };
          next[d] = [...(next[d] ?? []), event];
        }
        return next;
      });
    } else {
      setEntriesByDay((prev) => {
        const next = { ...prev };
        const baseId = `m-${Date.now()}`;
        if (form.repeatMode === 'one_time') {
          const oneTimeDate = resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek);
          const oneTimeDay = getDayOfWeekFromDateKey(oneTimeDate);
          const event: TemplateEvent = {
            id: `${baseId}-0`,
            title,
            startTime: start,
            endTime: end,
            isOneTime: true,
            oneTimeDate,
          };
          next[oneTimeDay] = [...(next[oneTimeDay] ?? []), event];
          return next;
        }
        const daysToAdd = form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek];
        for (let i = 0; i < daysToAdd.length; i++) {
          const d = daysToAdd[i];
          const event: TemplateEvent = {
            id: `${baseId}-${i}`,
            title,
            startTime: start,
            endTime: end,
            isOneTime: false,
          };
          next[d] = [...(next[d] ?? []), event];
        }
        return next;
      });
    }
    if (form.repeatMode === 'one_time') {
      const oneTimeDay = getDayOfWeekFromDateKey(resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek));
      setSelectedDay(oneTimeDay);
    }
    setShowAdd(false);
    setEditingEventId(null);
    setForm(createDefaultFormState(todayIndex));
  };

  const deleteEntryFromModal = (eventId?: string | null) => {
    const idToDelete = eventId ?? editingEventId;
    if (!idToDelete) return;
    setEntriesByDay((prev) => {
      const next = { ...prev };
      for (const d of [0, 1, 2, 3, 4, 5, 6]) {
        next[d] = (next[d] ?? []).filter((e) => e.id !== idToDelete);
      }
      return next;
    });
    setShowAdd(false);
    setEditingEventId(null);
  };

  const confirmDelete = () => {
    const id = editingEventId;
    if (!id) return;
    // Alert.alert button callbacks don't fire on web (react-native-web limitation)
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm('Remove this event?')) {
        deleteEntryFromModal(id);
      }
      return;
    }
    Alert.alert(
      'Delete event',
      'Remove this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteEntryFromModal(id) },
      ]
    );
  };

  const addEntry = addOrUpdateEntry;

  const parseTime = (t: string): [number, number] => {
    const parts = t.split(':').map(Number);
    const h = isNaN(parts[0]) ? 0 : Math.max(0, Math.min(23, parts[0]));
    const m = isNaN(parts[1]) ? 0 : Math.max(0, Math.min(59, parts[1] || 0));
    return [h, m];
  };

  const formatTime12 = (t: string): string => {
    const [h, m] = parseTime(t);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const performSave = async () => {
    if (savingDone) return;
    setSaveError(null);
    setSavingDone(true);

    const weeklyTemplate: ManualScheduleEntry[] = Object.entries(entriesByDay).flatMap(([day, arr]) =>
      [...arr].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((e) => {
        const fallbackDay = Number(day);
        const oneTimeDate = e.oneTimeDate?.trim();
        const oneTimeDay =
          e.isOneTime && oneTimeDate ? getDayOfWeekFromDateKey(oneTimeDate) : fallbackDay;
        return {
          id: e.id,
          title: e.title,
          dayOfWeek: oneTimeDay,
          startTime: e.startTime,
          endTime: e.endTime,
          isOneTime: !!e.isOneTime,
          oneTimeDate: e.isOneTime ? oneTimeDate : undefined,
        };
      })
    );

    const eventSource: 'ics' | 'manual' = usingIcsTemplate ? 'ics' : 'manual';
    const base = startOfDay(new Date());
    const rangeEnd = addDays(base, 14);
    const recurringByDay = weeklyTemplate
      .filter((entry) => !entry.isOneTime)
      .reduce<Record<number, ManualScheduleEntry[]>>((acc, entry) => {
        const day = entry.dayOfWeek;
        acc[day] = [...(acc[day] ?? []), entry];
        return acc;
      }, {});
    const recurringEvents = Array.from({ length: 14 }, (_, offset) => {
      const date = addDays(base, offset);
      const dayIndex = date.getDay();
      const dayEvents = recurringByDay[dayIndex] ?? [];
      return dayEvents.map((e) => {
        const [sh, sm] = parseTime(e.startTime);
        const [eh, em] = parseTime(e.endTime);
        return {
          id: `me-${e.id}-${offset}`,
          title: e.title,
          start: setMinutes(setHours(date, sh), sm).toISOString(),
          end: setMinutes(setHours(date, eh), em).toISOString(),
          source: eventSource,
          isAllDay: false,
          createdAt: new Date().toISOString(),
        };
      });
    }).flat();
    const oneTimeEvents = weeklyTemplate
      .filter((entry) => entry.isOneTime && entry.oneTimeDate)
      .flatMap((entry) => {
        if (!entry.oneTimeDate) return [];
        const eventDate = new Date(`${entry.oneTimeDate}T00:00:00`);
        if (Number.isNaN(eventDate.getTime())) return [];
        const normalizedDate = startOfDay(eventDate);
        if (normalizedDate < base || normalizedDate >= rangeEnd) return [];
        const [sh, sm] = parseTime(entry.startTime);
        const [eh, em] = parseTime(entry.endTime);
        return [
          {
            id: `me-${entry.id}-${entry.oneTimeDate}`,
            title: entry.title,
            start: setMinutes(setHours(normalizedDate, sh), sm).toISOString(),
            end: setMinutes(setHours(normalizedDate, eh), em).toISOString(),
            source: eventSource,
            isAllDay: false,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    const events = [...recurringEvents, ...oneTimeEvents];

    // Attempt save up to 2 times (retry once on failure).
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await manualScheduleRepo.deleteAll();
        await manualScheduleRepo.saveMany(weeklyTemplate);
        await eventsRepo.deleteAll();
        await eventsRepo.saveMany(events);
        const src = usingIcsTemplate
          ? { type: 'ics' as const, filename: importedFilename, lastImportedAt: new Date().toISOString() }
          : { type: 'manual' as const, lastImportedAt: new Date().toISOString() };
        await scheduleSourceRepo.save(src);
        setScheduleSource(src);

        await syncNudgePlansForCurrentSchedule(preferences);
        const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
        setUpcomingPlans(refreshedUpcoming);

        analyticsService.track('schedule_saved', {
          source: usingIcsTemplate ? 'ics' : 'manual',
          weeklyEntries: weeklyTemplate.filter((entry) => !entry.isOneTime).length,
          oneTimeEntries: weeklyTemplate.filter((entry) => entry.isOneTime).length,
          generatedEvents: events.length,
          manageMode,
        });

        setInitialSignature(currentSignature);
        setHasSavedSchedule(true);
        setSavingDone(false);

        if (manageMode) {
          showMessage(
            'Schedule saved',
            'Your schedule was updated and walking opportunities were synced.',
            exitManualScreen
          );
          return;
        }

        if (requireSaveBeforeContinue) {
          return;
        }

        navigation.navigate('Preferences', {});
        return;
      } catch (err) {
        lastError = err;
        console.error(`Save schedule attempt ${attempt + 1} failed:`, err);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
    }

    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    setSaveError(`Save failed: ${msg}`);
    setSavingDone(false);
  };

  const handleDone = () => {
    if (savingDone) return;
    const total = Object.values(entriesByDay).reduce((sum, arr) => sum + arr.length, 0);
    if (total === 0) {
      showMessage('Empty', 'Add at least one event.');
      return;
    }
    if (manageMode && !hasUnsavedChanges && !hasPendingImportedSchedule) {
      showMessage(
        'No changes',
        'No changes were detected. Your existing schedule is already active.',
        exitManualScreen
      );
      return;
    }

    const message = SAVE_CONFIRM_MESSAGE;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(message);
      if (ok) {
        void performSave();
      }
      return;
    }

    Alert.alert(
      SAVE_CONFIRM_TITLE,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: SAVE_CONFIRM_ACTION, onPress: () => { void performSave(); } },
      ]
    );
  };

  const handleContinueAfterSave = () => {
    if (savingDone) return;
    if (!hasSavedSchedule || hasUnsavedChanges) {
      if (hasUnsavedChanges) {
        showMessage('Unsaved changes', 'Save your latest schedule changes before continuing.');
        return;
      }
      showMessage('Save first', 'Please save this schedule before continuing.');
      return;
    }
    navigation.navigate('Preferences', {});
  };

  const entriesByDaySorted = useMemo(() => {
    const out: Record<number, TemplateEvent[]> = {};
    for (let d = 0; d <= 6; d++) {
      const arr = entriesByDay[d] ?? [];
      out[d] = [...arr].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return out;
  }, [entriesByDay]);

  const handleBack = () => {
    exitManualScreen();
  };

  const applyE2ESampleSchedule = () => {
    const newEvent: TemplateEvent = {
      id: `e2e-${Date.now()}`,
      title: 'E2E Sample Block',
      startTime: '09:00',
      endTime: '10:00',
    };
    setEntriesByDay((prev) => ({
      ...prev,
      [selectedDay]: [...(prev[selectedDay] ?? []), newEvent],
    }));
    analyticsService.track('e2e_sample_manual_schedule_seeded', { dayOfWeek: selectedDay });
  };

  /* ── Clear day ── */
  const handleClearDay = () => {
    const dayName = DAY_FULL_NAMES[selectedDay];
    const count = (entriesByDay[selectedDay] ?? []).length;
    if (count === 0) return;
    const title = `Clear ${dayName}?`;
    const message = `This will remove all ${count} event${count > 1 ? 's' : ''} from ${dayName}.`;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${title}\n\n${message}`)) {
        setEntriesByDay((prev) => ({ ...prev, [selectedDay]: [] }));
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setEntriesByDay((prev) => ({ ...prev, [selectedDay]: [] })) },
    ]);
  };

  /* ── Copy day ── */
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);

  const handleCopyDay = () => {
    const count = (entriesByDay[selectedDay] ?? []).length;
    if (count === 0) {
      showMessage('Nothing to copy', `${DAY_FULL_NAMES[selectedDay]} has no events.`);
      return;
    }
    setCopyTargets([]);
    setShowCopyModal(true);
  };

  const confirmCopyDay = () => {
    if (copyTargets.length === 0) return;
    const sourceEvents = entriesByDay[selectedDay] ?? [];
    setEntriesByDay((prev) => {
      const next = { ...prev };
      for (const target of copyTargets) {
        const copied = sourceEvents.map((ev) => ({
          ...ev,
          id: `${ev.id}-cp-${target}-${Date.now()}`,
          isOneTime: false as const,
          oneTimeDate: undefined,
        }));
        next[target] = [...(next[target] ?? []), ...copied];
      }
      return next;
    });
    setShowCopyModal(false);
    showMessage('Copied', `Copied ${sourceEvents.length} event${sourceEvents.length > 1 ? 's' : ''} to ${copyTargets.length} day${copyTargets.length > 1 ? 's' : ''}.`);
  };

  /* ── Current-time indicator ── */
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDayIndex = now.getDay();
  const isSelectedDayToday = selectedDay === todayDayIndex;
  const nowOffsetMin = nowMinutes >= GRID_START_MIN ? nowMinutes - GRID_START_MIN : nowMinutes + (24 * 60 - GRID_START_MIN);
  const nowTop = (nowOffsetMin / SLOT_MINUTES) * SLOT_HEIGHT;

  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const gridBodyMaxHeight = Math.max(320, winHeight - 220);
  const selectedDayEvents = entriesByDaySorted[selectedDay] ?? [];
  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';
  const mintTextOnTint = isDark ? theme.colors.accentPrimary : '#0f5132';
  const gridLineStrong = isDark ? 'rgba(255,255,255,0.1)' : palette.borderStrong;
  const gridLineSoft = isDark ? 'rgba(255,255,255,0.06)' : palette.borderSoft;
  const gridAltBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.03)';
  const eventBorderColor = isDark ? 'rgba(0,0,0,0.08)' : 'rgba(15,23,42,0.2)';
  const themedInput = {
    backgroundColor: isDark ? theme.colors.bgApp : palette.bgSurfaceElevated,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : palette.borderStrong,
    borderWidth: 1,
    color: palette.textPrimary,
  };
  const themedChip = {
    backgroundColor: isDark ? theme.colors.bgApp : palette.bgSurfaceElevated,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : palette.borderStrong,
    borderWidth: 1,
  };
  const appearTranslateY = appearAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
      <Animated.View
        style={[
          styles.screen,
          {
            opacity: appearAnim,
            transform: [{ translateY: appearTranslateY }],
          },
        ]}
      >
      <View style={styles.header}>
        <ScreenHeader
          title={manageMode ? 'Manage your schedule' : 'Set up your schedule'}
          subtitle={manageMode
            ? (showEditor ? 'Edit your schedule and save when ready.' : 'Choose your schedule source, then proceed to edit.')
            : 'Build your weekly schedule'}
          onBack={manageMode ? (showEditor ? () => setShowEditor(false) : undefined) : handleBack}
          backTestID="manual-back"
        />
        {showEditor && usingIcsTemplate && (
          <View style={styles.icsBadge}>
            <Text variant="bodySmall" style={[styles.icsBadgeText, { color: mintTextOnTint }]} numberOfLines={1}>
              ICS file: {importedFilename}
            </Text>
          </View>
        )}
        {requireSaveBeforeContinue && (
          <Text variant="bodySmall" style={styles.importHint}>
            {usingIcsTemplate
              ? typeof importedEventCount === 'number' && importedEventCount > 0
                ? `Loaded ${importedEventCount} events from your calendar file. Review the grid, tap Save, then Continue.`
                : 'Review the imported schedule, make any edits, then tap Save. When ready, tap Continue.'
              : 'Build your weekly schedule, tap Save, then tap Continue.'}
          </Text>
        )}
      </View>

      {/* ── Landing: source selection (manage-mode only, before editor) ── */}
      {!showEditor && manageMode && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.landingContent, { flexGrow: 1 }]}>
          <Card elevated style={styles.landingCard}>
            <View style={styles.landingLabelRow}>
              <AppIcon name="calendar" size={14} color={palette.accentPrimary} />
              <Text variant="bodySmall" style={{ color: palette.textMuted }}>
                Schedule source
              </Text>
            </View>
            <View style={styles.landingRow}>
              <Pressable
                onPress={() => setSelectedSource('manual')}
                android_ripple={{ color: selectedSource === 'manual' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)' }}
                style={({ pressed }) => [
                  styles.landingPill,
                  {
                    backgroundColor: selectedSource === 'manual' ? palette.accentPrimary : palette.bgSurface,
                    borderColor: selectedSource === 'manual' ? 'transparent' : palette.borderStrong,
                  },
                  pressed && styles.landingPillPressed,
                ]}
              >
                <Text
                  variant="body"
                  style={[
                    styles.landingPillLabel,
                    { color: selectedSource === 'manual' ? '#06261d' : palette.textPrimary },
                  ]}
                >
                  {selectedSource === 'manual' ? '\u2713  Manual' : 'Manual'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedSource('import')}
                android_ripple={{ color: selectedSource === 'import' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)' }}
                style={({ pressed }) => [
                  styles.landingPill,
                  {
                    backgroundColor: selectedSource === 'import' ? palette.accentPrimary : palette.bgSurface,
                    borderColor: selectedSource === 'import' ? 'transparent' : palette.borderStrong,
                  },
                  pressed && styles.landingPillPressed,
                ]}
              >
                <Text
                  variant="body"
                  style={[
                    styles.landingPillLabel,
                    { color: selectedSource === 'import' ? '#06261d' : palette.textPrimary },
                  ]}
                >
                  {selectedSource === 'import' ? '\u2713  Import' : 'Import'}
                </Text>
              </Pressable>
            </View>
          </Card>

          <Card elevated style={styles.landingCard}>
            <View style={styles.landingLabelRow}>
              <AppIcon name="adjust" size={14} color={palette.accentPrimary} />
              <Text variant="bodySmall" style={{ color: palette.textMuted }}>
                About this option
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: palette.textMuted, lineHeight: 20, marginTop: 2 }}>
              {selectedSource === 'manual'
                ? 'Build your weekly schedule with a calendar grid. Tap time-slots to mark when you are busy.'
                : 'Upload a .ics calendar file and GapWalk will populate the grid for you automatically.'}
            </Text>
          </Card>

          {selectedSource === 'import' && scheduleSource?.type === 'ics' && scheduleSource.filename && (
            <Card elevated style={styles.landingCard}>
              <View style={styles.landingLabelRow}>
                <AppIcon name="calendar" size={14} color={palette.accentPrimary} />
                <Text variant="bodySmall" style={{ color: palette.textMuted }}>
                  Previously imported
                </Text>
              </View>
              <View style={styles.landingFileRow}>
                <Text variant="bodySmall" style={{ color: palette.accentPrimary, lineHeight: 20, flex: 1 }} numberOfLines={1}>
                  {scheduleSource.filename}
                </Text>
                <Pressable
                  onPress={() => { void handleReImportIcs(); }}
                  style={({ pressed }) => [
                    styles.landingChangeBtn,
                    { borderColor: palette.accentPrimary },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text variant="bodySmall" style={{ color: palette.accentPrimary, fontWeight: theme.fontWeight.semibold }}>
                    Change
                  </Text>
                </Pressable>
              </View>
            </Card>
          )}

          {importLoading && importStatus && (
            <View style={styles.landingStatusRow}>
              <ActivityIndicator size="small" color={palette.accentPrimary} />
              <Text variant="bodySmall" style={{ color: palette.accentPrimary, marginLeft: 8 }}>{importStatus}</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.landingFooter}>
            <View style={styles.landingBtnRow}>
              <Button
                title="Cancel"
                variant="danger"
                onPress={handleLandingCancel}
                style={styles.footerBtn}
                disabled={importLoading}
              />
              <Button
                title="Proceed"
                onPress={handleLandingProceed}
                style={styles.footerBtn}
                disabled={importLoading}
              />
            </View>
            <Text variant="muted" style={styles.privacy}>Your schedule stays private. Privacy is our top priority.</Text>
          </View>
        </ScrollView>
      )}

      {/* ── Grid editor (visible after proceeding from landing) ── */}
      {(showEditor || !manageMode) && (
      <>
      {/* Day tabs (Google Calendar style: select one day) */}
      <View style={[styles.dayTabsWrap, { borderBottomColor: gridLineSoft }]}>
        {DAY_TAB_LABELS.map((d, idx) => {
          const active = idx === selectedDay;
          const eventCount = (entriesByDay[idx] ?? []).length;
          const isToday = idx === todayDayIndex;
          return (
            <TouchableOpacity
              key={d}
              style={[styles.dayTab, active && styles.dayTabActive]}
              onPress={() => setSelectedDay(idx)}
              activeOpacity={0.8}
            >
              <Text
                variant="bodySmall"
                style={StyleSheet.flatten([
                  styles.dayTabText,
                  active && styles.dayTabTextActive,
                  active && { color: mintTextOnTint },
                  isToday && !active && { color: palette.textPrimary },
                ])}
              >
                {d}
              </Text>
              {eventCount > 0 && (
                <View style={[styles.dayTabBadge, { backgroundColor: active ? palette.accentPrimary : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.12)') }]}>
                  <Text style={[styles.dayTabBadgeText, { color: active ? '#06261d' : palette.textMuted }]}>{eventCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Quick actions toolbar */}
      <View style={[styles.gridToolbar, { borderBottomColor: gridLineSoft }]}>
        <Text variant="bodySmall" style={{ color: palette.textPrimary, fontWeight: theme.fontWeight.semibold }}>
          {DAY_FULL_NAMES[selectedDay]}
        </Text>
        <View style={styles.gridToolbarActions}>
          <Pressable
            onPress={handleCopyDay}
            style={({ pressed }) => [styles.gridToolbarBtn, { borderColor: palette.borderStrong }, pressed && { opacity: 0.6 }]}
          >
            <AppIcon name="sync" size={12} color={palette.textMuted} />
            <Text variant="bodySmall" style={{ color: palette.textMuted, marginLeft: 4 }}>Copy</Text>
          </Pressable>
          <Pressable
            onPress={handleClearDay}
            disabled={(entriesByDay[selectedDay] ?? []).length === 0}
            style={({ pressed }) => [styles.gridToolbarBtn, { borderColor: palette.borderStrong }, pressed && { opacity: 0.6 }, (entriesByDay[selectedDay] ?? []).length === 0 && { opacity: 0.35 }]}
          >
            <Text variant="bodySmall" style={{ color: palette.textMuted }}>Clear</Text>
          </Pressable>
        </View>
      </View>

      {/* Day view: scrollable time grid for selected day only */}
      <View style={[styles.gridContainer, { paddingHorizontal: GRID_PADDING }]}>
        <View style={[styles.gridWrap, { backgroundColor: palette.bgSurface, borderColor: gridLineStrong, shadowColor: palette.shadow, shadowOpacity: isDark ? 0.25 : 0.12 }]}>
          <ScrollView
            ref={gridScrollRef}
            style={[styles.gridBodyScroll, { maxHeight: gridBodyMaxHeight }]}
            contentContainerStyle={{ height: GRID_BODY_HEIGHT }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.gridBodyRow}>
              <View style={[styles.gridTimeCol, { backgroundColor: palette.bgSurface, borderRightColor: gridLineStrong }]}>
                {SLOT_INDICES.map((idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.gridTimeSlot,
                      idx % 2 === 1 && styles.gridTimeSlotHalf,
                      idx % 2 === 0 && [styles.gridHourLine, { borderTopColor: gridLineStrong }],
                    ]}
                  >
                    {idx % 2 === 0 ? (
                      <Text variant="bodySmall" color={palette.textMuted} style={styles.gridTimeLabel}>
                        {FULL_HOUR_LABELS[idx / 2]}
                      </Text>
                    ) : (
                      <View style={[styles.gridTimeHalfLine, { borderTopColor: gridLineSoft }]} />
                    )}
                  </View>
                ))}
                {/* NOW label in time column */}
                {isSelectedDayToday && (
                  <View style={[styles.nowTimeLabel, { top: nowTop - 8 }]} pointerEvents="none">
                    <Text style={styles.nowTimeLabelText}>NOW</Text>
                  </View>
                )}
              </View>
              <View style={styles.gridDayColSingle}>
                {SLOT_INDICES.map((slotIndex) => {
                  const isHovered = hoveredSlot === slotIndex;
                  return (
                    <View
                      key={slotIndex}
                      style={[
                        styles.gridSlot, { borderBottomColor: gridLineSoft },
                        slotIndex % 2 === 1 && [styles.gridSlotAlt, { backgroundColor: gridAltBg }],
                        slotIndex % 2 === 0 && [styles.gridSlotHourBorder, { borderBottomColor: gridLineStrong }],
                        isHovered && styles.gridSlotHover,
                      ]}
                      {...(Platform.OS === 'web' && {
                        onMouseEnter: () => setHoveredSlot(slotIndex),
                        onMouseLeave: () => setHoveredSlot(null),
                      } as any)}
                    >
                      <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        onPress={() => handleSlotClick(selectedDay, slotIndex)}
                        activeOpacity={0.7}
                      />
                    </View>
                  );
                })}
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  {(() => {
                    // Compute overlap columns (Google Calendar algorithm)
                    type LayoutEvent = { ev: typeof selectedDayEvents[0]; startMin: number; endMin: number; col: number; totalCols: number };
                    const items: LayoutEvent[] = selectedDayEvents.map((ev) => {
                      const s = hhmmToMinutes(ev.startTime);
                      let e = hhmmToMinutes(ev.endTime);
                      if (e <= s) e += 24 * 60;
                      return { ev, startMin: s, endMin: e, col: 0, totalCols: 1 };
                    });
                    // Sort by start, then by longer duration first
                    items.sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));
                    // Group overlapping events into clusters
                    const clusters: LayoutEvent[][] = [];
                    for (const item of items) {
                      let placed = false;
                      for (const cluster of clusters) {
                        const clusterEnd = Math.max(...cluster.map((c) => c.endMin));
                        if (item.startMin < clusterEnd) {
                          // Find first available column
                          const usedCols = new Set(cluster.map((c) => c.col));
                          let col = 0;
                          while (usedCols.has(col)) col++;
                          item.col = col;
                          cluster.push(item);
                          placed = true;
                          break;
                        }
                      }
                      if (!placed) {
                        item.col = 0;
                        clusters.push([item]);
                      }
                    }
                    // Set totalCols for each cluster
                    for (const cluster of clusters) {
                      const maxCol = Math.max(...cluster.map((c) => c.col)) + 1;
                      for (const c of cluster) c.totalCols = maxCol;
                    }

                    return items.map(({ ev, startMin, endMin, col, totalCols }) => {
                    const top = Math.max(0, (startMin - GRID_START_MIN) / SLOT_MINUTES * SLOT_HEIGHT);
                    const spanMin = Math.min(endMin - startMin, GRID_END_MIN - startMin);
                    const height = Math.max(SLOT_HEIGHT / 2, (spanMin / SLOT_MINUTES) * SLOT_HEIGHT);
                    const maxHeight = GRID_BODY_HEIGHT - top;
                    const finalHeight = Math.min(height, maxHeight);
                    const titleFontSize = Math.round(Math.min(16, Math.max(11, finalHeight * 0.20)));
                    const timeFontSize = Math.round(titleFontSize * 0.82);
                    const paddingV = Math.min(10, Math.max(4, Math.floor(finalHeight * 0.08)));
                    const showMeta = finalHeight >= 46 && totalCols <= 2;
                    const rangeLabel = `${formatTime12(ev.startTime)} - ${formatTime12(ev.endTime)}`;
                    let subLabel = rangeLabel;
                    if (ev.isOneTime && ev.oneTimeDate) {
                      const dt = new Date(`${ev.oneTimeDate}T00:00:00`);
                      if (!Number.isNaN(dt.getTime())) {
                        subLabel = `One-time • ${format(dt, 'EEE, MMM d')} • ${rangeLabel}`;
                      } else {
                        subLabel = `One-time event • ${rangeLabel}`;
                      }
                    }
                    // Overlap layout: divide width by totalCols, offset by col
                    const colWidthPct = `${100 / totalCols}%` as const;
                    const leftPct = `${(col / totalCols) * 100}%` as const;
                    const overlapStyle = totalCols > 1
                      ? { left: leftPct, width: colWidthPct, right: undefined as any, paddingHorizontal: 6 }
                      : {};
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        style={[styles.gridEventBlock, { top, height: finalHeight, paddingVertical: paddingV, borderColor: eventBorderColor }, overlapStyle]}
                        onPress={() => openModalFromEvent(ev, selectedDay)}
                        activeOpacity={0.9}
                      >
                        <View style={styles.gridEventTopRow}>
                          <Text
                            numberOfLines={totalCols > 1 ? 2 : 1}
                            style={StyleSheet.flatten([
                              styles.gridEventTitle,
                              { fontSize: totalCols > 2 ? Math.max(10, titleFontSize - 2) : titleFontSize, marginRight: ev.isOneTime ? 6 : 0 },
                            ])}
                          >
                            {ev.title}
                          </Text>
                          {ev.isOneTime && totalCols <= 2 ? (
                            <View style={styles.gridEventBadge}>
                              <Text variant="bodySmall" style={styles.gridEventBadgeText}>One-time event</Text>
                            </View>
                          ) : null}
                        </View>
                        {showMeta ? (
                          <Text numberOfLines={1} style={StyleSheet.flatten([styles.gridEventTime, { fontSize: timeFontSize }])}>
                            {subLabel}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  });
                  })()}
                </View>
                {/* Current-time indicator (red line) */}
                {isSelectedDayToday && (
                  <View style={[styles.nowLine, { top: nowTop }]} pointerEvents="none">
                    <View style={styles.nowDot} />
                    <View style={styles.nowLineBar} />
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      <View style={[styles.footer, { paddingHorizontal: GRID_PADDING }]}>
        {!!saveError && <Text variant="muted" style={styles.saveError}>{saveError}</Text>}
        {isE2E && (
          <Button
            title="Add sample event (E2E)"
            variant="muted"
            onPress={applyE2ESampleSchedule}
            testID="manual-e2e-seed"
            style={styles.e2eBtn}
            disabled={savingDone}
          />
        )}
        {manageMode ? (
          <View style={styles.footerActions}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={handleBack}
              style={styles.footerBtn}
              disabled={savingDone}
              testID="manual-cancel"
            />
            <Button
              title="Save"
              onPress={handleDone}
              style={styles.footerBtn}
              loading={savingDone}
              disabled={savingDone}
              testID="manual-save"
            />
          </View>
        ) : (
          requireSaveBeforeContinue ? (
            <View style={styles.footerActions}>
              <Button
                title="Save"
                onPress={handleDone}
                variant={isReadyToContinue ? 'secondary' : 'primary'}
                style={styles.footerBtn}
                loading={savingDone}
                disabled={savingDone}
                testID="manual-save"
              />
              <Button
                title="Continue"
                variant={isReadyToContinue ? 'primary' : 'secondary'}
                onPress={handleContinueAfterSave}
                style={styles.footerBtn}
                disabled={savingDone || !hasSavedSchedule || hasUnsavedChanges}
                testID="manual-continue"
              />
            </View>
          ) : (
            <Button title="Done" onPress={handleDone} full loading={savingDone} disabled={savingDone} testID="manual-done" />
          )
        )}
        <Text variant="muted" style={styles.privacy}>Your schedule stays private. Privacy is our top priority.</Text>
      </View>
      </>
      )}
      </Animated.View>

      <Modal
        visible={showAdd}
        onClose={() => { setShowAdd(false); setEditingEventId(null); }}
        title={editingEventId ? 'Edit Event' : 'Add Event'}
      >
        <View style={styles.mForm}>
          <Text variant="muted">Title</Text>
          <TextInput
            style={[styles.input, themedInput]}
            value={form.title}
            onChangeText={(t) => setForm((prev) => ({ ...prev, title: t }))}
            placeholder="e.g. Work, Class"
            placeholderTextColor={palette.textMuted}
          />

          <Text variant="muted">Frequency</Text>
          <View style={styles.freqModeRow}>
            <TouchableOpacity
              style={[
                styles.freqModeChip,
                themedChip,
                form.repeatMode === 'weekly' && styles.freqModeChipActive,
              ]}
              onPress={() => setRepeatMode('weekly')}
            >
              <Text
                variant="bodySmall"
                style={StyleSheet.flatten([
                  styles.freqModeText,
                  form.repeatMode === 'weekly' && styles.freqModeTextActive,
                  form.repeatMode === 'weekly' && { color: mintTextOnTint },
                ])}
              >
                Repeats weekly
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.freqModeChip,
                themedChip,
                form.repeatMode === 'one_time' && styles.freqModeChipActive,
              ]}
              onPress={() => setRepeatMode('one_time')}
            >
              <Text
                variant="bodySmall"
                style={StyleSheet.flatten([
                  styles.freqModeText,
                  form.repeatMode === 'one_time' && styles.freqModeTextActive,
                  form.repeatMode === 'one_time' && { color: mintTextOnTint },
                ])}
              >
                One-time event
              </Text>
            </TouchableOpacity>
          </View>

          {form.repeatMode === 'weekly' ? (
            <>
              <Text variant="muted">Days (select one or more)</Text>
              <View style={styles.repeatDaysRow}>
                {DAY_TAB_LABELS.map((d, idx) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.repeatDayChip, themedChip, form.repeatDays.includes(idx) && styles.repeatDayChipActive]}
                    onPress={() => toggleRepeatDay(idx)}
                  >
                    <Text
                      variant="bodySmall"
                      style={StyleSheet.flatten([
                        styles.repeatDayChipText,
                        form.repeatDays.includes(idx) && styles.repeatDayChipTextActive,
                        form.repeatDays.includes(idx) && { color: mintTextOnTint },
                      ])}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text variant="muted" style={styles.repeatHint}>
                {editingEventId
                  ? 'Tap days to add or remove this event. At least one day must be selected.'
                  : 'This event repeats every week on the selected days.'}
              </Text>
            </>
          ) : (
            <>
              <Text variant="muted">Event date</Text>
              <View style={styles.dateInputRow}>
                <TextInput
                  ref={oneTimeMonthRef}
                  style={[styles.input, styles.datePartInput, themedInput]}
                  value={form.oneTimeMonthRaw}
                  onChangeText={(value) => handleOneTimeDateInputChange('oneTimeMonthRaw', value)}
                  onBlur={() => blurOneTimeDateInput('oneTimeMonthRaw', 'month')}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor={palette.textMuted}
                  returnKeyType="next"
                  selectTextOnFocus
                />
                <Text variant="body" style={styles.dateSep}>/</Text>
                <TextInput
                  ref={oneTimeDayRef}
                  style={[styles.input, styles.datePartInput, themedInput]}
                  value={form.oneTimeDayRaw}
                  onChangeText={(value) => handleOneTimeDateInputChange('oneTimeDayRaw', value)}
                  onBlur={() => blurOneTimeDateInput('oneTimeDayRaw', 'day')}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="DD"
                  placeholderTextColor={palette.textMuted}
                  returnKeyType="next"
                  selectTextOnFocus
                />
                <Text variant="body" style={styles.dateSep}>/</Text>
                <TextInput
                  ref={oneTimeYearRef}
                  style={[styles.input, styles.dateYearInput, themedInput]}
                  value={form.oneTimeYearRaw}
                  onChangeText={(value) => handleOneTimeDateInputChange('oneTimeYearRaw', value)}
                  onBlur={() => blurOneTimeDateInput('oneTimeYearRaw', 'year')}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="YYYY"
                  placeholderTextColor={palette.textMuted}
                  returnKeyType="done"
                  selectTextOnFocus
                />
              </View>
              {!!oneTimeDateError && <Text variant="muted" style={styles.timeError}>{oneTimeDateError}</Text>}
              <Text variant="muted" style={styles.repeatHint}>
                This event is used once on the selected date only.
              </Text>
            </>
          )}

          <Text variant="muted">Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, themedInput]}
            value={form.description}
            onChangeText={(t) => setForm((prev) => ({ ...prev, description: t }))}
            placeholder="Add a description"
            placeholderTextColor={palette.textMuted}
            multiline
            numberOfLines={2}
          />

          <View style={styles.timeR}>
            <View style={styles.timeC}>
              <Text variant="muted">Start</Text>
              <View style={styles.timeInputRow}>
                <View style={styles.clockRow}>
                  <TwoDigitTimeInput
                    mode="hour"
                    style={[styles.input, styles.timeInput, themedInput]}
                    value={form.startHourRaw}
                    onChange={(value) => setForm((prev) => ({ ...prev, startHourRaw: value }))}
                    onBlurNormalize={() =>
                      setForm((prev) => ({
                        ...prev,
                        startHourRaw: normalizeOnBlur('hour', prev.startHourRaw),
                      }))
                    }
                    placeholder="HH"
                  />
                  <Text variant="body">:</Text>
                  <TwoDigitTimeInput
                    mode="minute"
                    style={[styles.input, styles.timeInput, themedInput]}
                    value={form.startMinuteRaw}
                    onChange={(value) => setForm((prev) => ({ ...prev, startMinuteRaw: value }))}
                    onBlurNormalize={() =>
                      setForm((prev) => ({
                        ...prev,
                        startMinuteRaw: normalizeOnBlur('minute', prev.startMinuteRaw),
                      }))
                    }
                    placeholder="MM"
                  />
                </View>
                <View style={styles.periodRow}>
                  {(['AM', 'PM'] as const).map((p) => (
                    <TouchableOpacity
                      key={`start-${p}`}
                      style={[styles.periodBtn, themedChip, form.startPeriod === p && styles.periodBtnActive]}
                      onPress={() => setForm((prev) => ({ ...prev, startPeriod: p }))}
                    >
                      <Text variant="bodySmall" color={form.startPeriod === p ? theme.colors.bgApp : theme.colors.textPrimary}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.timeC}>
              <Text variant="muted">End</Text>
              <View style={styles.timeInputRow}>
                <View style={styles.clockRow}>
                  <TwoDigitTimeInput
                    mode="hour"
                    style={[styles.input, styles.timeInput, themedInput]}
                    value={form.endHourRaw}
                    onChange={(value) => setForm((prev) => ({ ...prev, endHourRaw: value }))}
                    onBlurNormalize={() =>
                      setForm((prev) => ({
                        ...prev,
                        endHourRaw: normalizeOnBlur('hour', prev.endHourRaw),
                      }))
                    }
                    placeholder="HH"
                  />
                  <Text variant="body">:</Text>
                  <TwoDigitTimeInput
                    mode="minute"
                    style={[styles.input, styles.timeInput, themedInput]}
                    value={form.endMinuteRaw}
                    onChange={(value) => setForm((prev) => ({ ...prev, endMinuteRaw: value }))}
                    onBlurNormalize={() =>
                      setForm((prev) => ({
                        ...prev,
                        endMinuteRaw: normalizeOnBlur('minute', prev.endMinuteRaw),
                      }))
                    }
                    placeholder="MM"
                  />
                </View>
                <View style={styles.periodRow}>
                  {(['AM', 'PM'] as const).map((p) => (
                    <TouchableOpacity
                      key={`end-${p}`}
                      style={[styles.periodBtn, themedChip, form.endPeriod === p && styles.periodBtnActive]}
                      onPress={() => setForm((prev) => ({ ...prev, endPeriod: p }))}
                    >
                      <Text variant="bodySmall" color={form.endPeriod === p ? theme.colors.bgApp : theme.colors.textPrimary}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
          {!!timeError && <Text variant="muted" style={styles.timeError}>{timeError}</Text>}

          <View style={styles.saveButtonWrap}>
            <Button title="Save" onPress={addOrUpdateEntry} disabled={!canAdd} />
          </View>
          {editingEventId ? (
            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} activeOpacity={0.8}>
              <Text variant="bodySmall" color={theme.colors.error} style={styles.deleteBtnText}>Delete event</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Modal>

      {/* Copy Day modal */}
      <Modal
        visible={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        title={`Copy ${DAY_FULL_NAMES[selectedDay]}`}
      >
        <View style={styles.mForm}>
          <Text variant="muted" style={{ marginBottom: 8 }}>
            Copy {(entriesByDay[selectedDay] ?? []).length} event{(entriesByDay[selectedDay] ?? []).length !== 1 ? 's' : ''} to:
          </Text>
          <View style={styles.daySelectorRow}>
            {DAY_TAB_LABELS.map((label, idx) => {
              if (idx === selectedDay) return null;
              const isSelected = copyTargets.includes(idx);
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.daySelectorBtn, isSelected && styles.daySelectorBtnActive]}
                  onPress={() => {
                    setCopyTargets((prev) =>
                      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b)
                    );
                  }}
                  activeOpacity={0.8}
                >
                  <Text variant="bodySmall" style={{ color: isSelected ? '#06261d' : palette.textPrimary, fontWeight: isSelected ? theme.fontWeight.bold : theme.fontWeight.medium }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ marginTop: 16, gap: 10 }}>
            <Button title="Paste" onPress={confirmCopyDay} disabled={copyTargets.length === 0} full />
            <Button title="Cancel" variant="secondary" onPress={() => setShowCopyModal(false)} full />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bgApp },
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.lg + 28,
    paddingBottom: theme.spacing.sm,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  icsBadge: {
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(46,233,166,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46,233,166,0.24)',
  },
  icsBadgeText: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  importHint: {
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  sourceCard: {
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceInfo: { flex: 1 },
  sourceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sourceValue: {
    fontWeight: theme.fontWeight.semibold,
  },
  sourceActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  sourceActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  /* landing phase */
  landingContent: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.md,
    paddingBottom: 40,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  landingCard: {
    marginBottom: 20,
  },
  landingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  landingRow: {
    flexDirection: 'row',
    gap: 10,
  },
  landingPill: {
    flex: 1,
    minHeight: theme.layout.buttonHeight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  landingPillPressed: {
    transform: [{ scale: 0.985 }],
  },
  landingPillLabel: {
    fontWeight: theme.fontWeight.semibold,
  },
  landingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  landingFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  landingChangeBtn: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  landingFooter: {
    paddingTop: 20,
  },
  landingBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  e2eBtn: {
    marginBottom: 8,
  },
  dayTabsWrap: {
    flexDirection: 'row',
    paddingHorizontal: GRID_PADDING,
    paddingVertical: theme.spacing.sm,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  dayTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  dayTabActive: {
    backgroundColor: 'rgba(46,233,166,0.18)',
  },
  dayTabText: {
    color: theme.colors.textMuted,
    fontWeight: theme.fontWeight.semibold,
  },
  dayTabTextActive: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.bold,
  },
  dayTabBadge: {
    marginTop: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dayTabBadgeText: {
    fontSize: 9,
    fontWeight: '700' as any,
  },
  gridToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridToolbarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  gridToolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginLeft: -4,
  },
  nowLineBar: {
    flex: 1,
    height: 2,
    backgroundColor: '#ef4444',
  },
  nowTimeLabel: {
    position: 'absolute',
    left: 2,
    zIndex: 20,
  },
  nowTimeLabelText: {
    fontSize: 8,
    fontWeight: '800' as any,
    color: '#ef4444',
    letterSpacing: 0.5,
  },
  gridContainer: {
    flex: 1,
    width: '100%',
    paddingVertical: GRID_PADDING,
  },
  gridWrap: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  gridBodyScroll: {
    flexGrow: 0,
  },
  gridBodyRow: {
    flexDirection: 'row',
    height: GRID_BODY_HEIGHT,
  },
  gridTimeCol: {
    width: TIME_COL_WIDTH,
    backgroundColor: theme.colors.bgSurface,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    overflow: 'hidden',
  },
  gridTimeSlot: {
    height: SLOT_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 6,
  },
  gridTimeSlotHalf: {
    justifyContent: 'flex-start',
  },
  gridHourLine: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  gridTimeHalfLine: {
    width: '100%',
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  gridTimeLabel: {
    fontSize: theme.fontSize.sm,
  },
  gridDayColSingle: {
    flex: 1,
    position: 'relative',
    borderRightWidth: 0,
  },
  gridSlot: {
    height: SLOT_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  gridSlotAlt: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  gridSlotHourBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  gridSlotHover: {
    backgroundColor: 'rgba(46,233,166,0.12)',
  },
  gridEventBlock: {
    position: 'absolute',
    left: 3,
    right: 3,
    marginTop: 2,
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: 'rgba(2,6,23,0.35)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  gridEventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  gridEventTitle: {
    color: theme.colors.bgApp,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -0.1,
    flex: 1,
  },
  gridEventBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 7,
    backgroundColor: 'rgba(2,6,23,0.2)',
    marginTop: 1,
  },
  gridEventBadgeText: {
    color: 'rgba(2,6,23,0.82)',
    fontSize: 9,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.2,
  },
  gridEventTime: {
    color: 'rgba(2,6,23,0.78)',
    marginTop: 4,
    fontWeight: theme.fontWeight.medium,
  },
  daySelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  daySelectorBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.bgApp,
  },
  daySelectorBtnActive: {
    backgroundColor: theme.colors.accentPrimary,
  },
  freqModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  freqModeChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqModeChipActive: {
    backgroundColor: 'rgba(46,233,166,0.2)',
    borderColor: theme.colors.accentPrimary,
  },
  freqModeText: {
    color: theme.colors.textMuted,
    fontWeight: theme.fontWeight.medium,
  },
  freqModeTextActive: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.semibold,
  },
  repeatDaysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  repeatDayChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.bgApp,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  repeatDayChipActive: {
    backgroundColor: 'rgba(46,233,166,0.2)',
    borderColor: theme.colors.accentPrimary,
  },
  repeatDayChipText: {
    color: theme.colors.textMuted,
  },
  repeatDayChipTextActive: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.semibold,
  },
  repeatHint: {
    fontSize: theme.fontSize.xs,
    marginTop: -4,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePartInput: {
    flex: 0,
    width: 64,
    textAlign: 'center',
  },
  dateYearInput: {
    flex: 1,
    minWidth: 86,
    textAlign: 'center',
  },
  dateSep: {
    fontWeight: theme.fontWeight.semibold,
  },
  inputMultiline: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  saveButtonWrap: {
    marginTop: 24,
  },
  deleteBtn: {
    alignSelf: 'center',
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  deleteBtnText: {
    fontWeight: theme.fontWeight.semibold,
  },
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
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
  privacy: { textAlign: 'center', marginTop: 12 },
  mForm: { gap: 12 },
  input: {
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    paddingHorizontal: 10,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    textAlignVertical: 'center',
  },
  lockedDay: {
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  timeR: { gap: 12 },
  timeC: { width: '100%' },
  timeInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: { flex: 0, width: 56, textAlign: 'center' },
  periodRow: { flexDirection: 'row', gap: 4 },
  periodBtn: {
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    minWidth: 42,
  },
  periodBtnActive: { backgroundColor: theme.colors.accentPrimary },
  timeError: {
    color: theme.colors.warning,
    marginTop: 2,
    marginBottom: 2,
  },
  saveError: {
    color: theme.colors.warning,
    textAlign: 'center',
    marginBottom: 8,
  },
});
