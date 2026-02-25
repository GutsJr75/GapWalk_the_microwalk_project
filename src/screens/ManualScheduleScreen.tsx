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
  Modal as RNModal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal as AppModal } from '../components/Modal';
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
import { toUserFriendlyError } from '../lib/errorMessages';
import {
  SAVE_CONFIRM_ACTION,
  SAVE_CONFIRM_DECLINE,
  SAVE_CONFIRM_MESSAGE,
  SAVE_CONFIRM_TITLE,
} from '../lib/confirmMessages';
import { analyticsService } from '../lib/analytics';
import { useAppStore } from '../store';
import { addDays, format, setHours, setMinutes, startOfDay } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualSchedule'>;
const DAY_TAB_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
// Full-day grid: 12:00 AM to 12:00 AM = 24 hours = 48 x 30-min slots
const GRID_START_MIN = 0;   // 12:00 AM
const GRID_END_MIN = 24 * 60;   // next day 12:00 AM (1440)
const SLOT_MINUTES = 30;
const NUM_SLOTS = 48;
// Horizontal layout: days = Y (rows), time = X (columns), scroll horizontally
const DAY_ROW_HEIGHT = 80;
const SLOT_WIDTH = DAY_ROW_HEIGHT;
const DAY_LABEL_WIDTH = 50;
const TIME_ROW_HEIGHT = 28;
const GRID_PADDING = 16;
// Legacy (for scroll-to-8am etc.)
const SLOT_HEIGHT = DAY_ROW_HEIGHT;
const GRID_BODY_HEIGHT = 7 * DAY_ROW_HEIGHT + TIME_ROW_HEIGHT;

const RECURRING_ID_DAY_SEPARATOR = '__d';

