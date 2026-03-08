import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
  Alert,
  ToastAndroid,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Modal as RNModal,
  PanResponder,
  AccessibilityActionEvent,
  InteractionManager,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import {
  googleCalendarService,
  signInWithGoogle,
  isSignInCancelled,
  getGoogleConfigurationError,
  isGoogleConfigured,
} from '../services/googleCalendar';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Modal as AppModal } from '../components/Modal';
import { ScreenHeader } from '../components/ScreenHeader';
import { TwoDigitTimeInput } from '../components/TwoDigitTimeInput';
import { TwoActionBar } from '../components/TwoActionBar';
import { AppIcon } from '../components/AppIcon';
import { appFontFamily, theme } from '../theme';
import { withAlpha } from '../theme/colorUtils';
import { screenChrome } from '../theme/screenChrome';
import { getThemePalette } from '../theme/palette';
import { ManualScheduleEntry } from '../types';
import { buildWeeklyTemplateFromIcsEvents, parseICSFile } from '../utils/ics';
import { manualScheduleRepo } from '../data/repositories/manualScheduleRepo';
import { eventsRepo } from '../data/repositories/eventsRepo';
import { plansRepo } from '../data/repositories/plansRepo';
import { scheduleSourceRepo } from '../data/repositories/scheduleSourceRepo';
import { syncNudgePlansForCurrentSchedule } from '../services/scheduleSync';
import { toUserFriendlyError } from '../utils/errorMessages';
import {
  SAVE_CONFIRM_ACTION,
  SAVE_CONFIRM_DECLINE,
  SAVE_CONFIRM_MESSAGE,
  SAVE_CONFIRM_TITLE,
} from '../utils/confirmMessages';
import { analyticsService } from '../services/analytics';
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
const DAY_COLUMNS = 7;
const SLOT_HEIGHT = 43;
const TIME_COL_WIDTH = 32;
const DAY_COLUMN_GUTTER = 1;
const GRID_PADDING = 4;
// Legacy (for scroll-to-8am etc.)
const DAY_ROW_HEIGHT = 80;
const SLOT_WIDTH = DAY_ROW_HEIGHT;
const DAY_LABEL_WIDTH = 50;
const TIME_ROW_HEIGHT = 28;
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

const onlyDigits = (value: string, max = 2): string => value.replace(/[^0-9]/g, '').slice(0, max);

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

