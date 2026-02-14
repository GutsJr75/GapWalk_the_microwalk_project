import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  StyleProp,
  TextStyle,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { ManualScheduleEntry } from '../lib/types';
import { manualScheduleRepo } from '../lib/repositories/manualScheduleRepo';
import { eventsRepo } from '../lib/repositories/eventsRepo';
import { plansRepo } from '../lib/repositories/plansRepo';
import { scheduleSourceRepo } from '../lib/repositories/scheduleSourceRepo';
import { syncNudgePlansForCurrentSchedule } from '../lib/scheduleSync';
import { useAppStore } from '../store';
import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';
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

const onlyDigits = (value: string): string => value.replace(/[^0-9]/g, '').slice(0, 2);

const normalizeHourTyping = (nextText: string): string => {
  const digits = onlyDigits(nextText);
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
  const digits = onlyDigits(nextText);
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

const createEmptyEntriesByDay = (): Record<number, TemplateEvent[]> => ({
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
});

const buildScheduleSignature = (entriesByDay: Record<number, TemplateEvent[]>): string => {
  const normalized = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const items = [...(entriesByDay[day] ?? [])]
      .map((e) => ({ title: e.title.trim(), startTime: e.startTime, endTime: e.endTime }))
      .sort((a, b) => {
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
  const usingIcsTemplate = !!importedFilename;
  const [entriesByDay, setEntriesByDay] = useState<Record<number, TemplateEvent[]>>(createEmptyEntriesByDay());
  const [initialSignature, setInitialSignature] = useState<string>(buildScheduleSignature(createEmptyEntriesByDay()));
  const [showAdd, setShowAdd] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [savingDone, setSavingDone] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [form, setForm] = useState({
    title: '',
    dayOfWeek: todayIndex,
    repeatDays: [todayIndex] as number[],
    startHourRaw: '09',
    startMinuteRaw: '00',
    startPeriod: 'AM' as 'AM' | 'PM',
    endHourRaw: '10',
    endMinuteRaw: '00',
    endPeriod: 'AM' as 'AM' | 'PM',
    description: '',
  });
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const gridScrollRef = useRef<ScrollView>(null);
  const { setScheduleSource, setUpcomingPlans, preferences, themeMode } = useAppStore();

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadSavedTemplate = async () => {
        try {
          const saved = await manualScheduleRepo.getAll();
          const grouped = createEmptyEntriesByDay();
          if (saved.length > 0) {
            for (const entry of saved) {
              if (entry.dayOfWeek < 0 || entry.dayOfWeek > 6) continue;
              grouped[entry.dayOfWeek] = [
                ...grouped[entry.dayOfWeek],
                {
                  id: entry.id,
                  title: entry.title,
                  startTime: entry.startTime,
                  endTime: entry.endTime,
                },
              ];
            }
          }
          if (!active) return;
          setEntriesByDay(grouped);
          setInitialSignature(buildScheduleSignature(grouped));
        } catch (error) {
          if (!active) return;
          const empty = createEmptyEntriesByDay();
          setEntriesByDay(empty);
          setInitialSignature(buildScheduleSignature(empty));
          console.error('Failed to load saved manual schedule:', error);
        }
      };
      void loadSavedTemplate();
      return () => {
        active = false;
      };
    }, [])
  );

  const currentSignature = useMemo(() => buildScheduleSignature(entriesByDay), [entriesByDay]);
  const hasUnsavedChanges = currentSignature !== initialSignature;

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
    if (!hasUnsavedChanges) {
      onDiscard();
      return;
    }
    const message = 'Discard unsaved schedule changes?';
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
        navigation.navigate('ScheduleOverview');
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
  const canAdd = hasTitle && isRangeValid;
  const timeError = !hasValidTimes
    ? 'Enter a valid start and end time.'
    : !isRangeValid
      ? 'End time must be after start time.'
      : '';

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
    setEditingEventId(null);
    setForm({
      title: '',
      dayOfWeek: dayIndex,
      repeatDays: [dayIndex],
      startHourRaw: String(sh).padStart(2, '0'),
      startMinuteRaw: String(sm).padStart(2, '0'),
      startPeriod,
      endHourRaw: String(eh).padStart(2, '0'),
      endMinuteRaw: String(em).padStart(2, '0'),
      endPeriod,
      description: '',
    });
    setShowAdd(true);
  };

  const openModalFromEvent = (event: TemplateEvent, dayIndex: number) => {
    const startMin = hhmmToMinutes(event.startTime);
    const endMin = hhmmToMinutes(event.endTime);
    const sh = Math.floor(startMin / 60) % 12 || 12;
    const eh = Math.floor(endMin / 60) % 12 || 12;
    setEditingEventId(event.id);
    setForm({
      title: event.title,
      dayOfWeek: dayIndex,
      repeatDays: [dayIndex],
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
    if (editingEventId) {
      const id = editingEventId;
      const daysToUpdate = form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek];
      setEntriesByDay((prev) => {
        const next = { ...prev };
        for (const d of [0, 1, 2, 3, 4, 5, 6]) {
          next[d] = (next[d] ?? []).filter((e) => e.id !== id);
        }
        for (let i = 0; i < daysToUpdate.length; i++) {
          const d = daysToUpdate[i];
          const eventId = i === 0 ? id : `${id}-dup-${i}`;
          const event: TemplateEvent = { id: eventId, title, startTime: start, endTime: end };
          next[d] = [...(next[d] ?? []), event];
        }
        return next;
      });
    } else {
      const daysToAdd = form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek];
      setEntriesByDay((prev) => {
        const next = { ...prev };
        const baseId = `m-${Date.now()}`;
        for (let i = 0; i < daysToAdd.length; i++) {
          const d = daysToAdd[i];
          const event: TemplateEvent = {
            id: `${baseId}-${i}`,
            title,
            startTime: start,
            endTime: end,
          };
          next[d] = [...(next[d] ?? []), event];
        }
        return next;
      });
    }
    setShowAdd(false);
    setEditingEventId(null);
    setForm({
      title: '',
      dayOfWeek: todayIndex,
      repeatDays: [todayIndex],
      startHourRaw: '09',
      startMinuteRaw: '00',
      startPeriod: 'AM',
      endHourRaw: '10',
      endMinuteRaw: '00',
      endPeriod: 'AM',
      description: '',
    });
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
      [...arr].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((e) => ({
        id: e.id,
        title: e.title,
        dayOfWeek: Number(day),
        startTime: e.startTime,
        endTime: e.endTime,
      }))
    );

    const eventSource: 'ics' | 'manual' = usingIcsTemplate ? 'ics' : 'manual';
    const base = startOfDay(new Date());
    const events = Array.from({ length: 14 }, (_, offset) => {
      const date = addDays(base, offset);
      const dayIndex = date.getDay();
      const dayEvents = entriesByDay[dayIndex] ?? [];
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

        setInitialSignature(currentSignature);
        setSavingDone(false);

        if (manageMode) {
          showMessage(
            'Schedule saved',
            'Your schedule was updated and walking opportunities were synced.',
            exitManualScreen
          );
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
    if (manageMode && !hasUnsavedChanges) {
      showMessage(
        'No changes',
        'No changes were detected. Your existing imported schedule is already active.',
        exitManualScreen
      );
      return;
    }

    const message = 'Save this schedule and refresh walking opportunities?';
    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm(message);
      if (ok) {
        void performSave();
      }
      return;
    }

    Alert.alert(
      'Save schedule?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => { void performSave(); } },
      ]
    );
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

  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const gridBodyMaxHeight = Math.max(320, winHeight - 220);
  const selectedDayEvents = entriesByDaySorted[selectedDay] ?? [];
  const palette = getThemePalette(themeMode);
  const isDark = themeMode === 'dark';
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.8}>
            <Text variant="bodySmall" style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text variant="title" style={styles.title}>{manageMode ? 'Update your schedule' : 'Set up your schedule'}</Text>
        <Text variant="muted" style={styles.sub}>
          {manageMode ? 'Edit and save to refresh walking opportunities.' : 'Build your weekly schedule'}
        </Text>
        {usingIcsTemplate && (
          <View style={styles.icsBadge}>
            <Text variant="bodySmall" style={styles.icsBadgeText} numberOfLines={1}>
              ICS file: {importedFilename}
            </Text>
          </View>
        )}
      </View>

      {/* Day tabs (Google Calendar style: select one day) */}
      <View style={[styles.dayTabsWrap, { borderBottomColor: gridLineSoft }]}>
        {DAY_TAB_LABELS.map((d, idx) => {
          const active = idx === selectedDay;
          return (
            <TouchableOpacity
              key={d}
              style={[styles.dayTab, active && styles.dayTabActive]}
              onPress={() => setSelectedDay(idx)}
              activeOpacity={0.8}
            >
              <Text variant="bodySmall" style={StyleSheet.flatten([styles.dayTabText, active && styles.dayTabTextActive])}>{d}</Text>
            </TouchableOpacity>
          );
        })}
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
                      <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.gridTimeLabel}>
                        {FULL_HOUR_LABELS[idx / 2]}
                      </Text>
                    ) : (
                      <View style={[styles.gridTimeHalfLine, { borderTopColor: gridLineSoft }]} />
                    )}
                  </View>
                ))}
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
                  {selectedDayEvents.map((ev) => {
                    const startMin = hhmmToMinutes(ev.startTime);
                    let endMin = hhmmToMinutes(ev.endTime);
                    if (endMin <= startMin) endMin += 24 * 60;
                    const top = Math.max(0, (startMin - GRID_START_MIN) / SLOT_MINUTES * SLOT_HEIGHT);
                    const spanMin = Math.min(endMin - startMin, GRID_END_MIN - startMin);
                    const height = Math.max(SLOT_HEIGHT / 2, (spanMin / SLOT_MINUTES) * SLOT_HEIGHT);
                    const maxHeight = GRID_BODY_HEIGHT - top;
                    const finalHeight = Math.min(height, maxHeight);
                    const titleFontSize = Math.round(Math.min(16, Math.max(11, finalHeight * 0.20)));
                    const timeFontSize = Math.round(titleFontSize * 0.82);
                    const paddingV = Math.min(10, Math.max(4, Math.floor(finalHeight * 0.08)));
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        style={[styles.gridEventBlock, { top, height: finalHeight, paddingVertical: paddingV, borderColor: eventBorderColor }]}
                        onPress={() => openModalFromEvent(ev, selectedDay)}
                        activeOpacity={0.9}
                      >
                        <Text numberOfLines={finalHeight < 80 ? 1 : 2} style={StyleSheet.flatten([styles.gridEventTitle, { fontSize: titleFontSize }])}>{ev.title}</Text>
                        <Text numberOfLines={1} style={StyleSheet.flatten([styles.gridEventTime, { fontSize: timeFontSize }])}>
                          {formatTime12(ev.startTime)} - {formatTime12(ev.endTime)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      <View style={[styles.footer, { paddingHorizontal: GRID_PADDING }]}>
        {!!saveError && <Text variant="muted" style={styles.saveError}>{saveError}</Text>}
        {manageMode ? (
          <View style={styles.footerActions}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={handleBack}
              style={styles.footerBtn}
              disabled={savingDone}
            />
            <Button
              title="Save"
              onPress={handleDone}
              style={styles.footerBtn}
              loading={savingDone}
              disabled={savingDone}
            />
          </View>
        ) : (
          <Button title="Done" onPress={handleDone} full loading={savingDone} disabled={savingDone} />
        )}
        <Text variant="muted" style={styles.privacy}>Your schedule stays private. Privacy is our utmost importance.</Text>
      </View>

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

          <Text variant="muted">Days (select one or more)</Text>
          <View style={styles.repeatDaysRow}>
            {DAY_TAB_LABELS.map((d, idx) => (
              <TouchableOpacity
                key={d}
                style={[styles.repeatDayChip, themedChip, form.repeatDays.includes(idx) && styles.repeatDayChipActive]}
                onPress={() => toggleRepeatDay(idx)}
              >
                <Text variant="bodySmall" style={StyleSheet.flatten([styles.repeatDayChipText, form.repeatDays.includes(idx) && styles.repeatDayChipTextActive])}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text variant="muted" style={styles.repeatHint}>
            {editingEventId ? 'Tap days to add or remove this event. At least one day must be selected.' : 'Select all days you want this event. Tap a day to toggle.'}
          </Text>

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bgApp },
  header: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  headerTopRow: {
    width: '100%',
    marginBottom: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginLeft: -32,
  },
  backText: {
    color: theme.colors.textMuted,
    fontWeight: theme.fontWeight.semibold,
  },
  title: {
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  sub: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
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
    borderRadius: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  gridEventTitle: {
    color: theme.colors.bgApp,
    fontWeight: theme.fontWeight.bold,
  },
  gridEventTime: {
    color: 'rgba(0,0,0,0.72)',
    marginTop: 2,
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
    padding: 10,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
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