const createRecurringSeriesId = (): string =>
  `rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const parseRecurringSeriesId = (eventId: string): string | null => {
  if (eventId.includes(RECURRING_ID_DAY_SEPARATOR)) {
    return eventId.split(RECURRING_ID_DAY_SEPARATOR)[0] ?? null;
  }
  if (eventId.includes('-dup-')) {
    return eventId.split('-dup-')[0] ?? null;
  }
  const legacyMatch = eventId.match(/^(m-\d+)-\d+$/);
  if (legacyMatch?.[1]) {
    return legacyMatch[1];
  }
  return null;
};

const resolveRecurringSeriesId = (eventId: string): string =>
  parseRecurringSeriesId(eventId) ?? eventId;

const buildRecurringEventId = (seriesId: string, dayIndex: number): string =>
  `${seriesId}${RECURRING_ID_DAY_SEPARATOR}${dayIndex}`;

const to12HourParts = (totalMinutes: number): { hourRaw: string; minuteRaw: string; period: 'AM' | 'PM' } => {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return {
    hourRaw: String(hour12).padStart(2, '0'),
    minuteRaw: String(minute).padStart(2, '0'),
    period,
  };
};

// Full-hour labels only: "12 AM", "1 AM", ... "11 PM"
const FULL_HOUR_LABELS: string[] = (() => {
  const out: string[] = [];
  const startHour = Math.floor(GRID_START_MIN / 60) % 24;
  const totalHours = Math.max(1, Math.round((GRID_END_MIN - GRID_START_MIN) / 60));
  for (let i = 0; i < totalHours; i++) {
    const h = (startHour + i) % 24;
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
  const webTextInputReset = Platform.OS === 'web'
    ? ({
        outlineStyle: 'none',
        outlineWidth: 0,
        outlineColor: 'transparent',
        boxShadow: 'none',
      } as any)
    : null;

  return (
    <TextInput
      style={[style, webTextInputReset]}
      value={value}
      onChangeText={(nextText) => onChange(normalizeTyping(mode, nextText))}
      onBlur={onBlurNormalize}
      keyboardType="number-pad"
      maxLength={2}
      underlineColorAndroid="transparent"
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

interface GridDisplaySlice {
  key: string;
  event: TemplateEvent;
  sourceDayIndex: number;
  startMinuteInRow: number;
  endMinuteInRow: number;
  isCarryOver: boolean;
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

/** True if [s1,e1) and [s2,e2) overlap (handles overnight: pass end as start+24*60 if needed). */
const timeRangesOverlap = (s1: number, e1: number, s2: number, e2: number): boolean =>
  s1 < e2 && e1 > s2;

const normalizeToRowMinutes = (minutes: number): number =>
  minutes < GRID_START_MIN ? minutes + 24 * 60 : minutes;

const buildDayMinuteSegments = (
  ownerDayIndex: number,
  startMinute: number,
  endMinute: number
): Array<{ dayIndex: number; startMinute: number; endMinute: number }> => {
  if (endMinute <= startMinute) {
    return [
      { dayIndex: ownerDayIndex, startMinute, endMinute: 24 * 60 },
      { dayIndex: (ownerDayIndex + 1) % 7, startMinute: 0, endMinute },
    ].filter((segment) => segment.endMinute > segment.startMinute);
  }
  return [{ dayIndex: ownerDayIndex, startMinute, endMinute }];
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

const buildFormSignature = (form: ManualFormState): string => {
  return JSON.stringify({
    title: form.title,
    dayOfWeek: form.dayOfWeek,
    repeatDays: [...form.repeatDays].sort((a, b) => a - b),
    repeatMode: form.repeatMode,
    oneTimeDate: form.oneTimeDate,
    oneTimeMonthRaw: form.oneTimeMonthRaw,
    oneTimeDayRaw: form.oneTimeDayRaw,
    oneTimeYearRaw: form.oneTimeYearRaw,
    startHourRaw: form.startHourRaw,
    startMinuteRaw: form.startMinuteRaw,
    startPeriod: form.startPeriod,
    endHourRaw: form.endHourRaw,
    endMinuteRaw: form.endMinuteRaw,
    endPeriod: form.endPeriod,
    description: form.description,
  });
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

const cloneEntriesByDay = (entriesByDay: Record<number, TemplateEvent[]>): Record<number, TemplateEvent[]> => {
  const clone = createEmptyEntriesByDay();
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    clone[day] = (entriesByDay[day] ?? []).map((event) => ({ ...event }));
  }
  return clone;
};

export const ManualScheduleScreen: React.FC<Props> = ({ navigation, route }) => {
  const today = new Date();
  const todayIndex = Number.isFinite(today.getDay()) ? today.getDay() : 1;
  const manageMode = !!route.params?.manageMode;
  const routeImportedFilename = route.params?.importedFilename?.trim();
  const importedEventCount = route.params?.importedEventCount;
  const prefillTemplate = route.params?.prefillTemplate;
  const startWithEmpty = !!route.params?.startWithEmpty && !manageMode;
  const requireSaveBeforeContinue = !!route.params?.requireSaveBeforeContinue && !manageMode;
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';
  const initialSourceType: 'manual' | 'import' = routeImportedFilename ? 'import' : 'manual';
  const [entriesByDay, setEntriesByDay] = useState<Record<number, TemplateEvent[]>>(createEmptyEntriesByDay());
  const [savedEntriesByDay, setSavedEntriesByDay] = useState<Record<number, TemplateEvent[]>>(createEmptyEntriesByDay());
  const [initialSignature, setInitialSignature] = useState<string>(buildScheduleSignature(createEmptyEntriesByDay()));
  const [showAdd, setShowAdd] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [savingDone, setSavingDone] = useState(false);
  const [hasSavedSchedule, setHasSavedSchedule] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [form, setForm] = useState<ManualFormState>(() => createDefaultFormState(todayIndex));
  const [eventFormInitialSignature, setEventFormInitialSignature] = useState<string>('');
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [manageScreenMode, setManageScreenMode] = useState<'view' | 'edit'>(manageMode ? 'view' : 'edit');
  const [showSourceSheet, setShowSourceSheet] = useState(false);
  const [sourceType, setSourceType] = useState<'manual' | 'import'>(initialSourceType);
  const [savedSourceType, setSavedSourceType] = useState<'manual' | 'import'>(initialSourceType);
  const [importedFilename, setImportedFilename] = useState<string | undefined>(routeImportedFilename);
  const [savedImportedFilename, setSavedImportedFilename] = useState<string | undefined>(routeImportedFilename);
  const [sheetSourceType, setSheetSourceType] = useState<'manual' | 'import'>(initialSourceType);
  const [sheetImportedFilename, setSheetImportedFilename] = useState<string | undefined>(routeImportedFilename);
  const [sheetImportedTemplate, setSheetImportedTemplate] = useState<Record<number, TemplateEvent[]> | null>(null);
  const [slotFeedback, setSlotFeedback] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [clearArmedDay, setClearArmedDay] = useState<number | null>(null);
  const [poppingEventKey, setPoppingEventKey] = useState<string | null>(null);
  const { width: winWidth } = useWindowDimensions();
  const allowNextBeforeRemoveRef = useRef(false);

  // navigate() reuses existing screens, so keep the base mode in sync with params.
  useEffect(() => {
    setManageScreenMode(manageMode ? 'view' : 'edit');
    setShowSourceSheet(false);
  }, [manageMode]);
  const gridScrollRef = useRef<ScrollView>(null);
  const oneTimeMonthRef = useRef<TextInput>(null);
  const oneTimeDayRef = useRef<TextInput>(null);
  const oneTimeYearRef = useRef<TextInput>(null);
  const appearAnim = useRef(new Animated.Value(0)).current;
  const slotFeedbackScaleAnim = useRef(new Animated.Value(0.92)).current;
  const slotFeedbackOpacityAnim = useRef(new Animated.Value(0)).current;
  const eventPopAnim = useRef(new Animated.Value(0)).current;
  const { scheduleSource, setScheduleSource, setUpcomingPlans, preferences, themeMode } = useAppStore();

  const scrollGridToNow = useCallback((animated = true) => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowInGridMinutes = nowMinutes < GRID_START_MIN ? nowMinutes + 24 * 60 : nowMinutes;
    const nowX = ((nowInGridMinutes - GRID_START_MIN) / SLOT_MINUTES) * SLOT_WIDTH;

    const visibleTimeWidth = Math.max(160, winWidth - (GRID_PADDING * 2 + DAY_LABEL_WIDTH + 2));
    const leadOffset = Math.max(24, Math.min(visibleTimeWidth * 0.35, 220));
    const maxScrollX = Math.max(0, NUM_SLOTS * SLOT_WIDTH - visibleTimeWidth);
    const targetX = Math.max(0, Math.min(maxScrollX, nowX - leadOffset));

    gridScrollRef.current?.scrollTo({
      x: targetX,
      animated,
    });
  }, [winWidth]);

  // Hide scrollbar (web) once on mount
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
  }, []);

  // Ensure the current-time red line is visible whenever the grid editor appears.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (Platform.OS === 'web') {
          const node = (gridScrollRef.current as any)?.getScrollableNode?.();
          if (node) node.setAttribute('data-gapwalk-schedule-scroll', 'true');
        }
        scrollGridToNow(true);
      } catch (_) {
        // Ignore scroll errors (e.g. ref not ready on web)
      }
    }, 120);
    return () => clearTimeout(t);
  }, [scrollGridToNow]);

  // Re-position the grid to current time each time the screen gains focus.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        scrollGridToNow(false);
      }, 120);
      return () => clearTimeout(t);
    }, [scrollGridToNow])
  );

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
        const resolveSourceState = async (): Promise<{ type: 'manual' | 'import'; filename?: string }> => {
          const src = scheduleSource ?? (await scheduleSourceRepo.get());
          if (!src) {
            return {
              type: routeImportedFilename ? 'import' : 'manual',
              filename: routeImportedFilename,
            };
          }
          if (src.type === 'ics') {
            return { type: 'import', filename: src.filename ?? routeImportedFilename };
          }
          return { type: 'manual' };
        };

        if (Array.isArray(prefillTemplate)) {
          const grouped = groupTemplateEntries(prefillTemplate);
          if (!active) return;
          setEntriesByDay(grouped);
          setSavedEntriesByDay(cloneEntriesByDay(grouped));
          setInitialSignature(buildScheduleSignature(grouped));
          setHasSavedSchedule(false);
          const resolvedSource = routeImportedFilename
            ? { type: 'import' as const, filename: routeImportedFilename }
            : await resolveSourceState();
          if (!active) return;
          setSourceType(resolvedSource.type);
          setSavedSourceType(resolvedSource.type);
          setImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSavedImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetSourceType(resolvedSource.type);
          setSheetImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetImportedTemplate(null);
          return;
        }
        if (startWithEmpty) {
          const empty = createEmptyEntriesByDay();
          if (!active) return;
          setEntriesByDay(empty);
          setSavedEntriesByDay(cloneEntriesByDay(empty));
          setInitialSignature(buildScheduleSignature(empty));
          setHasSavedSchedule(false);
          const resolvedSource = await resolveSourceState();
          if (!active) return;
          setSourceType(resolvedSource.type);
          setSavedSourceType(resolvedSource.type);
          setImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSavedImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetSourceType(resolvedSource.type);
          setSheetImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetImportedTemplate(null);
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
          setSavedEntriesByDay(cloneEntriesByDay(grouped));
          setInitialSignature(buildScheduleSignature(grouped));
          setHasSavedSchedule(!requireSaveBeforeContinue);
          const resolvedSource = await resolveSourceState();
          if (!active) return;
          setSourceType(resolvedSource.type);
          setSavedSourceType(resolvedSource.type);
          setImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSavedImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetSourceType(resolvedSource.type);
          setSheetImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetImportedTemplate(null);
        } catch (error) {
          if (!active) return;
          const empty = createEmptyEntriesByDay();
          setEntriesByDay(empty);
          setSavedEntriesByDay(cloneEntriesByDay(empty));
          setInitialSignature(buildScheduleSignature(empty));
          setHasSavedSchedule(false);
          const resolvedSource = await resolveSourceState();
          if (!active) return;
          setSourceType(resolvedSource.type);
          setSavedSourceType(resolvedSource.type);
          setImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSavedImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetSourceType(resolvedSource.type);
          setSheetImportedFilename(resolvedSource.type === 'import' ? resolvedSource.filename : undefined);
          setSheetImportedTemplate(null);
          console.error('Failed to load saved manual schedule:', error);
        }
      };
      void loadSavedTemplate();
      return () => {
        active = false;
      };
    }, [prefillTemplate, requireSaveBeforeContinue, routeImportedFilename, scheduleSource, startWithEmpty])
  );

  const pickAndParseIcsTemplate = async (): Promise<{
    grouped: Record<number, TemplateEvent[]>;
    filename: string;
    eventsParsed: number;
  } | null> => {
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
        return null;
      }

      const file = result.assets[0];
      const resolvedFilename = file.name || 'calendar.ics';
      setImportStatus(`Reading ${resolvedFilename}...`);
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
        const warningText = parseResult.errors
          .slice(0, 3)
          .map((e) => toUserFriendlyError(new Error(e)))
          .join('\n');
        showMessage('Import Warning', warningText);
      }
      if (parseResult.events.length === 0) {
        setImportLoading(false);
        setImportStatus(null);
        showMessage('No Events', 'No events found in the ICS file.');
        return null;
      }

      const weeklyTemplate: ManualScheduleEntry[] = buildWeeklyTemplateFromIcsEvents(parseResult.events);
      analyticsService.track('ics_import_parsed', {
        filename: resolvedFilename,
        eventsParsed: parseResult.events.length,
        weeklyTemplateEntries: weeklyTemplate.length,
      });

      const grouped = groupTemplateEntries(weeklyTemplate);
      setImportLoading(false);
      setImportStatus(null);
      return {
        grouped,
        filename: resolvedFilename,
        eventsParsed: parseResult.events.length,
      };
    } catch (error) {
      console.error('ICS import failed:', error);
      setImportLoading(false);
      setImportStatus(null);
      const msg = toUserFriendlyError(error);
      showMessage('Import Failed', msg);
      return null;
    }
  };

  const currentSignature = useMemo(() => buildScheduleSignature(entriesByDay), [entriesByDay]);
  const hasUnsavedChanges = currentSignature !== initialSignature;
  const hasPendingImportedSchedule = sourceType === 'import' && Array.isArray(prefillTemplate) && !hasSavedSchedule;
  const hasSourceChanges =
    sourceType !== savedSourceType ||
    (
      sourceType === 'import' &&
      (importedFilename ?? '') !== (savedImportedFilename ?? '')
    );
  const hasManageChanges = hasUnsavedChanges || hasSourceChanges;
  const isReadyToContinue = hasSavedSchedule && !hasUnsavedChanges && !hasSourceChanges;
  const isManageViewOnly = manageMode && manageScreenMode === 'view';
  const sheetResolvedFilename = sheetImportedFilename ?? importedFilename;
  const sourceSheetHasChanges =
    sheetSourceType !== sourceType ||
    (
      sheetSourceType === 'import' &&
      (sheetResolvedFilename ?? '') !== (importedFilename ?? '')
    ) ||
    sheetImportedTemplate !== null;
  const sourceSheetNeedsImportFile = sheetSourceType === 'import' && !(sheetResolvedFilename?.trim());

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

  const runAllowedNavigation = useCallback((action: () => void) => {
    allowNextBeforeRemoveRef.current = true;
    action();
  }, []);

  const confirmDiscardChanges = (onDiscard: () => void) => {
    if (!hasUnsavedChanges && !hasPendingImportedSchedule && !hasSourceChanges) {
      onDiscard();
      return;
    }
    const title = 'Cancel schedule editing?';
    const message = hasPendingImportedSchedule
      ? 'Your imported schedule has not been saved yet. Do you want to leave without saving?'
      : hasSourceChanges
        ? 'Your unsaved source changes will be lost. Do you want to leave this screen?'
        : 'Your unsaved schedule changes will be lost. Do you want to leave this screen?';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(`${title}\n\n${message}`);
      if (ok) onDiscard();
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: onDiscard },
      ]
    );
  };

  const exitManualScreen = () => {
    const goOut = () => {
      if (manageMode) {
        runAllowedNavigation(() => navigation.navigate('Dashboard'));
        return;
      }
      if (navigation.canGoBack()) {
        runAllowedNavigation(() => navigation.goBack());
        return;
      }
      runAllowedNavigation(() => navigation.navigate('ScheduleSetup'));
    };
    confirmDiscardChanges(goOut);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowNextBeforeRemoveRef.current) {
        allowNextBeforeRemoveRef.current = false;
        return;
      }
      if (!hasUnsavedChanges && !hasPendingImportedSchedule && !hasSourceChanges) return;

      e.preventDefault();
      confirmDiscardChanges(() => {
        allowNextBeforeRemoveRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return unsubscribe;
  }, [confirmDiscardChanges, hasPendingImportedSchedule, hasSourceChanges, hasUnsavedChanges, navigation]);

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
  const isRangeValid = hasValidTimes && startValue24 !== endValue24;
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
      ? 'Start and end time cannot be the same.'
      : '';
  const eventFormHasChanges = eventFormInitialSignature.length > 0 &&
    buildFormSignature(form) !== eventFormInitialSignature;

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

  const animateSlotFeedback = useCallback((dayIndex: number, slotIndex: number) => {
    setSlotFeedback({ dayIndex, slotIndex });
    slotFeedbackScaleAnim.setValue(0.92);
    slotFeedbackOpacityAnim.setValue(0.36);
    Animated.parallel([
      Animated.spring(slotFeedbackScaleAnim, {
        toValue: 1,
        tension: 120,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(slotFeedbackOpacityAnim, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setSlotFeedback(null));
  }, [slotFeedbackOpacityAnim, slotFeedbackScaleAnim]);

  const handleSlotClick = (dayIndex: number, slotIndex: number) => {
    openModalFromSlot(dayIndex, slotIndex);
  };

  const openModalFromSlot = (dayIndex: number, slotIndex: number) => {
    const startMin = GRID_START_MIN + slotIndex * SLOT_MINUTES;
    const endMin = Math.min(startMin + SLOT_MINUTES, GRID_END_MIN);
    const startParts = to12HourParts(startMin);
    const endParts = to12HourParts(endMin);
    const defaultOneTimeDate = getPreferredOneTimeDateForDay(dayIndex);
    const defaultParts = parseDateKeyParts(defaultOneTimeDate);
    const nextForm: ManualFormState = {
      ...createDefaultFormState(dayIndex),
      oneTimeDate: defaultOneTimeDate,
      oneTimeMonthRaw: defaultParts.monthRaw,
      oneTimeDayRaw: defaultParts.dayRaw,
      oneTimeYearRaw: defaultParts.yearRaw,
      startHourRaw: startParts.hourRaw,
      startMinuteRaw: startParts.minuteRaw,
      startPeriod: startParts.period,
      endHourRaw: endParts.hourRaw,
      endMinuteRaw: endParts.minuteRaw,
      endPeriod: endParts.period,
    };
    setEditingEventId(null);
    setEditingSeriesId(null);
    setForm(nextForm);
    setEventFormInitialSignature(buildFormSignature(nextForm));
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
    const seriesId = repeatMode === 'weekly' ? resolveRecurringSeriesId(event.id) : null;
    const seriesDays = repeatMode === 'weekly' && seriesId
      ? [0, 1, 2, 3, 4, 5, 6].filter((candidateDay) =>
        (entriesByDay[candidateDay] ?? []).some(
          (candidateEvent) =>
            !candidateEvent.isOneTime &&
            resolveRecurringSeriesId(candidateEvent.id) === seriesId
        )
      )
      : [];
    const resolvedWeeklyDays = seriesDays.length > 0 ? seriesDays : [dayIndex];
    const nextForm: ManualFormState = {
      title: event.title,
      dayOfWeek: repeatMode === 'one_time' ? oneTimeDay : resolvedWeeklyDays[0],
      repeatDays: repeatMode === 'one_time' ? [oneTimeDay] : resolvedWeeklyDays,
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
    };
    setEditingEventId(event.id);
    setEditingSeriesId(seriesId);
    setForm(nextForm);
    setEventFormInitialSignature(buildFormSignature(nextForm));
    setShowAdd(true);
  };

  const closeEventModal = useCallback(() => {
    setShowAdd(false);
    setEditingEventId(null);
    setEditingSeriesId(null);
    setEventFormInitialSignature('');
    setForm(createDefaultFormState(todayIndex));
  }, [todayIndex]);

  const showBinaryConfirm = useCallback(
    (
      title: string,
      message: string,
      confirmActionText: string,
      onConfirm: () => void,
      confirmStyle: 'default' | 'destructive' = 'default'
    ) => {
      if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
        const ok = (globalThis as any).confirm(`${title}\n\n${message}`);
        if (ok) onConfirm();
        return;
      }
      Alert.alert(
        title,
        message,
        [
          { text: 'No', style: 'cancel' },
          { text: confirmActionText, style: confirmStyle, onPress: onConfirm },
        ]
      );
    },
    []
  );

  const handleCancelEventModal = useCallback(() => {
    const shouldWarn = !!editingEventId || eventFormHasChanges;
    if (!shouldWarn) {
      closeEventModal();
      return;
    }
    const title = editingEventId ? 'Cancel event update?' : 'Discard event draft?';
    const message = editingEventId
      ? 'Canceling now will revert all changes to this event. Do you want to continue?'
      : 'Canceling now will discard the information you entered. Do you want to continue?';
    showBinaryConfirm(title, message, 'Yes', closeEventModal, 'destructive');
  }, [closeEventModal, editingEventId, eventFormHasChanges, showBinaryConfirm]);

  const resetSourceSheetState = () => {
    setSheetSourceType(sourceType);
    setSheetImportedFilename(importedFilename);
    setSheetImportedTemplate(null);
    setImportStatus(null);
  };

  const handleOpenSourceSheet = () => {
    resetSourceSheetState();
    setShowSourceSheet(true);
  };

  const handleCloseSourceSheet = () => {
    if (importLoading) return;
    if (!sourceSheetHasChanges) {
      setShowSourceSheet(false);
      resetSourceSheetState();
      return;
    }
    showBinaryConfirm(
      'Discard source changes?',
      'Your source changes in this panel will be lost. Do you want to close it?',
      'Yes, close',
      () => {
        setShowSourceSheet(false);
        resetSourceSheetState();
      },
      'destructive'
    );
  };

  const handlePickIcsForSourceSheet = async () => {
    const imported = await pickAndParseIcsTemplate();
    if (!imported) return;
    setSheetSourceType('import');
    setSheetImportedFilename(imported.filename);
    setSheetImportedTemplate(imported.grouped);
  };

  const applySourceSheetChanges = () => {
    const nextSourceType = sheetSourceType;
    const nextFilename = nextSourceType === 'import' ? sheetResolvedFilename : undefined;
    if (nextSourceType === 'import' && !nextFilename) {
      showMessage('Import needed', 'Choose a .ics file before saving source changes.');
      return;
    }

    if (sheetImportedTemplate) {
      setEntriesByDay(cloneEntriesByDay(sheetImportedTemplate));
      setHasSavedSchedule(false);
    }
    setSourceType(nextSourceType);
    setImportedFilename(nextFilename);
    setManageScreenMode('edit');
    setShowSourceSheet(false);
    setSheetImportedTemplate(null);
    setImportStatus(null);
  };

  const handleSaveSourceSheet = () => {
    if (importLoading) return;
    if (!sourceSheetHasChanges) {
      setShowSourceSheet(false);
      resetSourceSheetState();
      return;
    }
    if (sourceSheetNeedsImportFile) {
      showMessage('Import needed', 'Choose a .ics file before continuing.');
      return;
    }
    if (sheetImportedTemplate) {
      showBinaryConfirm(
        'Replace current schedule?',
        'This will replace your current grid with the imported schedule.',
        'Yes, replace',
        applySourceSheetChanges,
        'destructive'
      );
      return;
    }
    applySourceSheetChanges();
  };

  const handleManageStartEdit = () => {
    setManageScreenMode('edit');
  };

  const handleManageCancelEdit = () => {
    if (!hasManageChanges) {
      setManageScreenMode('view');
      return;
    }
    showBinaryConfirm(
      'Discard unsaved changes?',
      'This will discard your unsaved schedule and source edits.',
      'Yes, discard',
      () => {
        const restored = cloneEntriesByDay(savedEntriesByDay);
        setEntriesByDay(restored);
        setInitialSignature(buildScheduleSignature(restored));
        setSourceType(savedSourceType);
        setImportedFilename(savedSourceType === 'import' ? savedImportedFilename : undefined);
        setSheetSourceType(savedSourceType);
        setSheetImportedFilename(savedSourceType === 'import' ? savedImportedFilename : undefined);
        setSheetImportedTemplate(null);
        setHasSavedSchedule(true);
        setSaveError(null);
        setManageScreenMode('view');
      },
      'destructive'
    );
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
    // Allow overnight (e.g. sleep 10pm–6am): end can be before start
    if (start === end) {
      Alert.alert('Invalid Time', 'Start and end time cannot be the same.');
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

    // Overlap check across day boundaries (supports overnight events spanning to the next day).
    const targetDays = form.repeatMode === 'one_time'
      ? [getDayOfWeekFromDateKey(resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek))]
      : (form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek]);
    const newOneTime = form.repeatMode === 'one_time';
    const startMin = hhmmToMinutes(start);
    const endMin = hhmmToMinutes(end);
    const existingSegmentsByDay: Record<number, Array<{
      startMinute: number;
      endMinute: number;
      event: TemplateEvent;
    }>> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };
    for (const ownerDay of [0, 1, 2, 3, 4, 5, 6]) {
      const existing = (entriesByDay[ownerDay] ?? []).filter((event) => {
        if (editingEventId && event.id === editingEventId) return false;
        if (editingSeriesId && !event.isOneTime && resolveRecurringSeriesId(event.id) === editingSeriesId) {
          return false;
        }
        return true;
      });
      for (const event of existing) {
        const segments = buildDayMinuteSegments(
          ownerDay,
          hhmmToMinutes(event.startTime),
          hhmmToMinutes(event.endTime)
        );
        for (const segment of segments) {
          existingSegmentsByDay[segment.dayIndex] = [
            ...(existingSegmentsByDay[segment.dayIndex] ?? []),
            {
              startMinute: segment.startMinute,
              endMinute: segment.endMinute,
              event,
            },
          ];
        }
      }
    }
    for (const ownerDay of targetDays) {
      const candidateSegments = buildDayMinuteSegments(ownerDay, startMin, endMin);
      for (const candidate of candidateSegments) {
        const existingSegments = existingSegmentsByDay[candidate.dayIndex] ?? [];
        for (const existing of existingSegments) {
          if (!timeRangesOverlap(candidate.startMinute, candidate.endMinute, existing.startMinute, existing.endMinute)) {
            continue;
          }
          const existingOneTime = !!existing.event.isOneTime;
          if (newOneTime && !existingOneTime) continue;
          const dayName = DAY_FULL_NAMES[candidate.dayIndex];
          Alert.alert(
            'Time conflict',
            `${dayName} already has an event ("${existing.event.title}") that overlaps this time. Only one-time events can replace a recurring event on a specific day; otherwise choose a different time.`,
          );
          return;
        }
      }
    }

    const commitAddOrUpdate = () => {
      const removeEditingTargets = (next: Record<number, TemplateEvent[]>) => {
        if (!editingEventId && !editingSeriesId) return next;
        const updated = { ...next };
        for (const d of [0, 1, 2, 3, 4, 5, 6]) {
          updated[d] = (updated[d] ?? []).filter((event) => {
            if (editingSeriesId && !event.isOneTime && resolveRecurringSeriesId(event.id) === editingSeriesId) {
              return false;
            }
            if (editingEventId && event.id === editingEventId) {
              return false;
            }
            return true;
          });
        }
        return updated;
      };

      if (editingEventId) {
        const id = editingEventId;
        setEntriesByDay((prev) => {
          const next = removeEditingTargets(prev);
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
          const seriesId = editingSeriesId ?? createRecurringSeriesId();
          for (let i = 0; i < daysToUpdate.length; i++) {
            const d = daysToUpdate[i];
            const eventId = buildRecurringEventId(seriesId, d);
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
          const seriesId = createRecurringSeriesId();
          for (let i = 0; i < daysToAdd.length; i++) {
            const d = daysToAdd[i];
            const event: TemplateEvent = {
              id: buildRecurringEventId(seriesId, d),
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
      closeEventModal();
    };

    const confirmTitle = editingEventId ? 'Update this event?' : 'Save this event?';
    const confirmMessage = editingEventId
      ? 'This will update the existing event. Do you want to continue?'
      : 'This will save the event to your weekly schedule. Do you want to continue?';
    const confirmAction = editingEventId ? 'Yes, Update' : 'Yes, Save';
    showBinaryConfirm(confirmTitle, confirmMessage, confirmAction, commitAddOrUpdate);
  };

  const deleteEntryFromModal = (eventId?: string | null, seriesId?: string | null) => {
    const idToDelete = eventId ?? editingEventId;
    const seriesIdToDelete = seriesId ?? editingSeriesId;
    if (!idToDelete && !seriesIdToDelete) return;
    setEntriesByDay((prev) => {
      const next = { ...prev };
      for (const d of [0, 1, 2, 3, 4, 5, 6]) {
        next[d] = (next[d] ?? []).filter((event) => {
          if (seriesIdToDelete && !event.isOneTime && resolveRecurringSeriesId(event.id) === seriesIdToDelete) {
            return false;
          }
          if (idToDelete && event.id === idToDelete) {
            return false;
          }
          return true;
        });
      }
      return next;
    });
    closeEventModal();
  };

  const confirmDelete = () => {
    const id = editingEventId;
    const seriesId = editingSeriesId;
    if (!id) return;
    const deletingSeries = !!seriesId;
    const title = deletingSeries ? 'Delete recurring event?' : 'Delete event';
    const message = deletingSeries ? 'Remove this event from all repeated days?' : 'Remove this event?';
    // Alert.alert button callbacks don't fire on web (react-native-web limitation)
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(message)) {
        deleteEntryFromModal(id, deletingSeries ? seriesId : null);
      }
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteEntryFromModal(id, deletingSeries ? seriesId : null),
        },
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
    if (sourceType === 'import' && !importedFilename) {
      showMessage('Import needed', 'Choose a .ics file before saving this schedule.');
      return;
    }
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

    const eventSource: 'ics' | 'manual' = sourceType === 'import' ? 'ics' : 'manual';
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
        const startAt = setMinutes(setHours(date, sh), sm);
        let endAt = setMinutes(setHours(date, eh), em);
        if (endAt <= startAt) {
          endAt = addDays(endAt, 1);
        }
        return {
          id: `me-${e.id}-${offset}`,
          title: e.title,
          start: startAt.toISOString(),
          end: endAt.toISOString(),
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
        const startAt = setMinutes(setHours(normalizedDate, sh), sm);
        let endAt = setMinutes(setHours(normalizedDate, eh), em);
        if (endAt <= startAt) {
          endAt = addDays(endAt, 1);
        }
        return [
          {
            id: `me-${entry.id}-${entry.oneTimeDate}`,
            title: entry.title,
            start: startAt.toISOString(),
            end: endAt.toISOString(),
            source: eventSource,
            isAllDay: false,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    const events = [...recurringEvents, ...oneTimeEvents];

    // Attempt save up to 2 times (retry once on failure).
    let lastError: unknown = null;
    let failedStep = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        try {
          await manualScheduleRepo.deleteAll();
          await manualScheduleRepo.saveMany(weeklyTemplate);
        } catch (e) {
          failedStep = 'saving your schedule to storage';
          throw e;
        }
        try {
          await eventsRepo.deleteAll();
          await eventsRepo.saveMany(events);
        } catch (e) {
          failedStep = 'saving calendar events';
          throw e;
        }
        const src = sourceType === 'import'
          ? { type: 'ics' as const, filename: importedFilename, lastImportedAt: new Date().toISOString() }
          : { type: 'manual' as const, lastImportedAt: new Date().toISOString() };
        try {
          await scheduleSourceRepo.save(src);
          setScheduleSource(src);
        } catch (e) {
          failedStep = 'saving schedule source';
          throw e;
        }

        try {
          await syncNudgePlansForCurrentSchedule(preferences);
          const refreshedUpcoming = await plansRepo.getUpcomingPlans(20);
          setUpcomingPlans(refreshedUpcoming);
        } catch (e) {
          failedStep = 'updating walk opportunities';
          throw e;
        }

        analyticsService.track('schedule_saved', {
          source: sourceType === 'import' ? 'ics' : 'manual',
          weeklyEntries: weeklyTemplate.filter((entry) => !entry.isOneTime).length,
          oneTimeEntries: weeklyTemplate.filter((entry) => entry.isOneTime).length,
          generatedEvents: events.length,
          manageMode,
        });

        setInitialSignature(currentSignature);
        setSavedEntriesByDay(cloneEntriesByDay(entriesByDay));
        setSavedSourceType(sourceType);
        setSavedImportedFilename(sourceType === 'import' ? importedFilename : undefined);
        setSheetSourceType(sourceType);
        setSheetImportedFilename(sourceType === 'import' ? importedFilename : undefined);
        setSheetImportedTemplate(null);
        setHasSavedSchedule(true);
        setSavingDone(false);

        if (manageMode) {
          setManageScreenMode('view');
          showMessage('Schedule saved', 'Your schedule was updated and walking opportunities were synced.');
          return;
        }

        if (requireSaveBeforeContinue) {
          return;
        }

        runAllowedNavigation(() => navigation.navigate('Preferences', {}));
        return;
      } catch (err) {
        lastError = err;
        console.error(`Save schedule attempt ${attempt + 1} failed${failedStep ? ` at step: ${failedStep}` : ''}:`, err);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
    }

    const msg = toUserFriendlyError(lastError);
    const stepHint = failedStep ? ` The problem occurred while ${failedStep}.` : '';
    const rawMsg = lastError instanceof Error ? lastError.message : String(lastError);
    const devHint = __DEV__ ? ` (Technical: ${rawMsg.slice(0, 100)}${rawMsg.length > 100 ? '…' : ''})` : '';
    setSaveError(`Could not save your schedule.${stepHint} ${msg}${devHint}`);
    setSavingDone(false);
  };

  const handleDone = () => {
    if (savingDone) return;
    const total = Object.values(entriesByDay).reduce((sum, arr) => sum + arr.length, 0);
    if (total === 0) {
      showMessage('Empty', 'Add at least one event.');
      return;
    }
    if (manageMode && !hasManageChanges && !hasPendingImportedSchedule) {
      showMessage(
        'No changes',
        'No changes were detected. Your existing schedule is already active.'
      );
      return;
    }

    const confirmTitle = manageMode ? 'Save schedule changes?' : SAVE_CONFIRM_TITLE;
    const confirmMessage = manageMode ? 'Do you want to save these schedule changes?' : SAVE_CONFIRM_MESSAGE;
    const confirmAction = manageMode ? 'Yes, Save' : SAVE_CONFIRM_ACTION;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(`${confirmTitle}\n\n${confirmMessage}`);
      if (ok) {
        void performSave();
      }
      return;
    }

    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        { text: SAVE_CONFIRM_DECLINE, style: 'cancel' },
        { text: confirmAction, onPress: () => { void performSave(); } },
      ]
    );
  };

  const handleContinueAfterSave = () => {
    if (savingDone) return;
    if (!hasSavedSchedule || hasUnsavedChanges || hasSourceChanges) {
      if (hasUnsavedChanges) {
        showMessage('Unsaved changes', 'Save your latest schedule changes before continuing.');
        return;
      }
      if (hasSourceChanges) {
        showMessage('Unsaved changes', 'Save your latest source changes before continuing.');
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

  const displaySlicesByDay = useMemo(() => {
    const rawByDay: Record<number, GridDisplaySlice[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };

    for (let sourceDayIndex = 0; sourceDayIndex <= 6; sourceDayIndex++) {
      const sourceEvents = entriesByDaySorted[sourceDayIndex] ?? [];
      for (const event of sourceEvents) {
        const startMinute = hhmmToMinutes(event.startTime);
        const endMinute = hhmmToMinutes(event.endTime);
        const startInRow = normalizeToRowMinutes(startMinute);
        let endInRow = normalizeToRowMinutes(endMinute);
        if (endInRow <= startInRow) {
          endInRow += 24 * 60;
        }

        const sameDayStart = Math.max(GRID_START_MIN, startInRow);
        const sameDayEnd = Math.min(GRID_END_MIN, endInRow);
        if (sameDayEnd > sameDayStart) {
          rawByDay[sourceDayIndex] = [
            ...(rawByDay[sourceDayIndex] ?? []),
            {
              key: `${event.id}-${sourceDayIndex}-base-${sameDayStart}`,
              event,
              sourceDayIndex,
              startMinuteInRow: sameDayStart,
              endMinuteInRow: sameDayEnd,
              isCarryOver: false,
            },
          ];
        }

        if (endInRow > GRID_END_MIN) {
          const overflowMinutes = endInRow - GRID_END_MIN;
          const carryEnd = Math.min(GRID_END_MIN, GRID_START_MIN + overflowMinutes);
          if (carryEnd > GRID_START_MIN) {
            const nextDayIndex = (sourceDayIndex + 1) % 7;
            rawByDay[nextDayIndex] = [
              ...(rawByDay[nextDayIndex] ?? []),
              {
                key: `${event.id}-${nextDayIndex}-carry-${carryEnd}`,
                event,
                sourceDayIndex,
                startMinuteInRow: GRID_START_MIN,
                endMinuteInRow: carryEnd,
                isCarryOver: true,
              },
            ];
          }
        }
      }
    }

    const out: Record<number, GridDisplaySlice[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };
    for (let dayIndex = 0; dayIndex <= 6; dayIndex++) {
      const daySlices = rawByDay[dayIndex] ?? [];
      const oneTimeSlices = daySlices.filter((slice) => !!slice.event.isOneTime);
      const recurringSlices = daySlices.filter((slice) => !slice.event.isOneTime);
      const recurringNotOverlappedByOneTime = recurringSlices.filter((slice) => {
        return !oneTimeSlices.some((oneTimeSlice) =>
          timeRangesOverlap(
            slice.startMinuteInRow,
            slice.endMinuteInRow,
            oneTimeSlice.startMinuteInRow,
            oneTimeSlice.endMinuteInRow
          )
        );
      });
      const combined = [...oneTimeSlices, ...recurringNotOverlappedByOneTime].sort((a, b) => {
        if (a.startMinuteInRow !== b.startMinuteInRow) {
          return a.startMinuteInRow - b.startMinuteInRow;
        }
        return a.endMinuteInRow - b.endMinuteInRow;
      });
      const nonOverlapping: GridDisplaySlice[] = [];
      let lastEnd = -1;
      for (const slice of combined) {
        if (slice.startMinuteInRow >= lastEnd) {
          nonOverlapping.push(slice);
          lastEnd = slice.endMinuteInRow;
        }
      }
      out[dayIndex] = nonOverlapping;
    }
    return out;
  }, [entriesByDaySorted]);

  const getSliceSlotBounds = useCallback((slice: GridDisplaySlice): {
    startSlot: number;
    endSlotExclusive: number;
    left: number;
    width: number;
  } => {
    const startSlotRaw = Math.floor((slice.startMinuteInRow - GRID_START_MIN) / SLOT_MINUTES);
    const endSlotRaw = Math.ceil((slice.endMinuteInRow - GRID_START_MIN) / SLOT_MINUTES);
    const startSlot = Math.max(0, Math.min(NUM_SLOTS - 1, startSlotRaw));
    const endSlotExclusive = Math.max(startSlot + 1, Math.min(NUM_SLOTS, endSlotRaw));
    const spanSlots = Math.max(1, endSlotExclusive - startSlot);

    return {
      startSlot,
      endSlotExclusive,
      left: startSlot * SLOT_WIDTH + 1,
      width: Math.max(spanSlots * SLOT_WIDTH - 2, 44),
    };
  }, []);

  const handleGridCellPress = useCallback((dayIndex: number, slotIndex: number, daySlices: GridDisplaySlice[]) => {
    setSelectedDay(dayIndex);
    setClearArmedDay(null);
    if (isManageViewOnly) return;
    animateSlotFeedback(dayIndex, slotIndex);

    const eventAtSlot = daySlices.find((slice) => {
      const bounds = getSliceSlotBounds(slice);
      return slotIndex >= bounds.startSlot && slotIndex < bounds.endSlotExclusive;
    });

    if (eventAtSlot) {
      setPoppingEventKey(eventAtSlot.key);
      eventPopAnim.stopAnimation();
      eventPopAnim.setValue(0);
      Animated.timing(eventPopAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }).start(({ finished }) => {
        setPoppingEventKey(null);
        eventPopAnim.setValue(0);
        if (!finished) return;
        openModalFromEvent(eventAtSlot.event, eventAtSlot.sourceDayIndex);
      });
      return;
    }

    setTimeout(() => {
      handleSlotClick(dayIndex, slotIndex);
    }, 70);
  }, [animateSlotFeedback, eventPopAnim, getSliceSlotBounds, handleSlotClick, isManageViewOnly, openModalFromEvent]);

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
  const handleClearDay = (dayIndex?: number) => {
    const d = dayIndex ?? selectedDay;
    const dayName = DAY_FULL_NAMES[d];
    const count = (entriesByDay[d] ?? []).length;
    if (count === 0) return;
    const title = `Clear ${dayName}?`;
    const message = `Remove all ${count} event${count > 1 ? 's' : ''} from ${dayName}.`;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${title}\n\n${message}`)) {
        setEntriesByDay((prev) => ({ ...prev, [d]: [] }));
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setEntriesByDay((prev) => ({ ...prev, [d]: [] })) },
    ]);
  };

  /* ── Current-time indicator (vertical line in horizontal grid) ── */
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDayIndex = now.getDay();
  const isSelectedDayToday = selectedDay === todayDayIndex;
  const nowInGridMinutes = nowMinutes < GRID_START_MIN ? nowMinutes + 24 * 60 : nowMinutes;
  const nowOffsetMin = nowInGridMinutes - GRID_START_MIN;
  const nowColumnFloat = nowOffsetMin / SLOT_MINUTES;
  const nowLeft = nowColumnFloat * SLOT_WIDTH;
  const fullWeekGridHeight = TIME_ROW_HEIGHT + 7 * DAY_ROW_HEIGHT;

  const gridScrollWidth = NUM_SLOTS * SLOT_WIDTH;
  const selectedDayEvents = entriesByDaySorted[selectedDay] ?? [];
  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';
  const mintTextOnTint = palette.accentOnTint;
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
  const slotHintText = isManageViewOnly
    ? 'Review your weekly schedule. Tap Edit Schedule to make changes.'
    : 'Tap any slot/cell to add an event or tap on an existing event to edit/delete it.';

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
      <View style={[styles.header, styles.headerCompact]}>
        <ScreenHeader
          title={manageMode ? 'Manage schedule' : 'Set up your schedule'}
          onBack={manageMode ? undefined : handleBack}
          backTestID={manageMode ? undefined : 'manual-back'}
          style={{ marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
        />
        {sourceType === 'import' && importedFilename ? (
          <View style={styles.icsBadge}>
            <Text variant="bodySmall" style={[styles.icsBadgeText, { color: mintTextOnTint }]} numberOfLines={1}>
              ICS file: {importedFilename}
            </Text>
          </View>
        ) : manageMode ? (
          <View style={styles.sourceInfoBar}>
            <AppIcon name="adjust" size={13} color={palette.accentPrimary} />
            <Text variant="bodySmall" style={{ color: palette.textMuted }}>
              Source: Manual entry
            </Text>
          </View>
        ) : null}
      </View>
      <ScrollView
        style={styles.editorScroll}
        contentContainerStyle={styles.editorScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
      <View style={[styles.gridToolbar, { borderBottomColor: gridLineSoft }]}>
        <Text variant="bodySmall" style={{ color: palette.textMuted, flex: 1 }}>
          {slotHintText}
        </Text>
        {!isManageViewOnly && (
          <Pressable
            onPress={() => handleClearDay()}
            disabled={(entriesByDay[selectedDay] ?? []).length === 0}
            style={({ pressed }) => [
              styles.gridToolbarBtn,
              { borderColor: palette.borderStrong },
              pressed && { opacity: 0.6 },
              (entriesByDay[selectedDay] ?? []).length === 0 && { opacity: 0.35 },
            ]}
          >
            <Text variant="bodySmall" style={{ color: palette.textMuted }}>Clear {DAY_TAB_LABELS[selectedDay]}</Text>
          </Pressable>
        )}
      </View>

      {/* Grid: fixed day labels + horizontally scrollable time slots */}
      <View style={[styles.gridContainer, { paddingHorizontal: GRID_PADDING }]}>
        <View
          style={[
            styles.gridWrap,
            {
              backgroundColor: palette.bgSurface,
              borderColor: gridLineStrong,
              borderRadius: 12,
              height: fullWeekGridHeight,
            },
          ]}
        >
          <View style={styles.gridShell}>
            <View style={[styles.gridDayRail, { width: DAY_LABEL_WIDTH, borderRightColor: gridLineStrong }]}>
              <View style={[styles.gridDayRailHeader, { height: TIME_ROW_HEIGHT, borderBottomColor: gridLineStrong }]} />
              {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                const isToday = dayIndex === todayDayIndex;
                return (
                  <TouchableOpacity
                    key={`label-${dayIndex}`}
                    style={[
                      styles.dayLabelCell,
                      {
                        height: DAY_ROW_HEIGHT,
                        borderBottomColor: gridLineSoft,
                        backgroundColor: dayIndex % 2 === 1 ? gridAltBg : palette.bgSurface,
                      },
                      selectedDay === dayIndex && { backgroundColor: isDark ? 'rgba(46,233,166,0.16)' : 'rgba(46,233,166,0.14)' },
                    ]}
                    onPress={() => setSelectedDay(dayIndex)}
                    onLongPress={isManageViewOnly ? undefined : () => handleClearDay(dayIndex)}
                    activeOpacity={0.82}
                  >
                    <Text
                      variant="bodySmall"
                      style={[
                        styles.dayLabelText,
                        { color: selectedDay === dayIndex ? palette.accentPrimary : palette.textPrimary },
                        isToday && { fontWeight: '700' as any },
                      ]}
                    >
                      {DAY_TAB_LABELS[dayIndex]}
                    </Text>
                    {(entriesByDay[dayIndex] ?? []).length > 0 && (
                      <Text variant="bodySmall" style={{ color: palette.textMuted, fontSize: 10, marginTop: 2 }}>
                        {(entriesByDay[dayIndex] ?? []).length}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              ref={gridScrollRef}
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={{ width: gridScrollWidth }}
              style={styles.gridTimeScroll}
            >
              <View style={{ width: gridScrollWidth }}>
                <View style={[styles.timeRow, { height: TIME_ROW_HEIGHT, borderBottomColor: gridLineStrong }]}>
                  {SLOT_INDICES.map((slotIndex) => (
                    <View
                      key={`time-${slotIndex}`}
                      style={[
                        styles.hSlotCell,
                        {
                          width: SLOT_WIDTH,
                          borderRightWidth: slotIndex % 2 === 0 ? 1 : StyleSheet.hairlineWidth,
                          borderRightColor: slotIndex % 2 === 0 ? gridLineStrong : gridLineSoft,
                        },
                      ]}
                    >
                      {slotIndex % 2 === 0 ? (
                        <Text variant="bodySmall" color={palette.textMuted} style={styles.hTimeLabel} numberOfLines={1}>
                          {FULL_HOUR_LABELS[slotIndex / 2]}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>

                {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                  const daySlices = displaySlicesByDay[dayIndex] ?? [];
                  return (
                    <View
                      key={`row-${dayIndex}`}
                      style={[
                        styles.gridTimeRow,
                        {
                          height: DAY_ROW_HEIGHT,
                          borderBottomColor: gridLineSoft,
                          backgroundColor: dayIndex % 2 === 1 ? gridAltBg : undefined,
                        },
                      ]}
                    >
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <View style={styles.gridCellRow}>
                          {SLOT_INDICES.map((slotIndex) => (
                            <View
                              key={`cell-bg-${dayIndex}-${slotIndex}`}
                              style={[
                                styles.gridCell,
                                {
                                  width: SLOT_WIDTH,
                                  borderRightWidth: slotIndex % 2 === 0 ? 1 : StyleSheet.hairlineWidth,
                                  borderRightColor: slotIndex % 2 === 0 ? gridLineStrong : gridLineSoft,
                                  backgroundColor: slotIndex % 2 === 0
                                    ? (isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.03)')
                                    : (isDark ? 'rgba(255,255,255,0.008)' : 'rgba(15,23,42,0.012)'),
                                },
                              ]}
                            />
                          ))}
                        </View>
                      </View>

                      <View style={styles.gridCellRow}>
                        {SLOT_INDICES.map((slotIndex) => (
                          <Pressable
                            key={`cell-touch-${dayIndex}-${slotIndex}`}
                            onPress={() => handleGridCellPress(dayIndex, slotIndex, daySlices)}
                            disabled={isManageViewOnly}
                            style={({ pressed }) => [
                              styles.gridCellPressable,
                              {
                                width: SLOT_WIDTH,
                                borderRightWidth: slotIndex % 2 === 0 ? 1 : StyleSheet.hairlineWidth,
                                borderRightColor: slotIndex % 2 === 0 ? gridLineStrong : gridLineSoft,
                                backgroundColor: !isManageViewOnly && pressed
                                  ? (isDark ? 'rgba(46,233,166,0.24)' : 'rgba(46,233,166,0.2)')
                                  : 'transparent',
                              },
                            ]}
                          />
                        ))}
                      </View>

                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        {daySlices.map((slice) => {
                          const bounds = getSliceSlotBounds(slice);
                          const durationMinutes = Math.max(1, slice.endMinuteInRow - slice.startMinuteInRow);
                          const isCompact = bounds.width < SLOT_WIDTH * 1.6;
                          const isSelectedDay = dayIndex === selectedDay;
                          const timeStr = slice.isCarryOver
                            ? `Continues, ends ${formatTime12(slice.event.endTime)}`
                            : isCompact
                              ? `${slice.event.startTime}\n${slice.event.endTime}`
                              : `${formatTime12(slice.event.startTime)} - ${formatTime12(slice.event.endTime)}`;
                          return (
                            <View
                              key={slice.key}
                              style={[
                                styles.gridEventBlockH,
                                isCompact && styles.gridEventBlockHCompact,
                                isSelectedDay ? styles.gridEventBlockHSelected : styles.gridEventBlockHFaded,
                                {
                                  left: bounds.left,
                                  width: bounds.width,
                                  top: 4,
                                  height: DAY_ROW_HEIGHT - 8,
                                  borderColor: eventBorderColor,
                                },
                              ]}
                            >
                              <Text
                                variant="bodySmall"
                                style={[styles.gridEventTitleH, isCompact && styles.gridEventTitleHCompact]}
                                numberOfLines={isCompact ? 1 : 2}
                              >
                                {slice.event.title}
                              </Text>
                              <Text
                                variant="bodySmall"
                                style={[styles.gridEventTimeH, isCompact && styles.gridEventTimeHCompact]}
                                numberOfLines={isCompact ? 2 : 1}
                              >
                                {timeStr}
                              </Text>
                              {!isCompact && (
                                <Text variant="bodySmall" style={styles.gridEventDurationH} numberOfLines={1}>
                                  {durationMinutes} min
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}

                {slotFeedback && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.slotFeedbackPulse,
                      {
                        left: slotFeedback.slotIndex * SLOT_WIDTH + 1,
                        top: TIME_ROW_HEIGHT + slotFeedback.dayIndex * DAY_ROW_HEIGHT + 1,
                        width: SLOT_WIDTH - 2,
                        height: DAY_ROW_HEIGHT - 2,
                        opacity: slotFeedbackOpacityAnim,
                        transform: [{ scale: slotFeedbackScaleAnim }],
                      },
                    ]}
                  />
                )}

                {todayDayIndex >= 0 && nowColumnFloat >= 0 && nowColumnFloat < NUM_SLOTS && (
                  <View
                    style={[
                      styles.nowLineVertical,
                      {
                        left: nowLeft,
                        top: TIME_ROW_HEIGHT - 4,
                        height: 8 + 7 * DAY_ROW_HEIGHT,
                      },
                    ]}
                    pointerEvents="none"
                  >
                    <View
                      style={[
                        styles.nowDot,
                        {
                          backgroundColor: palette.accentPrimary,
                          shadowColor: palette.accentPrimary,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.9,
                          shadowRadius: 6,
                          elevation: 8,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.nowLineBarVertical,
                        {
                          backgroundColor: palette.accentPrimary,
                          shadowColor: palette.accentPrimary,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.7,
                          shadowRadius: 4,
                          elevation: 6,
                        },
                      ]}
                    />
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </View>

      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: GRID_PADDING,
            borderTopColor: gridLineSoft,
            backgroundColor: palette.bgApp,
          },
        ]}
      >
        {!!saveError && <Text variant="bodySmall" style={styles.saveError}>{saveError}</Text>}
        {isE2E && !isManageViewOnly && (
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
            {isManageViewOnly ? (
              <>
                <Button
                  title="Edit Schedule"
                  onPress={handleManageStartEdit}
                  style={styles.footerBtn}
                  disabled={savingDone}
                  testID="manual-edit"
                />
                <Button
                  title="Switch Source"
                  variant="secondary"
                  onPress={handleOpenSourceSheet}
                  style={styles.footerBtn}
                  disabled={savingDone}
                  testID="manual-change-source"
                />
              </>
            ) : (
              <>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={handleManageCancelEdit}
                  style={styles.footerBtn}
                  disabled={savingDone}
                  testID="manual-cancel"
                />
                <Button
                  title="Save"
                  onPress={handleDone}
                  style={styles.footerBtn}
                  loading={savingDone}
                  disabled={savingDone || !hasManageChanges}
                  testID="manual-save"
                />
              </>
            )}
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
                disabled={savingDone || !hasSavedSchedule || hasUnsavedChanges || hasSourceChanges}
                testID="manual-continue"
              />
            </View>
          ) : (
            <Button title="Done" onPress={handleDone} full loading={savingDone} disabled={savingDone} testID="manual-done" />
          )
        )}
        {!manageMode && <Text variant="muted" style={styles.privacy}>Your schedule stays private. Privacy is our top priority.</Text>}
      </View>
      </Animated.View>

      <RNModal
        visible={showSourceSheet}
        animationType="slide"
        onRequestClose={handleCloseSourceSheet}
        statusBarTranslucent
      >
        <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
          <View style={styles.switchSourceScreen}>
            <View style={styles.switchSourceHeader}>
              <ScreenHeader
                title="Switch Source"
                subtitle="Choose how GapWalk reads your schedule."
                onBack={handleCloseSourceSheet}
                backTestID="switch-source-back"
                style={{ marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
              />
            </View>

            <ScrollView
              style={styles.switchSourceScrollArea}
              contentContainerStyle={styles.switchSourceScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Manual Entry card */}
              <Card
                selected={sheetSourceType === 'manual'}
                onPress={() => setSheetSourceType('manual')}
                style={styles.switchSourceCard}
                testID="switch-source-manual"
              >
                <View style={styles.switchSourceCardHeader}>
                  <AppIcon name="adjust" size={16} color={palette.accentPrimary} />
                  <Text variant="body" style={styles.switchSourceCardTitle}>Manual Entry</Text>
                  {sourceType === 'manual' && (
                    <View style={[styles.switchSourceCurrentTag, { backgroundColor: palette.accentMuted }]}>
                      <Text variant="bodySmall" style={{ color: palette.accentPrimary, fontSize: theme.fontSize.xxs, fontWeight: theme.fontWeight.semibold }}>
                        Current
                      </Text>
                    </View>
                  )}
                </View>
                <Text variant="bodySmall" style={{ color: palette.textMuted, lineHeight: 20, marginTop: 6 }}>
                  Build your weekly schedule by adding events manually on the grid.
                </Text>
              </Card>

              {/* Import card */}
              <Card
                selected={sheetSourceType === 'import'}
                onPress={() => setSheetSourceType('import')}
                style={styles.switchSourceCard}
                testID="switch-source-import"
              >
                <View style={styles.switchSourceCardHeader}>
                  <AppIcon name="calendar" size={16} color={palette.accentPrimary} />
                  <Text variant="body" style={styles.switchSourceCardTitle}>Import (.ics file)</Text>
                  {sourceType === 'import' && (
                    <View style={[styles.switchSourceCurrentTag, { backgroundColor: palette.accentMuted }]}>
                      <Text variant="bodySmall" style={{ color: palette.accentPrimary, fontSize: theme.fontSize.xxs, fontWeight: theme.fontWeight.semibold }}>
                        Current
                      </Text>
                    </View>
                  )}
                </View>
                <Text variant="bodySmall" style={{ color: palette.textMuted, lineHeight: 20, marginTop: 6 }}>
                  Import from your calendar app and GapWalk will populate your grid automatically.
                </Text>

                {sheetSourceType === 'import' && (
                  <View style={styles.switchSourceFileSection}>
                    <View style={[styles.switchSourceFileBanner, { backgroundColor: palette.bgSurfaceElevated, borderColor: palette.borderSoft }]}>
                      <AppIcon name="calendar" size={13} color={sheetResolvedFilename ? palette.accentPrimary : palette.textMuted} />
                      <Text
                        variant="bodySmall"
                        style={{ color: sheetResolvedFilename ? palette.accentPrimary : palette.textMuted, flex: 1, fontWeight: theme.fontWeight.medium }}
                        numberOfLines={1}
                      >
                        {sheetResolvedFilename || 'No file selected'}
                      </Text>
                      <Pressable
                        onPress={() => { void handlePickIcsForSourceSheet(); }}
                        disabled={importLoading}
                        style={({ pressed }) => [
                          styles.switchSourceFileBtn,
                          { borderColor: palette.accentPrimary },
                          pressed && { opacity: 0.7 },
                          importLoading && { opacity: 0.5 },
                        ]}
                      >
                        <Text variant="bodySmall" style={{ color: palette.accentPrimary, fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.xs }}>
                          {sheetResolvedFilename ? 'Change' : 'Choose file'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </Card>

              {/* Loading status */}
              {importLoading && importStatus && (
                <View style={styles.switchSourceStatusRow}>
                  <ActivityIndicator size="small" color={palette.accentPrimary} />
                  <Text variant="bodySmall" style={{ color: palette.accentPrimary, marginLeft: 8 }}>{importStatus}</Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.switchSourceFooter, { borderTopColor: gridLineSoft, backgroundColor: palette.bgApp }]}>
              {sourceSheetNeedsImportFile && sheetSourceType === 'import' && (
                <Text variant="bodySmall" style={styles.switchSourceWarning}>
                  Choose a .ics file before continuing.
                </Text>
              )}
              <View style={styles.footerActions}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={handleCloseSourceSheet}
                  style={styles.footerBtn}
                  disabled={importLoading}
                  testID="switch-source-cancel"
                />
                <Button
                  title="Continue"
                  onPress={handleSaveSourceSheet}
                  style={styles.footerBtn}
                  disabled={importLoading || !sourceSheetHasChanges || sourceSheetNeedsImportFile}
                  testID="switch-source-continue"
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </RNModal>

      <AppModal
        visible={showAdd}
        onClose={handleCancelEventModal}
        title={editingEventId ? 'Edit Event' : 'Add Event'}
      >
        <View style={styles.mForm}>
          <View style={styles.modalSection}>
            <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Title</Text>
            <TextInput
              style={[styles.input, themedInput]}
              value={form.title}
              onChangeText={(t) => setForm((prev) => ({ ...prev, title: t }))}
              placeholder="e.g. Work, Class"
              placeholderTextColor={palette.textMuted}
              underlineColorAndroid="transparent"
            />
          </View>

          <View style={styles.modalSection}>
            <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Frequency</Text>
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
                    form.repeatMode === 'weekly' && { color: palette.pillSelectedText },
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
                    form.repeatMode === 'one_time' && { color: palette.pillSelectedText },
                  ])}
                >
                  One-time event
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {form.repeatMode === 'weekly' ? (
            <View style={styles.modalSection}>
              <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Days (select one or more)</Text>
              <View style={styles.repeatDaysRow}>
                {DAY_TAB_LABELS.map((d, idx) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.repeatDayChip, themedChip, form.repeatDays.includes(idx) && styles.repeatDayChipActive]}
                    onPress={() => toggleRepeatDay(idx)}
                  >
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={StyleSheet.flatten([
                        styles.repeatDayChipText,
                        form.repeatDays.includes(idx) && styles.repeatDayChipTextActive,
                        form.repeatDays.includes(idx) && { color: palette.pillSelectedText },
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
            </View>
          ) : (
            <View style={styles.modalSection}>
              <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Event date</Text>
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
                  underlineColorAndroid="transparent"
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
                  underlineColorAndroid="transparent"
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
                  underlineColorAndroid="transparent"
                />
              </View>
              {!!oneTimeDateError && <Text variant="muted" style={styles.timeError}>{oneTimeDateError}</Text>}
              <Text variant="muted" style={styles.repeatHint}>
                This event is used once on the selected date only.
              </Text>
            </View>
          )}

          <View style={styles.modalSection}>
            <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Time</Text>
            <View style={styles.timeStack}>
              <View style={[styles.timeCard, themedChip]}>
                <Text variant="bodySmall" style={styles.timeCardLabel}>Start</Text>
                <View style={styles.timeCardControls}>
                  <View style={[styles.timeDisplay, themedInput]}>
                    <TwoDigitTimeInput
                      mode="hour"
                      style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
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
                    <Text variant="body" style={styles.timeDisplaySeparator}>:</Text>
                    <TwoDigitTimeInput
                      mode="minute"
                      style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
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
                        <Text variant="bodySmall" color={form.startPeriod === p ? palette.pillSelectedText : palette.textPrimary}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={[styles.timeCard, themedChip]}>
                <Text variant="bodySmall" style={styles.timeCardLabel}>End</Text>
                <View style={styles.timeCardControls}>
                  <View style={[styles.timeDisplay, themedInput]}>
                    <TwoDigitTimeInput
                      mode="hour"
                      style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
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
                    <Text variant="body" style={styles.timeDisplaySeparator}>:</Text>
                    <TwoDigitTimeInput
                      mode="minute"
                      style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
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
                        <Text variant="bodySmall" color={form.endPeriod === p ? palette.pillSelectedText : palette.textPrimary}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
            {!!timeError && <Text variant="muted" style={styles.timeError}>{timeError}</Text>}
          </View>

          <View style={styles.modalSection}>
            <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline, themedInput]}
              value={form.description}
              onChangeText={(t) => setForm((prev) => ({ ...prev, description: t }))}
              placeholder="Add a description"
              placeholderTextColor={palette.textMuted}
              multiline
              numberOfLines={2}
              underlineColorAndroid="transparent"
            />
          </View>

          <View style={styles.modalActionsRow}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={handleCancelEventModal}
              style={styles.modalActionButton}
            />
            <Button
              title={editingEventId ? 'Update' : 'Save'}
              onPress={addOrUpdateEntry}
              disabled={!canAdd}
              style={styles.modalActionButton}
            />
          </View>
          {editingEventId ? (
            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} activeOpacity={0.8}>
              <Text variant="bodySmall" color={theme.colors.error} style={styles.deleteBtnText}>Delete event</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </AppModal>

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
  headerCompact: {
    paddingTop: theme.spacing.xs,
    paddingBottom: 0,
    marginBottom: 0,
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
  sourceInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
  },
  /* ── Switch Source full-screen ── */
  switchSourceScreen: {
    flex: 1,
  },
  switchSourceHeader: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.xs,
    paddingBottom: 0,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  switchSourceScrollArea: {
    flex: 1,
  },
  switchSourceScrollContent: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.md,
    paddingBottom: 40,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  switchSourceCard: {
    marginBottom: 16,
  },
  switchSourceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchSourceCardTitle: {
    fontWeight: theme.fontWeight.semibold,
    flex: 1,
  },
  switchSourceCurrentTag: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  switchSourceFileSection: {
    marginTop: 12,
  },
  switchSourceFileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  switchSourceFileBtn: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  switchSourceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  switchSourceFooter: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  switchSourceWarning: {
    textAlign: 'center',
    color: theme.colors.warning,
    marginBottom: theme.spacing.sm,
    fontSize: theme.fontSize.xs,
  },
  editorScroll: {
    flex: 1,
  },
  editorScrollContent: {
    paddingBottom: theme.spacing.sm,
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
  weekHeaderWrap: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
  },
  weekHeaderTimeCell: {
    flexShrink: 0,
  },
  weekHeaderDaysRow: {
    flexDirection: 'row',
  },
  weekHeaderDayCell: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
  },
  weekHeaderDayCellActive: {
    borderRadius: 8,
  },
  weekHeaderDayName: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  weekHeaderDayDate: {
    fontSize: 18,
    fontWeight: '600' as any,
    marginTop: 2,
  },
  weekHeaderBadge: {
    marginTop: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  weekHeaderBadgeText: {
    fontSize: 10,
    fontWeight: '700' as any,
  },
  gridToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
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
  gridShell: {
    flex: 1,
    flexDirection: 'row',
  },
  gridDayRail: {
    borderRightWidth: 1,
  },
  gridDayRailHeader: {
    borderBottomWidth: 1,
  },
  gridTimeScroll: {
    flex: 1,
  },
  gridTimeRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridCellRow: {
    flexDirection: 'row',
    height: '100%',
  },
  gridCell: {
    height: '100%',
  },
  gridCellPressable: {
    height: '100%',
  },
  slotFeedbackPulse: {
    position: 'absolute',
    borderRadius: 6,
    backgroundColor: 'rgba(46,233,166,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(46,233,166,0.52)',
    zIndex: 25,
  },
  gridBodyScroll: {
    flexGrow: 0,
  },
  gridBodyRow: {
    flexDirection: 'row',
    height: GRID_BODY_HEIGHT,
  },
  gridTimeCol: {
    width: SLOT_WIDTH,
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
  weekGridScroll: {
    flex: 1,
  },
  gridDayCol: {
    position: 'relative',
    overflow: 'hidden',
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayLabelCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    borderRightWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayLabelText: {
    fontWeight: '600' as any,
  },
  hSlotCell: {
    borderRightWidth: StyleSheet.hairlineWidth,
    minWidth: 1,
  },
  hTimeLabel: {
    fontSize: 11,
    fontWeight: theme.fontWeight.semibold,
    textAlign: 'center',
  },
  gridEventBlockH: {
    position: 'absolute',
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6,38,29,0.28)',
    borderLeftWidth: 4,
    borderLeftColor: 'rgba(6,38,29,0.38)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 3,
  },
  gridEventBlockHCompact: {
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  gridEventBlockHSelected: {
    shadowColor: theme.colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  gridEventBlockHFaded: {
    opacity: 0.55,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  gridEventTitleH: {
    color: '#06261d',
    fontWeight: '600' as any,
    fontSize: 13,
    lineHeight: 16,
  },
  gridEventTitleHCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  gridEventTimeH: {
    color: 'rgba(6,38,29,0.85)',
    fontSize: 11,
    lineHeight: 13,
    marginTop: 1,
  },
  gridEventTimeHCompact: {
    fontSize: 10,
    lineHeight: 11,
  },
  gridEventDurationH: {
    color: 'rgba(6,38,29,0.72)',
    fontSize: 10,
    lineHeight: 12,
    marginTop: 2,
    fontWeight: theme.fontWeight.medium,
  },
  nowLineVertical: {
    position: 'absolute',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 20,
  },
  nowLineBarVertical: {
    width: 2,
    flex: 1,
    marginTop: -4,
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
    gap: 10,
  },
  freqModeChip: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqModeChipActive: {
    backgroundColor: theme.colors.accentPrimary,
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
    flexWrap: 'nowrap',
    gap: 4,
  },
  repeatDayChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.bgApp,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatDayChipActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  repeatDayChipText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 14,
    textAlign: 'center',
  },
  repeatDayChipTextActive: {
    color: theme.colors.accentPrimary,
    fontWeight: theme.fontWeight.semibold,
  },
  repeatHint: {
    fontSize: theme.fontSize.xs,
    marginTop: 0,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePartInput: {
    flex: 0,
    width: 68,
    textAlign: 'center',
  },
  dateYearInput: {
    flex: 1,
    minWidth: 92,
    textAlign: 'center',
  },
  dateSep: {
    fontWeight: theme.fontWeight.semibold,
    marginHorizontal: -2,
  },
  inputMultiline: {
    minHeight: 86,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
  },
  deleteBtn: {
    alignSelf: 'center',
    paddingVertical: 6,
    marginTop: 4,
  },
  deleteBtnText: {
    fontWeight: theme.fontWeight.semibold,
  },
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  mForm: {
    gap: 16,
    paddingBottom: 8,
  },
  modalSection: {
    gap: 8,
  },
  modalLabel: {
    color: theme.colors.textMuted,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.1,
  },
  input: {
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.md,
    minHeight: 50,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    lineHeight: 20,
    textAlignVertical: 'center',
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
          outlineColor: 'transparent',
          boxShadow: 'none',
        } as any)
      : {}),
  },
  lockedDay: {
    backgroundColor: theme.colors.bgApp,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  timeStack: { flexDirection: 'row', gap: 12 },
  timeCard: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    gap: 8,
  },
  timeCardLabel: {
    color: theme.colors.textMuted,
    fontWeight: theme.fontWeight.medium,
  },
  timeCardControls: { gap: 8 },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.md,
  },
  timeDisplayInput: {
    minWidth: 36,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
  },
  timeDisplaySeparator: {
    fontWeight: theme.fontWeight.semibold,
  },
  timeR: { flexDirection: 'row', gap: 12 },
  timeC: { flex: 1, minWidth: 0 },
  timeInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clockSeparator: {
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textMuted,
    minWidth: 10,
    textAlign: 'center',
  },
  timeInput: { flex: 0, width: 60, textAlign: 'center' },
  periodRow: { flexDirection: 'row', gap: 6 },
  periodBtn: {
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 36,
  },
  periodBtnActive: { backgroundColor: theme.colors.accentPrimary },
  timeError: {
    color: theme.colors.warning,
    marginTop: 2,
    marginBottom: 2,
  },
  timeTipText: {
    marginTop: 2,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalActionButton: {
    flex: 1,
  },
  saveError: {
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: 8,
  },
});