interface GridSelectionTarget {
  dayIndex: number;
  slotIndex: number;
  kind: 'empty' | 'event';
  eventKey?: string;
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

const getEventTotalDurationMinutes = (startTime: string, endTime: string): number => {
  const start = hhmmToMinutes(startTime);
  const end = hhmmToMinutes(endTime);
  if (end <= start) return Math.max(1, 24 * 60 - start + end);
  return Math.max(1, end - start);
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

const getWeekStart = (value: Date): Date => {
  const base = startOfDay(value);
  return addDays(base, -base.getDay());
};

const getWeekDates = (weekStart: Date): Date[] =>
  Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

const isOneTimeEventVisibleInWeek = (event: TemplateEvent, activeWeekStart: Date): boolean => {
  if (!event.isOneTime) return true;
  if (!event.oneTimeDate) return true;
  const weekStartKey = toDateKey(activeWeekStart);
  const weekEndKey = toDateKey(addDays(activeWeekStart, 6));
  return event.oneTimeDate >= weekStartKey && event.oneTimeDate <= weekEndKey;
};

const resolveOneTimeDateForSelectedCell = (activeWeekStart: Date, dayIndex: number): string =>
  toDateKey(addDays(activeWeekStart, dayIndex));

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

const getVisibleEntriesByDayForWeek = (
  entriesByDaySorted: Record<number, TemplateEvent[]>,
  weekStart: Date,
): Record<number, TemplateEvent[]> => {
  const out = createEmptyEntriesByDay();
  const oneTimeSeenKeys = new Set<string>();

  for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
    const dayEvents = entriesByDaySorted[dayIndex] ?? [];
    for (const event of dayEvents) {
      if (!event.isOneTime) {
        out[dayIndex] = [...(out[dayIndex] ?? []), event];
        continue;
      }
      if (!isOneTimeEventVisibleInWeek(event, weekStart)) {
        continue;
      }
      const targetDayIndex = event.oneTimeDate ? getDayOfWeekFromDateKey(event.oneTimeDate) : dayIndex;
      const oneTimeKey = `${event.id}-${event.oneTimeDate ?? ''}`;
      if (oneTimeSeenKeys.has(oneTimeKey)) {
        continue;
      }
      oneTimeSeenKeys.add(oneTimeKey);
      out[targetDayIndex] = [...(out[targetDayIndex] ?? []), event];
    }
  }

  for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
    out[dayIndex] = [...(out[dayIndex] ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return out;
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
  const [selectedDay, setSelectedDay] = useState<number | null>(todayIndex);
  const [activeWeekStart, setActiveWeekStart] = useState<Date>(() => getWeekStart(today));
  const [selectedGridTarget, setSelectedGridTarget] = useState<GridSelectionTarget | null>(null);
  const [form, setForm] = useState<ManualFormState>(() => createDefaultFormState(todayIndex));
  const [eventFormInitialSignature, setEventFormInitialSignature] = useState<string>('');
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showSourceSheet, setShowSourceSheet] = useState(false);
  const [sourceType, setSourceType] = useState<'manual' | 'import' | 'google'>(initialSourceType);
  const [savedSourceType, setSavedSourceType] = useState<'manual' | 'import' | 'google'>(initialSourceType);
  const [importedFilename, setImportedFilename] = useState<string | undefined>(routeImportedFilename);
  const [savedImportedFilename, setSavedImportedFilename] = useState<string | undefined>(routeImportedFilename);
  const [didConfirmImportEditConversion, setDidConfirmImportEditConversion] = useState(false);
  const [sheetSourceType, setSheetSourceType] = useState<'manual' | 'import' | 'google'>(initialSourceType);
  const [sheetImportedFilename, setSheetImportedFilename] = useState<string | undefined>(routeImportedFilename);
  const [sheetImportedTemplate, setSheetImportedTemplate] = useState<Record<number, TemplateEvent[]> | null>(null);
  const [slotFeedback, setSlotFeedback] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [selectedCellAffordance, setSelectedCellAffordance] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [clearArmedDay, setClearArmedDay] = useState<number | null>(null);
  const [poppingEventKey, setPoppingEventKey] = useState<string | null>(null);
  const [viewOnlyEventInfo, setViewOnlyEventInfo] = useState<{ event: TemplateEvent; dayIndex: number } | null>(null);
  const [eventInfoEditMode, setEventInfoEditMode] = useState(false);
  const [eventInfoFormSnapshot, setEventInfoFormSnapshot] = useState<ManualFormState | null>(null);
  const [tappedInfoField, setTappedInfoField] = useState<'title' | 'frequency' | 'days' | 'time' | null>(null);
  const [editorScrollEnabled, setEditorScrollEnabled] = useState(true);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const allowNextBeforeRemoveRef = useRef(false);

  // navigate() reuses existing screens, so reset the source sheet when params change.
  useEffect(() => {
    setShowSourceSheet(false);
  }, [manageMode]);
  const gridScrollRef = useRef<ScrollView>(null);
  const weekSlideX = useRef(new Animated.Value(0)).current;
  const oneTimeMonthRef = useRef<TextInput>(null);
  const oneTimeDayRef = useRef<TextInput>(null);
  const oneTimeYearRef = useRef<TextInput>(null);
  const startMinuteRef = useRef<TextInput>(null);
  const endMinuteRef = useRef<TextInput>(null);
  const appearAnim = useRef(new Animated.Value(1)).current;
  const slotFeedbackScaleAnim = useRef(new Animated.Value(0.92)).current;
  const slotFeedbackOpacityAnim = useRef(new Animated.Value(0)).current;
  const selectedCellScaleAnim = useRef(new Animated.Value(0.92)).current;
  const selectedCellOpacityAnim = useRef(new Animated.Value(0)).current;
  const eventPopAnim = useRef(new Animated.Value(0)).current;
  const eventPulseTokenRef = useRef(0);
  const selectedCellAnimTokenRef = useRef(0);
  const weekSlideActiveRef = useRef(false);
  const prevWeekNavScale = useRef(new Animated.Value(1)).current;
  const nextWeekNavScale = useRef(new Animated.Value(1)).current;
  const prevWeekNavGlow = useRef(new Animated.Value(0)).current;
  const nextWeekNavGlow = useRef(new Animated.Value(0)).current;
  const infoTitleFadeOut = useRef(new Animated.Value(1)).current;
  const infoTitleFadeIn = useRef(new Animated.Value(0)).current;
  const infoDeleteIconOpacity = useRef(new Animated.Value(0)).current;
  const { scheduleSource, setScheduleSource, setUpcomingPlans, preferences, themeMode } = useAppStore();


  const scrollGridToNow = useCallback((animated = true) => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowInGridMinutes = nowMinutes < GRID_START_MIN ? nowMinutes + 24 * 60 : nowMinutes;
    const nowY = ((nowInGridMinutes - GRID_START_MIN) / SLOT_MINUTES) * SLOT_HEIGHT;
    const gridViewportHeight = Math.max(320, Math.min(640, winHeight * 0.64));
    const leadOffset = Math.max(24, Math.min(gridViewportHeight * 0.35, 220));
    const maxScrollY = Math.max(0, NUM_SLOTS * SLOT_HEIGHT - gridViewportHeight);
    const targetY = Math.max(0, Math.min(maxScrollY, nowY - leadOffset));

    gridScrollRef.current?.scrollTo({
      y: targetY,
      animated,
    });
  }, [winHeight]);

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

  // Re-position the grid after navigation interactions finish so screen-enter stays smooth.
  useFocusEffect(
    useCallback(() => {
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        if (Platform.OS === 'web') {
          const node = (gridScrollRef.current as any)?.getScrollableNode?.();
          if (node) node.setAttribute('data-gapwalk-schedule-scroll', 'true');
        }
        scrollGridToNow(false);
      });
      return () => interactionTask.cancel();
    }, [scrollGridToNow])
  );

  useEffect(() => {
    appearAnim.setValue(1);
  }, [appearAnim]);

  const scheduleSourceRef = useRef(scheduleSource);
  scheduleSourceRef.current = scheduleSource;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadSavedTemplate = async () => {
        const resolveSourceState = async (): Promise<{ type: 'manual' | 'import' | 'google'; filename?: string }> => {
          const src = scheduleSourceRef.current ?? (await scheduleSourceRepo.get());
          if (!src) {
            return {
              type: routeImportedFilename ? 'import' : 'manual',
              filename: routeImportedFilename,
            };
          }
          if (src.type === 'ics') {
            return { type: 'import', filename: src.filename ?? routeImportedFilename };
          }
          if (src.type === 'google') {
            return { type: 'google' };
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
            await manualScheduleRepo.replaceAll(cleaned);
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
          if (__DEV__) console.error('Failed to load saved manual schedule:', error);
        }
      };
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        if (!active) return;
        void loadSavedTemplate();
      });
      return () => {
        active = false;
        interactionTask.cancel();
      };
    }, [prefillTemplate, requireSaveBeforeContinue, routeImportedFilename, startWithEmpty])
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
      if (__DEV__) console.error('ICS import failed:', error);
      setImportLoading(false);
      setImportStatus(null);
      const msg = toUserFriendlyError(error);
      showMessage('Import Failed', msg);
      return null;
    }
  };

  const handleGoogleCalendarImport = async (accessToken: string) => {
    try {
      setImportLoading(true);
      setImportStatus('Fetching your Google Calendar events...');
      const events = await googleCalendarService.fetchEvents(accessToken, 14);
      if (events.length === 0) {
        setImportLoading(false);
        setImportStatus(null);
        showMessage('No Events', 'No upcoming events found in your Google Calendar.');
        return;
      }
      setImportStatus(`Processing ${events.length} events...`);
      const weeklyTemplate = buildWeeklyTemplateFromIcsEvents(events, 'gcal');
      const grouped = groupTemplateEntries(weeklyTemplate);
      analyticsService.track('google_calendar_imported', {
        eventsFetched: events.length,
        weeklyTemplateEntries: weeklyTemplate.length,
      });
      setSheetSourceType('google');
      setSheetImportedFilename(undefined);
      setSheetImportedTemplate(grouped);
      setImportLoading(false);
      setImportStatus(null);
    } catch (error) {
      if (__DEV__) console.error('Google Calendar import failed:', error);
      setImportLoading(false);
      setImportStatus(null);
      showMessage('Google Calendar Error', toUserFriendlyError(error));
    }
  };

  const startGoogleAuth = useCallback(async () => {
    const configError = getGoogleConfigurationError();
    if (configError || !isGoogleConfigured()) {
      showMessage(
        'Google Calendar',
        configError ?? 'Google Calendar is not configured.',
      );
      return;
    }
    setImportLoading(true);
    setImportStatus('Opening Google sign-in...');
    try {
      const accessToken = await signInWithGoogle();
      await handleGoogleCalendarImport(accessToken);
    } catch (error) {
      if (isSignInCancelled(error)) {
        setImportLoading(false);
        setImportStatus(null);
        return;
      }
      setImportLoading(false);
      setImportStatus(null);
      showMessage('Sign-in Failed', toUserFriendlyError(error));
    }
  }, [handleGoogleCalendarImport]);

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
  const shouldConvertImportEditsToManual =
    sourceType === 'import' &&
    hasUnsavedChanges &&
    !hasSourceChanges;
  const sheetResolvedFilename = sheetImportedFilename ?? importedFilename;
  const sourceSheetHasChanges =
    sheetSourceType !== sourceType ||
    (
      sheetSourceType === 'import' &&
      (sheetResolvedFilename ?? '') !== (importedFilename ?? '')
    ) ||
    sheetImportedTemplate !== null;
  const sourceSheetNeedsImportFile = sheetSourceType === 'import' && !(sheetResolvedFilename?.trim());
  const sourceSheetNeedsGoogleConnect =
    sheetSourceType === 'google' && !sheetImportedTemplate && sourceType !== 'google';

  useEffect(() => {
    if (!shouldConvertImportEditsToManual) {
      setDidConfirmImportEditConversion(false);
    }
  }, [shouldConvertImportEditsToManual]);

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
  const eventFormHasChanges = eventFormInitialSignature.length > 0 &&
    buildFormSignature(form) !== eventFormInitialSignature;
  const canSubmitEvent = canAdd && (!editingEventId || eventFormHasChanges);
  const timeError = !hasValidTimes
    ? 'Enter a valid start and end time.'
    : !isRangeValid
      ? 'Start and end time cannot be the same.'
      : '';

  const getPreferredOneTimeDateForDay = useCallback((dayIndex: number): string => {
    return resolveOneTimeDateForSelectedCell(activeWeekStart, dayIndex);
  }, [activeWeekStart]);

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

  useEffect(() => {
    const target = selectedGridTarget?.kind === 'empty'
      ? { dayIndex: selectedGridTarget.dayIndex, slotIndex: selectedGridTarget.slotIndex }
      : null;

    if (target) {
      const isSameTarget =
        selectedCellAffordance?.dayIndex === target.dayIndex &&
        selectedCellAffordance?.slotIndex === target.slotIndex;
      if (isSameTarget) return;
      selectedCellAnimTokenRef.current += 1;
      setSelectedCellAffordance(target);
      selectedCellScaleAnim.stopAnimation();
      selectedCellOpacityAnim.stopAnimation();
      selectedCellScaleAnim.setValue(0.92);
      selectedCellOpacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(selectedCellScaleAnim, {
          toValue: 1,
          tension: 130,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(selectedCellOpacityAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!selectedCellAffordance) return;
    const token = ++selectedCellAnimTokenRef.current;
    selectedCellScaleAnim.stopAnimation();
    selectedCellOpacityAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(selectedCellScaleAnim, {
        toValue: 0.94,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(selectedCellOpacityAnim, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || selectedCellAnimTokenRef.current !== token) return;
      setSelectedCellAffordance(null);
    });
  }, [
    selectedCellAffordance,
    selectedCellOpacityAnim,
    selectedCellScaleAnim,
    selectedGridTarget,
  ]);

  const triggerEventPulse = useCallback((eventKey: string, onComplete?: () => void) => {
    const token = ++eventPulseTokenRef.current;
    setPoppingEventKey(eventKey);
    eventPopAnim.stopAnimation();
    eventPopAnim.setValue(0);
    Animated.timing(eventPopAnim, {
      toValue: 1,
      duration: 170,
      easing: Easing.out(Easing.back(1.45)),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (eventPulseTokenRef.current !== token) return;
      setPoppingEventKey(null);
      eventPopAnim.setValue(0);
      if (!finished) return;
      onComplete?.();
    });
  }, [eventPopAnim]);

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
    setSelectedGridTarget(null);
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
    };
    setEditingEventId(event.id);
    setEditingSeriesId(seriesId);
    setForm(nextForm);
    setEventFormInitialSignature(buildFormSignature(nextForm));
    setSelectedGridTarget(null);
    setShowAdd(true);
  };

  const buildEventSelectionTarget = useCallback(
    (eventId: string, dayIndex: number, startTime24: string): GridSelectionTarget => {
      const startMinute = hhmmToMinutes(startTime24);
      const startInRow = normalizeToRowMinutes(startMinute);
      const sameDayStart = Math.max(GRID_START_MIN, Math.min(GRID_END_MIN - 1, startInRow));
      const slotIndexRaw = Math.floor((sameDayStart - GRID_START_MIN) / SLOT_MINUTES);
      return {
        dayIndex,
        slotIndex: Math.max(0, Math.min(NUM_SLOTS - 1, slotIndexRaw)),
        kind: 'event',
        eventKey: `${eventId}-${dayIndex}-base-${sameDayStart}`,
      };
    },
    []
  );

  const closeEventModal = useCallback((nextSelectedTarget: GridSelectionTarget | null = null) => {
    setShowAdd(false);
    setEditingEventId(null);
    setEditingSeriesId(null);
    setEventFormInitialSignature('');
    setSelectedGridTarget(nextSelectedTarget);
    setForm(createDefaultFormState(todayIndex));
    // Also close event info modal if it was the source of the edit
    if (eventInfoEditMode) {
      setViewOnlyEventInfo(null);
      setEventInfoEditMode(false);
      setEventInfoFormSnapshot(null);
      infoTitleFadeOut.setValue(1);
      infoTitleFadeIn.setValue(0);
      infoDeleteIconOpacity.setValue(0);
    }
  }, [eventInfoEditMode, infoDeleteIconOpacity, infoTitleFadeIn, infoTitleFadeOut, todayIndex]);

  /* ── Event Info → inline edit handlers ── */

  const buildFormFromEvent = useCallback((event: TemplateEvent, dayIndex: number): ManualFormState => {
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
    return {
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
    };
  }, [entriesByDay, getPreferredOneTimeDateForDay]);

  const tappedInfoFieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInfoFieldTap = useCallback((field: 'title' | 'frequency' | 'days' | 'time') => {
    if (tappedInfoFieldTimerRef.current) clearTimeout(tappedInfoFieldTimerRef.current);
    setTappedInfoField(field);
    tappedInfoFieldTimerRef.current = setTimeout(() => setTappedInfoField(null), 2500);
  }, []);

  const handleEventInfoEdit = useCallback(() => {
    if (!viewOnlyEventInfo) return;
    const { event, dayIndex } = viewOnlyEventInfo;
    const nextForm = buildFormFromEvent(event, dayIndex);
    const repeatMode: ManualRepeatMode = event.isOneTime ? 'one_time' : 'weekly';
    const seriesId = repeatMode === 'weekly' ? resolveRecurringSeriesId(event.id) : null;
    setEditingEventId(event.id);
    setEditingSeriesId(seriesId);
    setForm(nextForm);
    setEventFormInitialSignature(buildFormSignature(nextForm));
    setEventInfoFormSnapshot(nextForm);
    setEventInfoEditMode(true);
    // Crossfade title: "Event Info" → "Edit Event"
    infoTitleFadeIn.setValue(0);
    infoDeleteIconOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(infoTitleFadeOut, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(infoTitleFadeIn, {
        toValue: 1,
        duration: 300,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(infoDeleteIconOpacity, {
        toValue: 1,
        duration: 250,
        delay: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [buildFormFromEvent, infoDeleteIconOpacity, infoTitleFadeIn, infoTitleFadeOut, viewOnlyEventInfo]);

  const closeEventInfoModal = useCallback(() => {
    setViewOnlyEventInfo(null);
    setEventInfoEditMode(false);
    setEventInfoFormSnapshot(null);
    setTappedInfoField(null);
    setEditingEventId(null);
    setEditingSeriesId(null);
    setEventFormInitialSignature('');
    setForm(createDefaultFormState(todayIndex));
    // Reset animations
    infoTitleFadeOut.setValue(1);
    infoTitleFadeIn.setValue(0);
    infoDeleteIconOpacity.setValue(0);
  }, [infoDeleteIconOpacity, infoTitleFadeIn, infoTitleFadeOut, todayIndex]);

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
    const shouldWarn = eventFormHasChanges;
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
      showMessage('Import needed', 'Choose a calendar export file (.ics) before saving source changes.');
      return;
    }

    if (sheetImportedTemplate) {
      setEntriesByDay(cloneEntriesByDay(sheetImportedTemplate));
      setHasSavedSchedule(false);
    }
    setSourceType(nextSourceType);
    setImportedFilename(nextFilename);
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
      showMessage('Import needed', 'Choose a calendar export file (.ics) before continuing.');
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

  const handleManageChangeSource = () => {
    handleOpenSourceSheet();
  };

  const handleManageBackToOptions = () => {
    navigation.navigate('Dashboard', { openMenu: true });
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
    if (editingEventId && !eventFormHasChanges) {
      return;
    }
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
      oneTimeDateKey: string | null;
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
              oneTimeDateKey: event.isOneTime ? event.oneTimeDate ?? null : null,
            },
          ];
        }
      }
    }
    for (const ownerDay of targetDays) {
      const candidateOneTimeDateKey = newOneTime ? resolvedOneTimeDate : null;
      const candidateSegments = buildDayMinuteSegments(ownerDay, startMin, endMin);
      for (const candidate of candidateSegments) {
        const existingSegments = existingSegmentsByDay[candidate.dayIndex] ?? [];
        for (const existing of existingSegments) {
          if (!timeRangesOverlap(candidate.startMinute, candidate.endMinute, existing.startMinute, existing.endMinute)) {
            continue;
          }
          const existingOneTime = !!existing.event.isOneTime;
          if (newOneTime) {
            if (!existingOneTime) continue;
            if (
              candidateOneTimeDateKey &&
              existing.oneTimeDateKey &&
              existing.oneTimeDateKey !== candidateOneTimeDateKey
            ) {
              continue;
            }
          } else if (existingOneTime) {
            continue;
          }
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

      let focusedDayIndex: number | null = null;
      let focusedEventId: string | null = null;

      if (editingEventId) {
        const id = editingEventId;
        const oneTimeDate = resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek);
        const oneTimeDay = getDayOfWeekFromDateKey(oneTimeDate);
        const daysToUpdate = form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek];
        const seriesId = editingSeriesId ?? createRecurringSeriesId();

        focusedDayIndex = form.repeatMode === 'one_time' ? oneTimeDay : daysToUpdate[0];
        focusedEventId = form.repeatMode === 'one_time'
          ? id
          : buildRecurringEventId(seriesId, focusedDayIndex);

        setEntriesByDay((prev) => {
          const next = removeEditingTargets(prev);
          if (form.repeatMode === 'one_time') {
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
          for (let i = 0; i < daysToUpdate.length; i++) {
            const d = daysToUpdate[i];
            const eventId = buildRecurringEventId(seriesId, d);
            const event: TemplateEvent = { id: eventId, title, startTime: start, endTime: end, isOneTime: false };
            next[d] = [...(next[d] ?? []), event];
          }
          return next;
        });
      } else {
        const baseId = `m-${Date.now()}`;
        const oneTimeDate = resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek);
        const oneTimeDay = getDayOfWeekFromDateKey(oneTimeDate);
        const daysToAdd = form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek];
        const seriesId = createRecurringSeriesId();

        focusedDayIndex = form.repeatMode === 'one_time' ? oneTimeDay : daysToAdd[0];
        focusedEventId = form.repeatMode === 'one_time'
          ? `${baseId}-0`
          : buildRecurringEventId(seriesId, focusedDayIndex);

        setEntriesByDay((prev) => {
          const next = { ...prev };
          if (form.repeatMode === 'one_time') {
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

      if (focusedDayIndex !== null) {
        setSelectedDay(focusedDayIndex);
      }

      const oneTimeDateToCheck = resolvedOneTimeDate || getPreferredOneTimeDateForDay(form.dayOfWeek);
      const oneTimeVisibleInActiveWeek = form.repeatMode !== 'one_time' ||
        (oneTimeDateToCheck >= toDateKey(activeWeekStart) && oneTimeDateToCheck <= toDateKey(addDays(activeWeekStart, 6)));

      const selectedTarget = focusedDayIndex !== null && focusedEventId && oneTimeVisibleInActiveWeek
        ? buildEventSelectionTarget(focusedEventId, focusedDayIndex, start)
        : null;

      closeEventModal(selectedTarget);
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

  /* ── Event Info modal → inline edit/save/cancel/delete handlers ── */

  const handleEventInfoCancel = useCallback(() => {
    if (!eventInfoEditMode) {
      closeEventInfoModal();
      return;
    }
    // In edit mode, check for unsaved changes
    const hasChanges = eventFormInitialSignature.length > 0 &&
      buildFormSignature(form) !== eventFormInitialSignature;
    if (!hasChanges) {
      closeEventInfoModal();
      return;
    }
    showBinaryConfirm(
      'Cancel event update?',
      'Canceling now will revert all changes to this event. Do you want to continue?',
      'Yes',
      closeEventInfoModal,
      'destructive',
    );
  }, [closeEventInfoModal, eventFormInitialSignature, eventInfoEditMode, form, showBinaryConfirm]);

  const handleEventInfoSave = useCallback(() => {
    // Delegate to addOrUpdateEntry — it shows confirmation, applies changes to
    // entriesByDay, then calls closeEventModal() which also closes the info modal.
    addOrUpdateEntry();
  }, [addOrUpdateEntry]);

  const handleEventInfoDelete = useCallback(() => {
    const id = editingEventId;
    const seriesId = editingSeriesId;
    if (!id) return;
    const deletingSeries = !!seriesId;
    const title = deletingSeries ? 'Delete recurring event?' : 'Delete event';
    const message = deletingSeries ? 'Remove this event from all repeated days?' : 'Remove this event?';
    const doDelete = () => {
      // deleteEntryFromModal calls closeEventModal which also closes the info modal
      deleteEntryFromModal(id, deletingSeries ? seriesId : null);
    };
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(message)) doDelete();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }, [deleteEntryFromModal, editingEventId, editingSeriesId]);

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

  const performSave = async (options?: { convertImportEditsToManual?: boolean }) => {
    if (savingDone) return;
    const effectiveSourceType: 'manual' | 'import' | 'google' = options?.convertImportEditsToManual ? 'manual' : sourceType;
    const effectiveImportedFilename = effectiveSourceType === 'import' ? importedFilename : undefined;

    if (effectiveSourceType === 'import' && !effectiveImportedFilename) {
      showMessage('Import needed', 'Choose a calendar export file (.ics) before saving this schedule.');
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

    const eventSource: 'ics' | 'manual' | 'google' = effectiveSourceType === 'import' ? 'ics' : effectiveSourceType === 'google' ? 'google' : 'manual';
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
          await manualScheduleRepo.replaceAll(weeklyTemplate);
        } catch (e) {
          failedStep = 'saving your schedule to storage';
          throw e;
        }
        try {
          await eventsRepo.replaceAll(events);
        } catch (e) {
          failedStep = 'saving calendar events';
          throw e;
        }
        const src = effectiveSourceType === 'import'
          ? { type: 'ics' as const, filename: effectiveImportedFilename, lastImportedAt: new Date().toISOString() }
          : effectiveSourceType === 'google'
            ? { type: 'google' as const, googleConnected: true, lastImportedAt: new Date().toISOString() }
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
          source: effectiveSourceType,
          weeklyEntries: weeklyTemplate.filter((entry) => !entry.isOneTime).length,
          oneTimeEntries: weeklyTemplate.filter((entry) => entry.isOneTime).length,
          generatedEvents: events.length,
          manageMode,
        });

        setInitialSignature(currentSignature);
        setSavedEntriesByDay(cloneEntriesByDay(entriesByDay));
        setSourceType(effectiveSourceType);
        setImportedFilename(effectiveImportedFilename);
        setSavedSourceType(effectiveSourceType);
        setSavedImportedFilename(effectiveImportedFilename);
        setSheetSourceType(effectiveSourceType);
        setSheetImportedFilename(effectiveImportedFilename);
        setSheetImportedTemplate(null);
        setHasSavedSchedule(true);
        setSavingDone(false);

        if (manageMode) {
          if (Platform.OS === 'android') {
            ToastAndroid.show('Schedule saved', ToastAndroid.SHORT);
          } else if (Platform.OS === 'ios') {
            Alert.alert('Saved', 'Schedule saved');
          } else {
            showMessage('Saved', 'Schedule saved');
          }
          return;
        }

        if (requireSaveBeforeContinue) {
          return;
        }

        runAllowedNavigation(() => navigation.navigate('Preferences', {}));
        return;
      } catch (err) {
        lastError = err;
        if (__DEV__) console.error(`Save schedule attempt ${attempt + 1} failed${failedStep ? ` at step: ${failedStep}` : ''}:`, err);
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

    const convertImportEditsToManual = shouldConvertImportEditsToManual;
    const confirmTitle = manageMode ? 'Save schedule changes?' : SAVE_CONFIRM_TITLE;
    const conversionNotice =
      convertImportEditsToManual && !didConfirmImportEditConversion
        ? '\n\nEditing an imported schedule converts it to Manual and stops import sync for this version.'
        : '';
    const confirmMessage = `${manageMode ? 'Do you want to save these schedule changes?' : SAVE_CONFIRM_MESSAGE}${conversionNotice}`;
    const confirmAction = manageMode ? 'Yes, Save' : SAVE_CONFIRM_ACTION;
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(`${confirmTitle}\n\n${confirmMessage}`);
      if (ok) {
        if (convertImportEditsToManual) {
          setDidConfirmImportEditConversion(true);
        }
        void performSave({ convertImportEditsToManual });
      }
      return;
    }

    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        { text: SAVE_CONFIRM_DECLINE, style: 'cancel' },
        {
          text: confirmAction,
          onPress: () => {
            if (convertImportEditsToManual) {
              setDidConfirmImportEditConversion(true);
            }
            void performSave({ convertImportEditsToManual });
          },
        },
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

  const activeWeekDates = useMemo(() => getWeekDates(activeWeekStart), [activeWeekStart]);
  const activeWeekMonthLabel = useMemo(() => format(activeWeekStart, 'MMM').toUpperCase(), [activeWeekStart]);
  const activeWeekYearLabel = useMemo(() => format(activeWeekStart, 'yyyy'), [activeWeekStart]);
  const visibleEntriesByDay = useMemo(
    () => getVisibleEntriesByDayForWeek(entriesByDaySorted, activeWeekStart),
    [activeWeekStart, entriesByDaySorted]
  );
  const activeWeekStartKey = toDateKey(activeWeekStart);
  const activeWeekEndKey = toDateKey(addDays(activeWeekStart, 6));

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
      const sourceEvents = visibleEntriesByDay[sourceDayIndex] ?? [];
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
          if (event.isOneTime) {
            continue;
          }
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
  }, [activeWeekEndKey, activeWeekStartKey, visibleEntriesByDay]);

  const getSliceSlotBounds = useCallback((slice: GridDisplaySlice): {
    startSlot: number;
    endSlotExclusive: number;
    top: number;
    height: number;
  } => {
    // Slot-based bounds for touch-hit detection
    const startSlotRaw = Math.floor((slice.startMinuteInRow - GRID_START_MIN) / SLOT_MINUTES);
    const endSlotRaw = Math.ceil((slice.endMinuteInRow - GRID_START_MIN) / SLOT_MINUTES);
    const startSlot = Math.max(0, Math.min(NUM_SLOTS - 1, startSlotRaw));
    const endSlotExclusive = Math.max(startSlot + 1, Math.min(NUM_SLOTS, endSlotRaw));

    // Pixel-precise positioning based on exact minutes
    const pixelsPerMinute = SLOT_HEIGHT / SLOT_MINUTES;
    const startMinute = Math.max(0, slice.startMinuteInRow - GRID_START_MIN);
    const endMinute = Math.min(NUM_SLOTS * SLOT_MINUTES, slice.endMinuteInRow - GRID_START_MIN);
    const duration = endMinute - startMinute;

    return {
      startSlot,
      endSlotExclusive,
      top: startMinute * pixelsPerMinute,
      height: Math.max(duration * pixelsPerMinute, SLOT_HEIGHT - 2),
    };
  }, []);

  const handleGridCellPress = useCallback((dayIndex: number, slotIndex: number) => {
    setSelectedDay(dayIndex);
    setClearArmedDay(null);
    animateSlotFeedback(dayIndex, slotIndex);

    const isSecondTapOnSameCell =
      selectedGridTarget?.kind === 'empty' &&
      selectedGridTarget.dayIndex === dayIndex &&
      selectedGridTarget.slotIndex === slotIndex;
    if (isSecondTapOnSameCell) {
      setTimeout(() => {
        handleSlotClick(dayIndex, slotIndex);
      }, 70);
      return;
    }

    setSelectedGridTarget({
      dayIndex,
      slotIndex,
      kind: 'empty',
    });
  }, [
    animateSlotFeedback,
    handleSlotClick,
    selectedGridTarget,
  ]);

  const handleEventPress = useCallback((slice: GridDisplaySlice, dayIndex: number) => {
    const bounds = getSliceSlotBounds(slice);
    const isSecondTapOnSameEvent =
      selectedGridTarget?.kind === 'event' &&
      selectedGridTarget.dayIndex === dayIndex &&
      selectedGridTarget.eventKey === slice.key;

    setSelectedDay(dayIndex);
    setClearArmedDay(null);

    if (isSecondTapOnSameEvent) {
      triggerEventPulse(slice.key, () => {
        infoTitleFadeOut.setValue(1);
        infoTitleFadeIn.setValue(0);
        infoDeleteIconOpacity.setValue(0);
        setViewOnlyEventInfo({ event: slice.event, dayIndex: slice.sourceDayIndex });
      });
      return;
    }

    setSelectedGridTarget({
      dayIndex,
      slotIndex: bounds.startSlot,
      kind: 'event',
      eventKey: slice.key,
    });
    triggerEventPulse(slice.key);
  }, [
    getSliceSlotBounds,
    infoDeleteIconOpacity,
    infoTitleFadeIn,
    infoTitleFadeOut,
    selectedGridTarget,
    triggerEventPulse,
  ]);

  const applyE2ESampleSchedule = () => {
    const targetDayIndex = selectedDay ?? todayIndex;
    const newEvent: TemplateEvent = {
      id: `e2e-${Date.now()}`,
      title: 'E2E Sample Block',
      startTime: '09:00',
      endTime: '10:00',
    };
    setEntriesByDay((prev) => ({
      ...prev,
      [targetDayIndex]: [...(prev[targetDayIndex] ?? []), newEvent],
    }));
    analyticsService.track('e2e_sample_manual_schedule_seeded', { dayOfWeek: targetDayIndex });
  };

  /* ── Clear day ── */
  const handleClearDay = (dayIndex?: number) => {
    const d = dayIndex ?? selectedDay;
    if (d === null || d === undefined) return;
    const dayName = DAY_FULL_NAMES[d];
    const count = (entriesByDay[d] ?? []).filter(
      (event) => !event.isOneTime || isOneTimeEventVisibleInWeek(event, activeWeekStart)
    ).length;
    if (count === 0) return;
    const title = `Clear ${dayName}?`;
    const message = `Remove all ${count} visible event${count > 1 ? 's' : ''} from ${dayName}?`;
    const clearVisibleEvents = () => {
      setEntriesByDay((prev) => ({
        ...prev,
        [d]: (prev[d] ?? []).filter(
          (event) => event.isOneTime && !isOneTimeEventVisibleInWeek(event, activeWeekStart)
        ),
      }));
      setSelectedGridTarget((prev) => (prev?.dayIndex === d ? null : prev));
    };
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      if ((globalThis as any).confirm(`${title}\n\n${message}`)) {
        clearVisibleEvents();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearVisibleEvents },
    ]);
  };

  /* ── Current-time indicator (horizontal line in vertical-time grid) ── */
  const now = new Date();
  const todayGridDateKey = toDateKey(startOfDay(now));
  const isTodayInActiveWeek = todayGridDateKey >= activeWeekStartKey && todayGridDateKey <= activeWeekEndKey;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDayIndex = now.getDay();
  const nowInGridMinutes = nowMinutes < GRID_START_MIN ? nowMinutes + 24 * 60 : nowMinutes;
  const nowOffsetMin = nowInGridMinutes - GRID_START_MIN;
  const nowRowFloat = nowOffsetMin / SLOT_MINUTES;
  const nowTop = nowRowFloat * SLOT_HEIGHT;
  const gridBodyHeight = NUM_SLOTS * SLOT_HEIGHT;
  const gridViewportHeight = Math.max(320, Math.min(640, winHeight * 0.64));
  const availableWeekWidth = Math.max(280, winWidth - GRID_PADDING * 2 - TIME_COL_WIDTH - 2);
  const dayColumnWidth = Math.max(36, Math.floor(availableWeekWidth / DAY_COLUMNS));
  const weekGridWidth = dayColumnWidth * DAY_COLUMNS;
  const gridTrackWidth = TIME_COL_WIDTH + weekGridWidth;
  const weekHeaderPagerWidth = weekGridWidth;
  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';
  const mintTextOnTint = palette.accentOnTint;
  const accentSolidText = palette.accentOnSolid;
  const accentSolidTextMuted = withAlpha(palette.accentOnSolid, 0.85);
  const accentSurfaceSoft = withAlpha(palette.accentPrimary, isDark ? 0.08 : 0.12);
  const accentSurfaceStrong = withAlpha(palette.accentPrimary, isDark ? 0.14 : 0.16);
  const accentSelectedCellBg = withAlpha(palette.accentPrimary, isDark ? 0.16 : 0.12);
  const accentPressedCellBg = withAlpha(palette.accentPrimary, isDark ? 0.24 : 0.2);
  const accentBorderSoft = withAlpha(palette.accentPrimary, isDark ? 0.32 : 0.28);
  const accentBorderSelectedCell = withAlpha(palette.accentPrimary, isDark ? 0.56 : 0.45);
  const accentSourceOptionBg = withAlpha(palette.accentPrimary, isDark ? 0.07 : 0.06);
  const accentSourceIconBg = withAlpha(palette.accentPrimary, isDark ? 0.13 : 0.11);
  const accentSlotFeedbackBg = withAlpha(palette.accentPrimary, isDark ? 0.22 : 0.18);
  const accentSlotFeedbackBorder = withAlpha(palette.accentPrimary, isDark ? 0.52 : 0.42);
  const gridLineStrong = isDark ? 'rgba(255,255,255,0.1)' : palette.borderStrong;
  const gridLineSoft = isDark ? 'rgba(255,255,255,0.06)' : palette.borderSoft;
  const gridAltBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.03)';
  const eventBorderColor = isDark ? 'rgba(0,0,0,0.08)' : 'rgba(15,23,42,0.2)';
  const nowIndicatorColor = palette.accentPrimary;
  const nowIndicatorGlow = withAlpha(palette.accentPrimary, 0.34);
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
  const slotHintText = 'Tap once to select a slot or event. Tap the same spot again to add or edit.';
  const manageSourceLabel = sourceType === 'import'
    ? `ICS file: ${importedFilename ?? 'calendar import'}`
    : sourceType === 'google'
      ? 'Source: Google Calendar'
      : 'Source: Manual schedule';
  const manageSourceIcon: import('../components/AppIcon').AppIconName =
    sourceType === 'import' || sourceType === 'google' ? 'calendar' : 'adjust';
  const selectedDayVisibleCount = selectedDay !== null ? (visibleEntriesByDay[selectedDay] ?? []).length : 0;
  const clearDayLabel = selectedDay === null ? 'Clear day' : `Clear ${DAY_TAB_LABELS[selectedDay]}`;
  const headerWeekPages = useMemo(() => {
    const offsets = [-7, 0, 7] as const;
    return offsets.map((offsetDays) => {
      const weekStart = addDays(activeWeekStart, offsetDays);
      return {
        key: `${toDateKey(weekStart)}-${offsetDays}`,
        dates: getWeekDates(weekStart),
        visibleEntriesByDay: getVisibleEntriesByDayForWeek(entriesByDaySorted, weekStart),
      };
    });
  }, [activeWeekStart, entriesByDaySorted]);

  const weekSlideNeedsResetRef = useRef(false);

  // Reset animated offset AFTER React re-renders with new week data,
  // but BEFORE the frame is painted — prevents old-data flash.
  useLayoutEffect(() => {
    if (weekSlideNeedsResetRef.current) {
      weekSlideX.setValue(0);
      weekSlideActiveRef.current = false;
      weekSlideNeedsResetRef.current = false;
    }
  }, [activeWeekStart, weekSlideX]);

  const commitWeekShift = useCallback((direction: -1 | 1) => {
    if (weekSlideActiveRef.current) return;
    weekSlideActiveRef.current = true;
    Animated.spring(weekSlideX, {
      toValue: -direction * weekHeaderPagerWidth,
      tension: 280,
      friction: 28,
      useNativeDriver: false,
    }).start(() => {
      weekSlideNeedsResetRef.current = true;
      setSelectedDay(null);
      setSelectedGridTarget(null);
      setClearArmedDay(null);
      setActiveWeekStart((prev) => addDays(prev, direction * 7));
    });
  }, [weekHeaderPagerWidth, weekSlideX]);

  const weekPanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !weekSlideActiveRef.current && Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < 20,
      onPanResponderGrant: () => {
        weekSlideX.stopAnimation();
        weekSlideX.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        const clamped = Math.max(-weekHeaderPagerWidth, Math.min(weekHeaderPagerWidth, gs.dx));
        weekSlideX.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        const swipeThreshold = weekHeaderPagerWidth * 0.25;
        const velocityThreshold = 0.4;
        let direction: -1 | 0 | 1 = 0;
        if (gs.dx > swipeThreshold || gs.vx > velocityThreshold) {
          direction = -1; // swiped right = previous week
        } else if (gs.dx < -swipeThreshold || gs.vx < -velocityThreshold) {
          direction = 1; // swiped left = next week
        }
        if (direction !== 0) {
          weekSlideActiveRef.current = true;
          Animated.spring(weekSlideX, {
            toValue: -direction * weekHeaderPagerWidth,
            tension: 280,
            friction: 28,
            useNativeDriver: false,
          }).start(() => {
            weekSlideNeedsResetRef.current = true;
            setSelectedDay(null);
            setSelectedGridTarget(null);
            setClearArmedDay(null);
            setActiveWeekStart((prev) => addDays(prev, direction * 7));
          });
        } else {
          Animated.spring(weekSlideX, {
            toValue: 0,
            tension: 300,
            friction: 26,
            useNativeDriver: false,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(weekSlideX, {
          toValue: 0,
          tension: 300,
          friction: 26,
          useNativeDriver: false,
        }).start();
      },
    }),
  [weekHeaderPagerWidth, weekSlideX]);

  const animateWeekHeaderNavPress = useCallback((direction: -1 | 1, pressed: boolean) => {
    const scaleAnim = direction < 0 ? prevWeekNavScale : nextWeekNavScale;
    const glowAnim = direction < 0 ? prevWeekNavGlow : nextWeekNavGlow;
    scaleAnim.stopAnimation();
    glowAnim.stopAnimation();
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: pressed ? 0.9 : 1,
        tension: pressed ? 220 : 260,
        friction: pressed ? 11 : 18,
        useNativeDriver: true,
      }),
      Animated.timing(glowAnim, {
        toValue: pressed ? 1 : 0,
        duration: pressed ? 95 : 140,
        easing: pressed ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [nextWeekNavGlow, nextWeekNavScale, prevWeekNavGlow, prevWeekNavScale]);

  const handleWeekHeaderAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      commitWeekShift(1);
      return;
    }
    if (event.nativeEvent.actionName === 'decrement') {
      commitWeekShift(-1);
    }
  }, [commitWeekShift]);

  const lockEditorScroll = useCallback(() => {
    setEditorScrollEnabled(false);
  }, []);

  const unlockEditorScroll = useCallback(() => {
    setEditorScrollEnabled(true);
  }, []);

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
        <View style={[styles.header, manageMode && styles.manageHeaderViewport]}>
          {manageMode ? (
            <View style={styles.manageBackRow}>
              <Pressable
                onPress={handleManageBackToOptions}
                testID="manual-back"
                accessibilityRole="button"
                accessibilityLabel="Back to options"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.manageBackBtn,
                  {
                    backgroundColor: palette.bgSurface,
                    borderColor: palette.borderStrong,
                  },
                  pressed && styles.manageBackBtnPressed,
                ]}
              >
                <AppIcon name="back" size={17} color={palette.textPrimary} />
              </Pressable>
            </View>
          ) : null}
          <ScreenHeader
            title={manageMode ? 'Manage schedule' : 'Set up your schedule'}
            style={[styles.compactScreenHeader, manageMode && styles.manageHeaderTitle]}
          />
          {!manageMode && sourceType === 'import' && importedFilename ? (
            <View style={[styles.icsBadge, { backgroundColor: palette.accentMuted, borderColor: palette.accentBorder }]}>
              <Text variant="bodySmall" style={[styles.icsBadgeText, { color: mintTextOnTint }]} numberOfLines={1}>
                ICS file: {importedFilename}
              </Text>
            </View>
          ) : null}
        </View>
        <ScrollView
          style={styles.editorScroll}
          scrollEnabled={editorScrollEnabled}
          contentContainerStyle={styles.editorScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          stickyHeaderIndices={[1]}
        >
          <View style={[styles.gridToolbar, { borderBottomColor: gridLineSoft }]}>
            <Text
              variant="bodySmall"
              style={[
                styles.gridToolbarHintText,
                {
                  color: palette.textMuted,
                },
              ]}
              numberOfLines={2}
            >
              {slotHintText}
            </Text>
            <Pressable
                onPress={() => handleClearDay()}
                disabled={selectedDay === null || selectedDayVisibleCount === 0}
                testID="manual-clear-day"
                accessibilityState={{ disabled: selectedDay === null || selectedDayVisibleCount === 0 }}
                style={({ pressed }) => [
                  styles.gridToolbarBtn,
                  { borderColor: palette.borderStrong },
                  pressed && { opacity: 0.6 },
                  (selectedDay === null || selectedDayVisibleCount === 0) && { opacity: 0.35 },
                ]}
              >
                <Text variant="bodySmall" style={{ color: palette.textMuted }}>{clearDayLabel}</Text>
              </Pressable>
          </View>

          <View style={[styles.weekHeaderWrap, { borderBottomColor: gridLineSoft, backgroundColor: palette.bgApp }]}>
            <View style={styles.weekHeaderTrackRow}>
              <View
                style={[
                  styles.weekHeaderMonthRail,
                  {
                    width: TIME_COL_WIDTH + GRID_PADDING,
                    borderColor: accentBorderSoft,
                    backgroundColor: accentSurfaceSoft,
                  },
                ]}
              >
                <Pressable
                  onPress={() => commitWeekShift(-1)}
                  onPressIn={() => animateWeekHeaderNavPress(-1, true)}
                  onPressOut={() => animateWeekHeaderNavPress(-1, false)}
                  style={styles.weekHeaderNavBtnPressable}
                  accessibilityLabel="Previous week"
                  hitSlop={6}
                >
                  <Animated.View
                    style={[
                      styles.weekHeaderNavBtn,
                      {
                        backgroundColor: accentSurfaceSoft,
                      },
                    ]}
                  >
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.weekHeaderNavBtnGlow,
                        {
                          backgroundColor: withAlpha(palette.accentPrimary, isDark ? 0.34 : 0.24),
                          opacity: prevWeekNavGlow,
                        },
                      ]}
                    />
                    <Animated.View style={{ transform: [{ rotate: '180deg' }, { scale: prevWeekNavScale }] }}>
                      <AppIcon name="chevronDown" size={11} color={palette.accentPrimary} />
                    </Animated.View>
                  </Animated.View>
                </Pressable>
                <View
                  style={[
                    styles.weekHeaderMonthRailMiddle,
                    {
                      borderTopColor: accentBorderSoft,
                      borderBottomColor: accentBorderSoft,
                    },
                  ]}
                >
                  <Text variant="bodySmall" style={[styles.weekHeaderMonthRailMonthText, { color: palette.accentPrimary }]}>
                    {activeWeekMonthLabel}
                  </Text>
                  <Text variant="bodySmall" style={[styles.weekHeaderMonthRailYearText, { color: palette.accentPrimary }]}>
                    {activeWeekYearLabel}
                  </Text>
                </View>
                <Pressable
                  onPress={() => commitWeekShift(1)}
                  onPressIn={() => animateWeekHeaderNavPress(1, true)}
                  onPressOut={() => animateWeekHeaderNavPress(1, false)}
                  style={styles.weekHeaderNavBtnPressable}
                  accessibilityLabel="Next week"
                  hitSlop={6}
                >
                  <Animated.View
                    style={[
                      styles.weekHeaderNavBtn,
                      {
                        backgroundColor: accentSurfaceSoft,
                      },
                    ]}
                  >
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.weekHeaderNavBtnGlow,
                        {
                          backgroundColor: withAlpha(palette.accentPrimary, isDark ? 0.34 : 0.24),
                          opacity: nextWeekNavGlow,
                        },
                      ]}
                    />
                    <Animated.View style={{ transform: [{ scale: nextWeekNavScale }] }}>
                      <AppIcon name="chevronDown" size={11} color={palette.accentPrimary} />
                    </Animated.View>
                  </Animated.View>
                </Pressable>
              </View>
              <View
                style={[styles.weekHeaderPager, { width: weekHeaderPagerWidth }]}
                accessibilityRole="adjustable"
                accessibilityLabel="Weekly schedule header"
                accessibilityValue={{ text: `Week of ${format(activeWeekDates[0], 'MMMM d, yyyy')}` }}
                accessibilityActions={[
                  { name: 'decrement', label: 'Previous week' },
                  { name: 'increment', label: 'Next week' },
                ]}
                onAccessibilityAction={handleWeekHeaderAccessibilityAction}
                testID="manual-week-header-pager"
                {...weekPanResponder.panHandlers}
              >
                <Animated.View
                  style={[
                    styles.weekHeaderPagerContent,
                    {
                      width: weekGridWidth * 3,
                      transform: [{
                        translateX: weekSlideX.interpolate({
                          inputRange: [-weekHeaderPagerWidth, 0, weekHeaderPagerWidth],
                          outputRange: [-weekHeaderPagerWidth - weekGridWidth, -weekGridWidth, -weekGridWidth + weekHeaderPagerWidth],
                        }),
                      }],
                    },
                  ]}
                >
                  {headerWeekPages.map((page, pageIndex) => {
                    const isCenteredPage = pageIndex === 1;
                    return (
                      <View key={page.key} style={[styles.weekHeaderDaysRow, { width: weekGridWidth }]}>
                        {pageIndex > 0 && (
                          <View
                            style={[
                              styles.weekDivider,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)' },
                            ]}
                            pointerEvents="none"
                          />
                        )}
                        {page.dates.map((date, dayIndex) => {
                          const dateKey = toDateKey(date);
                          const isSelected = isCenteredPage && selectedDay === dayIndex;
                          const isToday = dateKey === todayGridDateKey;
                          const visibleCount = (page.visibleEntriesByDay[dayIndex] ?? []).length;
                          return (
                            <Pressable
                              key={`week-day-${dateKey}`}
                              disabled={!isCenteredPage}
                              onPress={() => {
                                setSelectedDay(dayIndex);
                                setSelectedGridTarget(null);
                                setClearArmedDay(null);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={format(date, 'EEEE, MMMM d, yyyy')}
                              accessibilityState={isCenteredPage ? { selected: isSelected } : undefined}
                              testID={`manual-week-day-${dateKey}`}
                              style={({ pressed }) => [
                                styles.weekHeaderDayCell,
                                {
                                  width: dayColumnWidth,
                                  borderColor: isSelected ? palette.accentPrimary : 'transparent',
                                  backgroundColor: isSelected ? accentSurfaceStrong : 'transparent',
                                },
                                pressed && isCenteredPage && { opacity: 0.82 },
                              ]}
                            >
                              <Text
                                variant="bodySmall"
                                style={[
                                  styles.weekHeaderDayName,
                                  {
                                    color: isSelected ? palette.accentPrimary : (isToday ? palette.textPrimary : palette.textMuted),
                                    fontWeight: isToday ? '700' as any : theme.fontWeight.medium,
                                  },
                                ]}
                              >
                                {DAY_TAB_LABELS[dayIndex]}
                              </Text>
                              <Text
                                variant="body"
                                style={[
                                  styles.weekHeaderDayDate,
                                  {
                                    color: isSelected ? palette.accentPrimary : palette.textPrimary,
                                  },
                                ]}
                              >
                                {format(date, 'd')}
                              </Text>
                              <View style={styles.weekHeaderBadgeSlot}>
                                {visibleCount > 0 && (
                                  <View
                                    style={[
                                      styles.weekHeaderBadge,
                                      {
                                        backgroundColor: isSelected ? palette.accentPrimary : palette.bgSurfaceElevated,
                                      },
                                    ]}
                                  >
                                    <Text
                                      variant="bodySmall"
                                      style={[
                                        styles.weekHeaderBadgeText,
                                        {
                                          color: isSelected ? palette.accentOnSolid : palette.textMuted,
                                        },
                                      ]}
                                    >
                                      {visibleCount}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })}
                </Animated.View>
              </View>
            </View>
          </View>

          {/* Grid: fixed 7 day columns (X) with vertical time axis (Y) */}
            <View style={[styles.gridContainer, { paddingHorizontal: GRID_PADDING }]}>
            <View
              style={[
                styles.gridWrap,
                {
                  backgroundColor: palette.bgSurface,
                  borderColor: gridLineStrong,
                  borderRadius: 12,
                  height: gridViewportHeight,
                },
              ]}
            >
              <ScrollView
                ref={gridScrollRef}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                contentContainerStyle={{ height: gridBodyHeight }}
                style={styles.gridWeekScroll}
                onTouchStart={lockEditorScroll}
                onTouchEnd={unlockEditorScroll}
                onTouchCancel={unlockEditorScroll}
                onScrollBeginDrag={lockEditorScroll}
                onScrollEndDrag={unlockEditorScroll}
                onMomentumScrollEnd={unlockEditorScroll}
                testID="manual-grid-scroll"
              >
                <View style={[styles.gridVerticalRow, { width: gridTrackWidth, height: gridBodyHeight }]}>
                  <View
                    style={[
                      styles.gridTimeAxis,
                      {
                        width: TIME_COL_WIDTH,
                        borderRightColor: gridLineStrong,
                      },
                    ]}
                  >
                    {SLOT_INDICES.map((slotIndex) => (
                      <View
                        key={`time-y-${slotIndex}`}
                        style={[
                          styles.gridTimeAxisSlot,
                          {
                            height: SLOT_HEIGHT,
                            borderBottomColor: gridLineSoft,
                          },
                        ]}
                      >
                        {slotIndex % 2 === 0 ? (
                          <Text variant="bodySmall" style={styles.gridTimeAxisLabel} color={palette.textMuted}>
                            {FULL_HOUR_LABELS[slotIndex / 2]}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  <View style={[styles.gridWeekBody, { width: weekGridWidth, height: gridBodyHeight }]}>
                    {isTodayInActiveWeek && nowRowFloat >= 0 && nowRowFloat < NUM_SLOTS && (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.nowLineHorizontal,
                          {
                            top: nowTop,
                            left: todayDayIndex * dayColumnWidth,
                            width: dayColumnWidth,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.nowLineBarHorizontal,
                            {
                              backgroundColor: nowIndicatorColor,
                              shadowColor: nowIndicatorGlow,
                              shadowOffset: { width: 0, height: 0 },
                              shadowOpacity: isDark ? 0.58 : 0.16,
                              shadowRadius: isDark ? 4 : 2,
                              elevation: isDark ? 6 : 0,
                            },
                          ]}
                        />
                        <View
                          style={[
                            styles.nowDotHorizontal,
                            {
                              left: -4,
                              backgroundColor: nowIndicatorColor,
                              shadowColor: nowIndicatorGlow,
                              shadowOffset: { width: 0, height: 0 },
                              shadowOpacity: isDark ? 0.85 : 0.24,
                              shadowRadius: isDark ? 6 : 3,
                              elevation: isDark ? 8 : 0,
                            },
                          ]}
                        />
                      </View>
                    )}

                    <View style={[styles.gridCellRow, { width: weekGridWidth, height: gridBodyHeight }]}>
                      {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                        const daySlices = displaySlicesByDay[dayIndex] ?? [];
                        return (
                          <View
                            key={`day-col-${dayIndex}`}
                            style={[
                              styles.weekDayColumn,
                              {
                                width: dayColumnWidth,
                                borderRightColor: gridLineStrong,
                                backgroundColor: dayIndex % 2 === 1 ? gridAltBg : undefined,
                              },
                            ]}
                          >
                            {SLOT_INDICES.map((slotIndex) => {
                              const isSelectedEmptyCell =
                                selectedGridTarget?.kind === 'empty' &&
                                selectedGridTarget.dayIndex === dayIndex &&
                                selectedGridTarget.slotIndex === slotIndex;
                              return (
                                <Pressable
                                  key={`cell-touch-v-${dayIndex}-${slotIndex}`}
                                  onPress={() => handleGridCellPress(dayIndex, slotIndex)}
                                  style={({ pressed }) => [
                                    styles.gridCellPressableV,
                                    {
                                      height: SLOT_HEIGHT,
                                      borderBottomColor: slotIndex % 2 === 0 ? gridLineStrong : gridLineSoft,
                                      borderBottomWidth: slotIndex % 2 === 0 ? 1 : StyleSheet.hairlineWidth,
                                      backgroundColor: isSelectedEmptyCell
                                        ? accentSelectedCellBg
                                        : pressed
                                          ? accentPressedCellBg
                                          : 'transparent',
                                    },
                                  ]}
                                />
                              );
                            })}

                            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                              {daySlices.map((slice) => {
                                const bounds = getSliceSlotBounds(slice);
                                const durationMinutes = slice.endMinuteInRow - slice.startMinuteInRow;
                                const isShortEvent = durationMinutes < 30;
                                const isTallEvent = bounds.height >= SLOT_HEIGHT * 3.8;
                                const isSelectedDay = selectedDay !== null && dayIndex === selectedDay;
                                const hasFocusedEventOnDay =
                                  selectedGridTarget?.kind === 'event' && selectedGridTarget.dayIndex === dayIndex;
                                const isSelectedEventTarget =
                                  selectedGridTarget?.kind === 'event' &&
                                  selectedGridTarget.dayIndex === dayIndex &&
                                  selectedGridTarget.eventKey === slice.key;
                                const isPoppingEvent = poppingEventKey === slice.key;
                                const pulseScale = isPoppingEvent
                                  ? eventPopAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1, 1.05],
                                  })
                                  : 1;
                                const startTimeStr = formatTime12(slice.event.startTime);
                                const endTimeStr = formatTime12(slice.event.endTime);
                                return (
                                  <Animated.View
                                    key={slice.key}
                                    style={[
                                      styles.gridEventBlockWrap,
                                      {
                                        top: bounds.top,
                                        left: DAY_COLUMN_GUTTER,
                                        width: dayColumnWidth - DAY_COLUMN_GUTTER * 2,
                                        height: bounds.height,
                                        transform: [{ scale: pulseScale }],
                                      },
                                    ]}
                                  >
                                    <Pressable
                                      onPress={() => handleEventPress(slice, dayIndex)}
                                      style={({ pressed }) => [
                                        styles.gridEventBlockV,
                                        isShortEvent && styles.gridEventBlockVCompact,
                                        isSelectedEventTarget
                                          ? styles.gridEventBlockHTargeted
                                          : (isSelectedDay && !hasFocusedEventOnDay)
                                            ? styles.gridEventBlockHSelected
                                            : styles.gridEventBlockHFaded,
                                        {
                                          backgroundColor: palette.accentPrimary,
                                          borderColor: eventBorderColor,
                                          shadowColor: isSelectedEventTarget || (isSelectedDay && !hasFocusedEventOnDay)
                                            ? palette.accentPrimary
                                            : palette.shadow,
                                        },
                                        pressed && styles.gridEventBlockPressed,
                                      ]}
                                    >
                                      <Text
                                        variant="bodySmall"
                                        style={[styles.gridEventTitleH, isShortEvent && styles.gridEventTitleHCompact, { color: accentSolidText }]}
                                        numberOfLines={isTallEvent ? 3 : 1}
                                        ellipsizeMode="tail"
                                      >
                                        {slice.event.title}
                                      </Text>
                                      {!isShortEvent && (
                                        <>
                                          <Text
                                            variant="bodySmall"
                                            style={[styles.gridEventTimeH, { color: accentSolidTextMuted }]}
                                            numberOfLines={1}
                                          >
                                            {startTimeStr}
                                          </Text>
                                          <Text
                                            variant="bodySmall"
                                            style={[styles.gridEventTimeH, { color: accentSolidTextMuted }]}
                                            numberOfLines={1}
                                          >
                                            {endTimeStr}
                                          </Text>
                                        </>
                                      )}
                                    </Pressable>
                                  </Animated.View>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {slotFeedback && (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.slotFeedbackPulse,
                          {
                            left: slotFeedback.dayIndex * dayColumnWidth + 1,
                            top: slotFeedback.slotIndex * SLOT_HEIGHT + 1,
                            width: dayColumnWidth - 2,
                            height: SLOT_HEIGHT - 2,
                            backgroundColor: accentSlotFeedbackBg,
                            borderColor: accentSlotFeedbackBorder,
                            opacity: slotFeedbackOpacityAnim,
                            transform: [{ scale: slotFeedbackScaleAnim }],
                          },
                        ]}
                      />
                    )}
                    {selectedCellAffordance && (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.selectedCellAffordance,
                          {
                            left: selectedCellAffordance.dayIndex * dayColumnWidth + 1,
                            top: selectedCellAffordance.slotIndex * SLOT_HEIGHT + 1,
                            width: dayColumnWidth - 2,
                            height: SLOT_HEIGHT - 2,
                            opacity: selectedCellOpacityAnim,
                            transform: [{ scale: selectedCellScaleAnim }],
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.selectedCellPlusCircle,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.95)',
                              borderColor: accentBorderSelectedCell,
                            },
                          ]}
                        >
                          <Text variant="body" style={[styles.selectedCellPlusText, { color: palette.accentPrimary }]}>+</Text>
                        </View>
                      </Animated.View>
                    )}
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>

        </ScrollView>

        <View
            style={[
              styles.footer,
              {
                borderTopColor: gridLineSoft,
                backgroundColor: palette.bgApp,
              },
            ]}
          >
          {!!saveError && <Text variant="bodySmall" style={styles.saveError}>{saveError}</Text>}
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
            <TwoActionBar
              secondaryAction={{
                title: 'Change',
                onPress: handleManageChangeSource,
                variant: 'secondary',
                disabled: savingDone,
                testID: 'manual-change-source',
              }}
              primaryAction={{
                title: 'Save',
                onPress: handleDone,
                loading: savingDone,
                disabled: savingDone || !hasManageChanges,
                testID: 'manual-save',
              }}
            />
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
        transparent
        animationType="slide"
        onRequestClose={handleCloseSourceSheet}
        statusBarTranslucent
      >
        <View style={styles.switchSourceModalRoot}>
          <Pressable style={styles.switchSourceBackdrop} onPress={handleCloseSourceSheet} />

          <View
            style={[
              styles.switchSourceSheet,
              {
                backgroundColor: isDark ? palette.bgApp : palette.bgSurfaceElevated,
                borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : palette.borderSoft,
                height: Math.max(460, Math.round(winHeight * 0.62)),
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.switchSourceHeader, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : palette.borderSoft }]}>
              <View style={styles.switchSourceHeaderTop}>
                <Text variant="title" style={styles.switchSourceHeading}>Schedule Source</Text>
                <Pressable
                  style={({ pressed }) => [styles.switchSourceCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }, pressed && { opacity: 0.6 }]}
                  onPress={handleCloseSourceSheet}
                  hitSlop={8}
                  accessibilityLabel="Dismiss"
                >
                  <AppIcon name="close" size={14} color={palette.textMuted} />
                </Pressable>
              </View>
              <Text variant="bodySmall" style={[styles.switchSourceSubtitle, { color: palette.textMuted }]}>
                Choose how you want to provide your weekly schedule.
              </Text>
            </View>

            <ScrollView
              style={styles.switchSourceScrollArea}
              contentContainerStyle={styles.switchSourceScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Manual Entry option */}
              <Pressable
                onPress={() => setSheetSourceType('manual')}
                testID="switch-source-manual"
                style={({ pressed }) => [
                  styles.switchSourceOption,
                  {
                    borderColor: sheetSourceType === 'manual' ? palette.accentPrimary : (isDark ? 'rgba(255,255,255,0.09)' : palette.borderSoft),
                    backgroundColor: sheetSourceType === 'manual'
                      ? accentSourceOptionBg
                      : (isDark ? 'rgba(255,255,255,0.03)' : palette.bgApp),
                  },
                  pressed && { opacity: 0.82 },
                ]}
              >
                <View style={[styles.switchSourceOptionIcon, { backgroundColor: accentSourceIconBg }]}>
                  <AppIcon name="adjust" size={20} color={palette.accentPrimary} />
                </View>
                <View style={styles.switchSourceOptionBody}>
                  <View style={styles.switchSourceCardHeader}>
                    <Text variant="body" style={styles.switchSourceCardTitle}>Manual Entry</Text>
                    {sourceType === 'manual' && (
                      <View style={[styles.switchSourceCurrentTag, { backgroundColor: palette.accentMuted }]}>
                        <Text style={{ color: palette.accentOnTint, fontSize: theme.fontSize.xxs, fontWeight: theme.fontWeight.semibold }}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text variant="bodySmall" style={{ color: palette.textMuted, marginTop: 4, lineHeight: 19 }}>
                    Add events directly to the weekly grid, your way
                  </Text>
                </View>
                <View style={[styles.switchSourceRadio, { borderColor: sheetSourceType === 'manual' ? palette.accentPrimary : (isDark ? 'rgba(255,255,255,0.25)' : palette.borderStrong) }]}>
                  {sheetSourceType === 'manual' && <View style={[styles.switchSourceRadioDot, { backgroundColor: palette.accentPrimary }]} />}
                </View>
              </Pressable>

              {/* Calendar Import option */}
              <Pressable
                onPress={() => setSheetSourceType('import')}
                testID="switch-source-import"
                style={({ pressed }) => [
                  styles.switchSourceOption,
                  {
                    borderColor: sheetSourceType === 'import' ? palette.accentPrimary : (isDark ? 'rgba(255,255,255,0.09)' : palette.borderSoft),
                    backgroundColor: sheetSourceType === 'import'
                      ? accentSourceOptionBg
                      : (isDark ? 'rgba(255,255,255,0.03)' : palette.bgApp),
                  },
                  pressed && { opacity: 0.82 },
                ]}
              >
                <View style={[styles.switchSourceOptionIcon, { backgroundColor: accentSourceIconBg }]}>
                  <AppIcon name="calendar" size={20} color={palette.accentPrimary} />
                </View>
                <View style={styles.switchSourceOptionBody}>
                  <View style={styles.switchSourceCardHeader}>
                    <Text variant="body" style={styles.switchSourceCardTitle}>Calendar Import</Text>
                    {sourceType === 'import' && (
                      <View style={[styles.switchSourceCurrentTag, { backgroundColor: palette.accentMuted }]}>
                        <Text style={{ color: palette.accentOnTint, fontSize: theme.fontSize.xxs, fontWeight: theme.fontWeight.semibold }}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text variant="bodySmall" style={{ color: palette.textMuted, marginTop: 4, lineHeight: 19 }}>
                    Import a .ics file from Google, Apple, or Outlook
                  </Text>

                  {sheetSourceType === 'import' && (
                    <View style={[styles.switchSourceFileBanner, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : palette.borderSoft }]}>
                      <AppIcon name="calendar" size={14} color={sheetResolvedFilename ? palette.accentPrimary : palette.textMuted} />
                      <Text
                        variant="bodySmall"
                        style={{ color: sheetResolvedFilename ? palette.accentPrimary : palette.textMuted, flex: 1, fontWeight: theme.fontWeight.semibold }}
                        numberOfLines={1}
                      >
                        {sheetResolvedFilename || 'No file chosen'}
                      </Text>
                      <Pressable
                        onPress={() => { void handlePickIcsForSourceSheet(); }}
                        disabled={importLoading}
                        style={({ pressed }) => [
                          styles.switchSourceFileBtn,
                          { backgroundColor: palette.accentMuted, borderColor: palette.accentPrimary },
                          pressed && { opacity: 0.7 },
                          importLoading && { opacity: 0.5 },
                        ]}
                      >
                        <Text style={{ color: palette.accentOnTint, fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.xs }}>
                          {sheetResolvedFilename ? 'Change' : 'Choose'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
                <View style={[styles.switchSourceRadio, { borderColor: sheetSourceType === 'import' ? palette.accentPrimary : (isDark ? 'rgba(255,255,255,0.25)' : palette.borderStrong) }]}>
                  {sheetSourceType === 'import' && <View style={[styles.switchSourceRadioDot, { backgroundColor: palette.accentPrimary }]} />}
                </View>
              </Pressable>

              {/* Google Calendar option */}
              <Pressable
                onPress={() => setSheetSourceType('google')}
                testID="switch-source-google"
                style={({ pressed }) => [
                  styles.switchSourceOption,
                  {
                    borderColor: sheetSourceType === 'google' ? palette.accentPrimary : (isDark ? 'rgba(255,255,255,0.09)' : palette.borderSoft),
                    backgroundColor: sheetSourceType === 'google'
                      ? accentSourceOptionBg
                      : (isDark ? 'rgba(255,255,255,0.03)' : palette.bgApp),
                  },
                  pressed && { opacity: 0.82 },
                ]}
              >
                <View style={[styles.switchSourceOptionIcon, { backgroundColor: accentSourceIconBg }]}>
                  <AppIcon name="google" size={20} color={palette.accentPrimary} />
                </View>
                <View style={styles.switchSourceOptionBody}>
                  <View style={styles.switchSourceCardHeader}>
                    <Text variant="body" style={styles.switchSourceCardTitle}>Google Calendar</Text>
                    {sourceType === 'google' && (
                      <View style={[styles.switchSourceCurrentTag, { backgroundColor: palette.accentMuted }]}>
                        <Text style={{ color: palette.accentOnTint, fontSize: theme.fontSize.xxs, fontWeight: theme.fontWeight.semibold }}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text variant="bodySmall" style={{ color: palette.textMuted, marginTop: 4, lineHeight: 19 }}>
                    Sync events directly from your Google account
                  </Text>

                  {sheetSourceType === 'google' && (
                    <View style={[styles.switchSourceFileBanner, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : palette.borderSoft }]}>
                      <AppIcon
                        name="google"
                        size={14}
                        color={sheetImportedTemplate || sourceType === 'google' ? palette.accentPrimary : palette.textMuted}
                      />
                      <Text
                        variant="bodySmall"
                        style={{ color: sheetImportedTemplate || sourceType === 'google' ? palette.accentPrimary : palette.textMuted, flex: 1, fontWeight: theme.fontWeight.semibold }}
                        numberOfLines={1}
                      >
                        {sheetImportedTemplate
                          ? `${Object.values(sheetImportedTemplate).flat().length} events ready`
                          : sourceType === 'google'
                            ? 'Connected'
                            : 'Not connected'}
                      </Text>
                      <Pressable
                        onPress={() => { void startGoogleAuth(); }}
                        disabled={importLoading}
                        style={({ pressed }) => [
                          styles.switchSourceFileBtn,
                          { backgroundColor: palette.accentMuted, borderColor: palette.accentPrimary },
                          pressed && { opacity: 0.7 },
                          importLoading && { opacity: 0.5 },
                        ]}
                      >
                        <Text style={{ color: palette.accentOnTint, fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.xs }}>
                          {sourceType === 'google' ? 'Refresh' : 'Connect'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
                <View style={[styles.switchSourceRadio, { borderColor: sheetSourceType === 'google' ? palette.accentPrimary : (isDark ? 'rgba(255,255,255,0.25)' : palette.borderStrong) }]}>
                  {sheetSourceType === 'google' && <View style={[styles.switchSourceRadioDot, { backgroundColor: palette.accentPrimary }]} />}
                </View>
              </Pressable>

              {importLoading && importStatus && (
                <View style={styles.switchSourceStatusRow}>
                  <ActivityIndicator size="small" color={palette.accentPrimary} />
                  <Text variant="bodySmall" style={{ color: palette.accentPrimary, marginLeft: 8 }}>{importStatus}</Text>
                </View>
              )}
            </ScrollView>

            <View style={[styles.switchSourceFooter, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : palette.borderSoft, backgroundColor: isDark ? palette.bgApp : palette.bgSurfaceElevated }]}>
              {sourceSheetNeedsImportFile && sheetSourceType === 'import' && (
                <Text variant="bodySmall" style={styles.switchSourceWarning}>
                  Choose a calendar export file before saving.
                </Text>
              )}
              {sourceSheetNeedsGoogleConnect && (
                <Text variant="bodySmall" style={styles.switchSourceWarning}>
                  Connect your Google account before applying.
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
                  title="Apply"
                  onPress={handleSaveSourceSheet}
                  style={styles.footerBtn}
                  disabled={importLoading || !sourceSheetHasChanges || sourceSheetNeedsImportFile || sourceSheetNeedsGoogleConnect}
                  testID="switch-source-continue"
                />
              </View>
            </View>
          </View>
        </View>
      </RNModal>

      <AppModal
        visible={showAdd}
        onClose={handleCancelEventModal}
        title={editingEventId ? 'Edit Event' : 'Add Event'}
        rightAccessory={editingEventId ? (
          <TouchableOpacity
            style={[
              styles.modalHeaderIconBtn,
              {
                backgroundColor: palette.bgSurface,
                borderColor: palette.borderSoft,
              },
            ]}
            onPress={confirmDelete}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Delete event"
            testID="manual-schedule-delete-event"
          >
            <AppIcon name="trash" size={17} color={theme.colors.error} />
          </TouchableOpacity>
        ) : null}
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
                  form.repeatMode === 'weekly' && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                ]}
                onPress={() => setRepeatMode('weekly')}
              >
                <Text
                  variant="bodySmall"
                  style={StyleSheet.flatten([
                    styles.freqModeText,
                    form.repeatMode === 'weekly' && styles.freqModeTextActive,
                    form.repeatMode === 'weekly' && { color: palette.accentOnSolid },
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
                  form.repeatMode === 'one_time' && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                ]}
                onPress={() => setRepeatMode('one_time')}
              >
                <Text
                  variant="bodySmall"
                  style={StyleSheet.flatten([
                    styles.freqModeText,
                    form.repeatMode === 'one_time' && styles.freqModeTextActive,
                    form.repeatMode === 'one_time' && { color: palette.accentOnSolid },
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
                    style={[
                      styles.repeatDayChip,
                      themedChip,
                      form.repeatDays.includes(idx) && styles.repeatDayChipActive,
                      form.repeatDays.includes(idx) && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                    ]}
                    onPress={() => toggleRepeatDay(idx)}
                  >
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={StyleSheet.flatten([
                        styles.repeatDayChipText,
                        form.repeatDays.includes(idx) && styles.repeatDayChipTextActive,
                        form.repeatDays.includes(idx) && { color: palette.accentOnSolid },
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
                      onBlurNormalize={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          startHourRaw: value,
                        }))
                      }
                      onAutoComplete={() => startMinuteRef.current?.focus()}
                      placeholder="HH"
                    />
                    <Text variant="body" style={styles.timeDisplaySeparator}>:</Text>
                    <TwoDigitTimeInput
                      mode="minute"
                      inputRef={startMinuteRef}
                      style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
                      value={form.startMinuteRaw}
                      onChange={(value) => setForm((prev) => ({ ...prev, startMinuteRaw: value }))}
                      onBlurNormalize={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          startMinuteRaw: value,
                        }))
                      }
                      placeholder="MM"
                      returnKeyType="done"
                    />
                  </View>
                  <View style={[styles.periodToggleContainer, themedChip]}>
                    {(['AM', 'PM'] as const).map((p) => (
                      <TouchableOpacity
                        key={`start-${p}`}
                        style={[
                          styles.periodBtn,
                          form.startPeriod === p && styles.periodBtnActive,
                          form.startPeriod === p && { backgroundColor: palette.accentPrimary },
                        ]}
                        onPress={() => setForm((prev) => ({ ...prev, startPeriod: p }))}
                      >
                        <Text variant="bodySmall" style={[styles.periodBtnText, { color: form.startPeriod === p ? palette.accentOnSolid : palette.textPrimary }]}>{p}</Text>
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
                      onBlurNormalize={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          endHourRaw: value,
                        }))
                      }
                      onAutoComplete={() => endMinuteRef.current?.focus()}
                      placeholder="HH"
                    />
                    <Text variant="body" style={styles.timeDisplaySeparator}>:</Text>
                    <TwoDigitTimeInput
                      mode="minute"
                      inputRef={endMinuteRef}
                      style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
                      value={form.endMinuteRaw}
                      onChange={(value) => setForm((prev) => ({ ...prev, endMinuteRaw: value }))}
                      onBlurNormalize={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          endMinuteRaw: value,
                        }))
                      }
                      placeholder="MM"
                      returnKeyType="done"
                    />
                  </View>
                  <View style={[styles.periodToggleContainer, themedChip]}>
                    {(['AM', 'PM'] as const).map((p) => (
                      <TouchableOpacity
                        key={`end-${p}`}
                        style={[
                          styles.periodBtn,
                          form.endPeriod === p && styles.periodBtnActive,
                          form.endPeriod === p && { backgroundColor: palette.accentPrimary },
                        ]}
                        onPress={() => setForm((prev) => ({ ...prev, endPeriod: p }))}
                      >
                        <Text variant="bodySmall" style={[styles.periodBtnText, { color: form.endPeriod === p ? palette.accentOnSolid : palette.textPrimary }]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
            {!!timeError && <Text variant="muted" style={styles.timeError}>{timeError}</Text>}
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
              disabled={!canSubmitEvent}
              style={styles.modalActionButton}
            />
          </View>
        </View>
      </AppModal>

      {/* Event Info modal — shown on double-tap of an event.
           Supports read-only view + inline edit mode with crossfade title transition. */}
      <AppModal
        visible={viewOnlyEventInfo !== null}
        onClose={handleEventInfoCancel}
        title={
          <View style={styles.eventInfoCrossfadeTitleRow}>
            <Animated.Text
              style={[styles.eventInfoCrossfadeTitle, { color: palette.textPrimary, opacity: infoTitleFadeOut }]}
            >
              Event Info
            </Animated.Text>
            <Animated.Text
              style={[styles.eventInfoCrossfadeTitle, { color: palette.textPrimary, opacity: infoTitleFadeIn }]}
            >
              Edit Event
            </Animated.Text>
          </View>
        }
        leftAccessory={eventInfoEditMode ? (
          <Animated.View style={{ opacity: infoDeleteIconOpacity }}>
            <TouchableOpacity
              style={[
                styles.modalHeaderIconBtn,
                {
                  backgroundColor: 'rgba(220,38,38,0.12)',
                  borderColor: 'rgba(220,38,38,0.28)',
                },
              ]}
              onPress={handleEventInfoDelete}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Delete event"
            >
              <AppIcon name="trash" size={17} color={theme.colors.error} />
            </TouchableOpacity>
          </Animated.View>
        ) : undefined}
        rightAccessory={
          <TouchableOpacity
            style={[
              styles.modalHeaderIconBtn,
              {
                backgroundColor: 'rgba(220,38,38,0.12)',
                borderColor: 'rgba(220,38,38,0.28)',
              },
            ]}
            onPress={closeEventInfoModal}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <AppIcon name="close" size={17} color={theme.colors.error} />
          </TouchableOpacity>
        }
      >
        {viewOnlyEventInfo && !eventInfoEditMode && (() => {
          /* ── Read-only view ── */
          const { event, dayIndex } = viewOnlyEventInfo;
          const seriesId = !event.isOneTime ? resolveRecurringSeriesId(event.id) : null;
          const seriesDays = seriesId
            ? [0, 1, 2, 3, 4, 5, 6].filter((d) =>
              (entriesByDay[d] ?? []).some(
                (e) => !e.isOneTime && resolveRecurringSeriesId(e.id) === seriesId,
              ),
            )
            : [dayIndex];

          return (
            <View style={styles.mForm}>
              <View style={styles.modalSection}>
                <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Title</Text>
                <TouchableOpacity activeOpacity={1} onPress={() => handleInfoFieldTap('title')}>
                  <View style={[styles.input, themedInput, styles.eventInfoValueBox]}>
                    <Text variant="body" style={{ color: palette.textPrimary }}>{event.title}</Text>
                  </View>
                </TouchableOpacity>
                {tappedInfoField === 'title' && (
                  <Text variant="bodySmall" style={{ color: theme.colors.warning, marginTop: 4 }}>Press Edit to start editing</Text>
                )}
              </View>

              <View style={styles.modalSection}>
                <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Frequency</Text>
                <TouchableOpacity activeOpacity={1} onPress={() => handleInfoFieldTap('frequency')}>
                  <View style={styles.freqModeRow}>
                    <View
                      style={[
                        styles.freqModeChip,
                        themedChip,
                        !event.isOneTime && styles.freqModeChipActive,
                        !event.isOneTime && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                      ]}
                    >
                      <Text variant="bodySmall" style={StyleSheet.flatten([styles.freqModeText, !event.isOneTime && styles.freqModeTextActive, !event.isOneTime && { color: palette.accentOnSolid }])}>
                        Repeats weekly
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.freqModeChip,
                        themedChip,
                        event.isOneTime && styles.freqModeChipActive,
                        event.isOneTime && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                      ]}
                    >
                      <Text variant="bodySmall" style={StyleSheet.flatten([styles.freqModeText, event.isOneTime && styles.freqModeTextActive, event.isOneTime && { color: palette.accentOnSolid }])}>
                        One-time event
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                {tappedInfoField === 'frequency' && (
                  <Text variant="bodySmall" style={{ color: theme.colors.warning, marginTop: 4 }}>Press Edit to start editing</Text>
                )}
              </View>

              {!event.isOneTime ? (
                <View style={styles.modalSection}>
                  <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Days</Text>
                  <TouchableOpacity activeOpacity={1} onPress={() => handleInfoFieldTap('days')}>
                    <View style={styles.repeatDaysRow}>
                      {DAY_TAB_LABELS.map((d, idx) => {
                        const active = seriesDays.includes(idx);
                        return (
                          <View
                            key={d}
                            style={[
                              styles.repeatDayChip,
                              themedChip,
                              active && styles.repeatDayChipActive,
                              active && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                            ]}
                          >
                            <Text variant="bodySmall" numberOfLines={1} style={StyleSheet.flatten([styles.repeatDayChipText, active && styles.repeatDayChipTextActive, active && { color: palette.accentOnSolid }])}>
                              {d}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </TouchableOpacity>
                  {tappedInfoField === 'days' && (
                    <Text variant="bodySmall" style={{ color: theme.colors.warning, marginTop: 4 }}>Press Edit to start editing</Text>
                  )}
                </View>
              ) : (
                <View style={styles.modalSection}>
                  <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Date</Text>
                  <TouchableOpacity activeOpacity={1} onPress={() => handleInfoFieldTap('days')}>
                    <View style={[styles.input, themedInput, styles.eventInfoValueBox]}>
                      <Text variant="body" style={{ color: palette.textPrimary }}>{event.oneTimeDate ?? '—'}</Text>
                    </View>
                  </TouchableOpacity>
                  {tappedInfoField === 'days' && (
                    <Text variant="bodySmall" style={{ color: theme.colors.warning, marginTop: 4 }}>Press Edit to start editing</Text>
                  )}
                </View>
              )}

              <View style={styles.modalSection}>
                <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Time</Text>
                <TouchableOpacity activeOpacity={1} onPress={() => handleInfoFieldTap('time')}>
                  <View style={styles.timeStack}>
                    <View style={[styles.timeCard, themedChip]}>
                      <Text variant="bodySmall" style={styles.timeCardLabel}>Start</Text>
                      <View style={[styles.timeDisplay, themedInput, styles.eventInfoTimeDisplay]}>
                        <Text variant="body" style={{ color: palette.textPrimary, fontFamily: appFontFamily.bold, fontSize: 18 }}>
                          {formatTime12(event.startTime).replace(/ (AM|PM)$/, '')}
                          <Text style={{ fontSize: 14 }}> {formatTime12(event.startTime).match(/(AM|PM)$/)?.[0]}</Text>
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.timeCard, themedChip]}>
                      <Text variant="bodySmall" style={styles.timeCardLabel}>End</Text>
                      <View style={[styles.timeDisplay, themedInput, styles.eventInfoTimeDisplay]}>
                        <Text variant="body" style={{ color: palette.textPrimary, fontFamily: appFontFamily.bold, fontSize: 18 }}>
                          {formatTime12(event.endTime).replace(/ (AM|PM)$/, '')}
                          <Text style={{ fontSize: 14 }}> {formatTime12(event.endTime).match(/(AM|PM)$/)?.[0]}</Text>
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
                {tappedInfoField === 'time' && (
                  <Text variant="bodySmall" style={{ color: theme.colors.warning, marginTop: 4 }}>Press Edit to start editing</Text>
                )}
              </View>

              <View style={styles.modalActionsRow}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={closeEventInfoModal}
                  style={styles.modalActionButton}
                />
                <Button
                  title="Edit"
                  onPress={handleEventInfoEdit}
                  style={styles.modalActionButton}
                />
              </View>
            </View>
          );
        })()}

        {viewOnlyEventInfo && eventInfoEditMode && (() => {
          /* ── Edit mode — editable form fields ── */
          return (
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
                      form.repeatMode === 'weekly' && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                    ]}
                    onPress={() => setRepeatMode('weekly')}
                  >
                    <Text
                      variant="bodySmall"
                      style={StyleSheet.flatten([
                        styles.freqModeText,
                        form.repeatMode === 'weekly' && styles.freqModeTextActive,
                        form.repeatMode === 'weekly' && { color: palette.accentOnSolid },
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
                      form.repeatMode === 'one_time' && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                    ]}
                    onPress={() => setRepeatMode('one_time')}
                  >
                    <Text
                      variant="bodySmall"
                      style={StyleSheet.flatten([
                        styles.freqModeText,
                        form.repeatMode === 'one_time' && styles.freqModeTextActive,
                        form.repeatMode === 'one_time' && { color: palette.accentOnSolid },
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
                        style={[
                          styles.repeatDayChip,
                          themedChip,
                          form.repeatDays.includes(idx) && styles.repeatDayChipActive,
                          form.repeatDays.includes(idx) && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                        ]}
                        onPress={() => toggleRepeatDay(idx)}
                      >
                        <Text
                          variant="bodySmall"
                          numberOfLines={1}
                          style={StyleSheet.flatten([
                            styles.repeatDayChipText,
                            form.repeatDays.includes(idx) && styles.repeatDayChipTextActive,
                            form.repeatDays.includes(idx) && { color: palette.accentOnSolid },
                          ])}
                        >
                          {d}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.modalSection}>
                  <Text variant="bodySmall" style={[styles.modalLabel, { color: palette.textMuted }]}>Date</Text>
                  <View style={styles.dateInputRow}>
                    <TextInput
                      ref={oneTimeMonthRef}
                      style={[styles.input, styles.datePartInput, themedInput]}
                      value={form.oneTimeMonthRaw}
                      onChangeText={(v) => handleOneTimeDateInputChange('oneTimeMonthRaw', v)}
                      onBlur={() => blurOneTimeDateInput('oneTimeMonthRaw', 'month')}
                      placeholder="MM"
                      placeholderTextColor={palette.textMuted}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      underlineColorAndroid="transparent"
                    />
                    <Text variant="body" style={styles.dateSep}>/</Text>
                    <TextInput
                      ref={oneTimeDayRef}
                      style={[styles.input, styles.datePartInput, themedInput]}
                      value={form.oneTimeDayRaw}
                      onChangeText={(v) => handleOneTimeDateInputChange('oneTimeDayRaw', v)}
                      onBlur={() => blurOneTimeDateInput('oneTimeDayRaw', 'day')}
                      placeholder="DD"
                      placeholderTextColor={palette.textMuted}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      underlineColorAndroid="transparent"
                    />
                    <Text variant="body" style={styles.dateSep}>/</Text>
                    <TextInput
                      ref={oneTimeYearRef}
                      style={[styles.input, styles.dateYearInput, themedInput]}
                      value={form.oneTimeYearRaw}
                      onChangeText={(v) => handleOneTimeDateInputChange('oneTimeYearRaw', v)}
                      onBlur={() => blurOneTimeDateInput('oneTimeYearRaw', 'year')}
                      placeholder="YYYY"
                      placeholderTextColor={palette.textMuted}
                      keyboardType="number-pad"
                      maxLength={4}
                      selectTextOnFocus
                      underlineColorAndroid="transparent"
                    />
                  </View>
                  {!!oneTimeDateError && <Text variant="muted" style={styles.timeError}>{oneTimeDateError}</Text>}
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
                          onBlurNormalize={(value) =>
                            setForm((prev) => ({ ...prev, startHourRaw: value }))
                          }
                          onAutoComplete={() => startMinuteRef.current?.focus()}
                          placeholder="HH"
                        />
                        <Text variant="body" style={styles.timeDisplaySeparator}>:</Text>
                        <TwoDigitTimeInput
                          mode="minute"
                          inputRef={startMinuteRef}
                          style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
                          value={form.startMinuteRaw}
                          onChange={(value) => setForm((prev) => ({ ...prev, startMinuteRaw: value }))}
                          onBlurNormalize={(value) =>
                            setForm((prev) => ({ ...prev, startMinuteRaw: value }))
                          }
                          placeholder="MM"
                        />
                      </View>
                      <View style={[styles.periodToggleContainer, themedChip]}>
                        {(['AM', 'PM'] as const).map((p) => (
                          <TouchableOpacity
                            key={`info-start-${p}`}
                            style={[
                              styles.periodBtn,
                              form.startPeriod === p && styles.periodBtnActive,
                              form.startPeriod === p && { backgroundColor: palette.accentPrimary },
                            ]}
                            onPress={() => setForm((prev) => ({ ...prev, startPeriod: p }))}
                          >
                            <Text variant="bodySmall" style={[styles.periodBtnText, { color: form.startPeriod === p ? palette.accentOnSolid : palette.textPrimary }]}>{p}</Text>
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
                          onBlurNormalize={(value) =>
                            setForm((prev) => ({ ...prev, endHourRaw: value }))
                          }
                          onAutoComplete={() => endMinuteRef.current?.focus()}
                          placeholder="HH"
                        />
                        <Text variant="body" style={styles.timeDisplaySeparator}>:</Text>
                        <TwoDigitTimeInput
                          mode="minute"
                          inputRef={endMinuteRef}
                          style={[styles.timeDisplayInput, { color: palette.textPrimary }]}
                          value={form.endMinuteRaw}
                          onChange={(value) => setForm((prev) => ({ ...prev, endMinuteRaw: value }))}
                          onBlurNormalize={(value) =>
                            setForm((prev) => ({ ...prev, endMinuteRaw: value }))
                          }
                          placeholder="MM"
                          returnKeyType="done"
                        />
                      </View>
                      <View style={[styles.periodToggleContainer, themedChip]}>
                        {(['AM', 'PM'] as const).map((p) => (
                          <TouchableOpacity
                            key={`info-end-${p}`}
                            style={[
                              styles.periodBtn,
                              form.endPeriod === p && styles.periodBtnActive,
                              form.endPeriod === p && { backgroundColor: palette.accentPrimary },
                            ]}
                            onPress={() => setForm((prev) => ({ ...prev, endPeriod: p }))}
                          >
                            <Text variant="bodySmall" style={[styles.periodBtnText, { color: form.endPeriod === p ? palette.accentOnSolid : palette.textPrimary }]}>{p}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
                {!!timeError && <Text variant="muted" style={styles.timeError}>{timeError}</Text>}
              </View>

              <View style={styles.modalActionsRow}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={handleEventInfoCancel}
                  style={styles.modalActionButton}
                />
                <Button
                  title="Save"
                  onPress={handleEventInfoSave}
                  disabled={!canSubmitEvent}
                  style={styles.modalActionButton}
                />
              </View>
            </View>
          );
        })()}
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
    paddingTop: 12,
    paddingBottom: 0,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  manageHeaderViewport: {
    maxWidth: '100%',
  },
  compactScreenHeader: {
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 12,
  },
  manageHeaderTitle: {
    marginBottom: 10,
  },
  manageBackRow: {
    alignSelf: 'flex-start',
    marginLeft: 0,
    marginBottom: theme.spacing.sm,
  },
  manageBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBackBtnPressed: {
    transform: [{ translateX: -2 }, { scale: 0.95 }],
    opacity: 0.86,
  },
  viewOnlyBadge: {
    alignSelf: 'flex-start',
    marginBottom: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(234,151,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234,151,0,0.28)',
  },
  viewOnlyBadgeText: {
    fontWeight: theme.fontWeight.medium,
    fontSize: 11,
  },
  icsBadge: {
    alignSelf: 'center',
    maxWidth: '100%',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  icsBadgeText: {
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
    marginTop: -2,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
  },
  sourceInfoText: {
    fontWeight: theme.fontWeight.semibold,
    marginTop: -1,
    letterSpacing: 0.1,
  },
  /* ── Switch Source bottom sheet ── */
  switchSourceModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  switchSourceBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 14, 0.56)',
  },
  switchSourceSheet: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  switchSourceHeader: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  switchSourceHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  switchSourceHeading: {
    fontWeight: theme.fontWeight.bold,
    fontSize: 18,
  },
  switchSourceCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchSourceSubtitle: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  switchSourceScrollArea: {
    flex: 1,
  },
  switchSourceScrollContent: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: 16,
    paddingBottom: theme.spacing.md,
    gap: 12,
  },
  switchSourceOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
  },
  switchSourceOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  switchSourceOptionBody: {
    flex: 1,
  },
  switchSourceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchSourceCardTitle: {
    fontWeight: theme.fontWeight.semibold,
    flex: 1,
    fontSize: 15,
  },
  switchSourceCurrentTag: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  switchSourceFileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  switchSourceFileBtn: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  switchSourceRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 3,
  },
  switchSourceRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  switchSourceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  switchSourceFooter: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  switchSourceWarning: {
    textAlign: 'center',
    color: theme.colors.warning,
    marginBottom: screenChrome.FOOTER_NOTE_MARGIN_TOP,
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
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: GRID_PADDING,
    borderBottomWidth: 1,
    gap: 2,
  },
  weekHeaderTopRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  weekHeaderTrackRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'flex-start',
    width: '100%',
  },
  weekHeaderPager: {
    overflow: 'hidden',
  },
  weekHeaderPagerContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  weekHeaderMonthRail: {
    flexShrink: 0,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderRadius: 0,
    marginLeft: -GRID_PADDING,
    overflow: 'hidden',
  },
  weekHeaderMonthRailMiddle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  weekHeaderMonthRailMonthText: {
    fontSize: 9,
    textAlign: 'center',
    fontWeight: theme.fontWeight.bold,
    lineHeight: 13,
    letterSpacing: 0.1,
    textTransform: 'uppercase',
  },
  weekHeaderMonthRailYearText: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  weekHeaderRangeLabel: {
    textAlign: 'center',
    letterSpacing: 0.3,
    fontWeight: theme.fontWeight.semibold,
  },
  weekHeaderDaysRow: {
    flexDirection: 'row',
    position: 'relative',
  },
  weekDivider: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 1.5,
    borderRadius: 1,
    zIndex: 1,
    opacity: 0.6,
  },
  weekHeaderDayCell: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
  },
  weekHeaderDayCellActive: {
    borderRadius: 8,
  },
  weekHeaderDayName: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  weekHeaderDayDate: {
    fontSize: 15,
    fontWeight: '600' as any,
    marginTop: 0,
  },
  weekHeaderBadgeSlot: {
    marginTop: 2,
    minHeight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekHeaderBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  weekHeaderBadgeText: {
    fontSize: 10,
    fontWeight: '700' as any,
  },
  weekHeaderNavBtnPressable: {
    flex: 1,
    alignSelf: 'stretch',
  },
  weekHeaderNavBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  weekHeaderNavBtnGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  gridToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: GRID_PADDING,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridToolbarHintText: {
    flex: 1,
    marginRight: 8,
  },
  gridToolbarSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '54%',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  gridToolbarSourceBadgeText: {
    fontWeight: theme.fontWeight.medium,
    flexShrink: 1,
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
    paddingTop: 6,
    paddingBottom: GRID_PADDING,
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
  gridWeekScroll: {
    flex: 1,
  },
  gridVerticalRow: {
    flexDirection: 'row',
  },
  gridTimeAxis: {
    borderRightWidth: 1,
  },
  gridTimeAxisSlot: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 2,
    paddingRight: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridTimeAxisLabel: {
    fontSize: 9,
    fontWeight: theme.fontWeight.medium,
    textAlign: 'right',
  },
  gridWeekBody: {
    position: 'relative',
  },
  weekDayColumn: {
    borderRightWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  gridCellPressableV: {
    width: '100%',
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
    borderWidth: 1,
    zIndex: 25,
  },
  nowLineHorizontal: {
    position: 'absolute',
    left: 0,
    height: 8,
    justifyContent: 'center',
    zIndex: 8,
  },
  nowLineBarHorizontal: {
    height: 2,
    width: '100%',
  },
  nowDotHorizontal: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 0,
  },
  selectedCellAffordance: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 26,
  },
  selectedCellPlusCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCellPlusText: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: theme.fontWeight.semibold,
    marginTop: -1,
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
    zIndex: 12,
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6,38,29,0.28)',
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
  gridEventBlockWrap: {
    position: 'absolute',
    zIndex: 12,
  },
  gridEventBlockV: {
    flex: 1,
    backgroundColor: theme.colors.accentPrimary,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 3,
    paddingVertical: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 3,
  },
  gridEventBlockVCompact: {
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  gridEventBlockPressed: {
    opacity: 0.93,
  },
  gridEventBlockHSelected: {
    shadowColor: theme.colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  gridEventBlockHTargeted: {
    shadowColor: theme.colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.74,
    shadowRadius: 9,
    elevation: 7,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  gridEventBlockHFaded: {
    opacity: 0.72,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  gridEventTitleH: {
    color: '#06261d',
    fontWeight: '600' as any,
    fontSize: 9,
    lineHeight: 11,
    includeFontPadding: false,
  },
  gridEventTitleHCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
  gridEventTimeH: {
    color: 'rgba(6,38,29,0.85)',
    fontSize: 8,
    lineHeight: 10,
    marginTop: 1,
    includeFontPadding: false,
  },
  gridEventTimeHCompact: {
    fontSize: 7,
    lineHeight: 9,
    marginTop: 1,
  },
  gridEventDurationH: {
    color: 'rgba(6,38,29,0.72)',
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
    fontWeight: theme.fontWeight.medium,
  },
  nowLineVertical: {
    position: 'absolute',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 2,
    elevation: 0,
  },
  nowLineBarVertical: {
    width: 2,
    flex: 1,
    marginTop: -4,
  },
  gridEventBlock: {
    position: 'absolute',
    zIndex: 12,
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
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  footerActions: {
    flexDirection: 'row',
    gap: screenChrome.FOOTER_BUTTON_GAP,
  },
  footerBtn: {
    flex: 1,
  },
  privacy: { textAlign: 'center', marginTop: screenChrome.FOOTER_NOTE_MARGIN_TOP },
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
    fontFamily: appFontFamily.regular,
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
  timeCardControls: { gap: 8, alignItems: 'center' },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.md,
  },
  timeDisplayInput: {
    minWidth: 36,
    fontFamily: appFontFamily.bold,
    fontSize: 18,
    textAlign: 'center',
  },
  timeDisplaySeparator: {
    fontFamily: appFontFamily.bold,
    fontSize: 18,
  },
  periodBtnText: {
    fontSize: 12,
    fontFamily: appFontFamily.semibold,
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
  periodToggleContainer: { flexDirection: 'row', borderRadius: theme.borderRadius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: theme.colors.bgApp, overflow: 'hidden', alignSelf: 'center' },
  periodBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    paddingVertical: 4,
    paddingHorizontal: 10,
    minWidth: 38,
  },
  periodBtnActive: {},
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
  modalHeaderIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionButton: {
    flex: 1,
  },
  saveError: {
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: 8,
  },
  eventInfoValueBox: {
    justifyContent: 'center',
    minHeight: 40,
    paddingVertical: 8,
  },
  eventInfoTimeDisplay: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingVertical: 8,
  },
  eventInfoCrossfadeTitleRow: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    width: '100%',
  },
  eventInfoCrossfadeTitle: {
    position: 'absolute',
    fontFamily: appFontFamily.bold,
    fontSize: theme.fontSize.lg,
    textAlign: 'center',
  },
});
