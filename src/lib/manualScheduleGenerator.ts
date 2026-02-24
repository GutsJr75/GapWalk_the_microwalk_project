import { ManualScheduleEntry, BusyEvent } from './types';
import { addDays, setHours, setMinutes, startOfDay, startOfWeek } from 'date-fns';

/**
 * Generate BusyEvent instances from a weekly template of ManualScheduleEntries
 * @param entries - Array of manual schedule entries (weekly template)
 * @param weeksAhead - Number of weeks to generate events for (default 4)
 * @returns Array of BusyEvent objects
 */
export const generateBusyEventsFromTemplate = (
  entries: ManualScheduleEntry[],
  weeksAhead = 4
): BusyEvent[] => {
  const events: BusyEvent[] = [];
  const today = startOfDay(new Date());
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
  const rangeEnd = addDays(today, weeksAhead * 7);

  const isOvernight = (startH: number, startM: number, endH: number, endM: number) =>
    endH < startH || (endH === startH && endM <= startM);

  for (const entry of entries) {
    if (!entry.isOneTime || !entry.oneTimeDate) continue;
    const eventDate = new Date(`${entry.oneTimeDate}T00:00:00`);
    if (Number.isNaN(eventDate.getTime())) continue;
    const normalizedDate = startOfDay(eventDate);
    if (normalizedDate < today || normalizedDate >= rangeEnd) continue;
    const [startHour, startMin] = entry.startTime.split(':').map(Number);
    const [endHour, endMin] = entry.endTime.split(':').map(Number);
    const start = setMinutes(setHours(normalizedDate, startHour), startMin);
    let end = setMinutes(setHours(normalizedDate, endHour), endMin);
    if (isOvernight(startHour, startMin, endHour, endMin)) {
      end = addDays(end, 1);
    }
    events.push({
      id: `manual-once-${entry.id}-${entry.oneTimeDate}`,
      title: entry.title,
      start: start.toISOString(),
      end: end.toISOString(),
      source: 'manual',
      isAllDay: false,
      createdAt: new Date().toISOString(),
    });
  }

  for (let week = 0; week < weeksAhead; week++) {
    for (const entry of entries) {
      if (entry.isOneTime) continue;
      const eventDate = addDays(currentWeekStart, week * 7 + entry.dayOfWeek);
      const [startHour, startMin] = entry.startTime.split(':').map(Number);
      const [endHour, endMin] = entry.endTime.split(':').map(Number);

      const start = setMinutes(setHours(eventDate, startHour), startMin);
      let end = setMinutes(setHours(eventDate, endHour), endMin);
      if (isOvernight(startHour, startMin, endHour, endMin)) {
        end = addDays(end, 1);
      }

      events.push({
        id: `manual-event-${entry.id}-week${week}`,
        title: entry.title,
        start: start.toISOString(),
        end: end.toISOString(),
        source: 'manual',
        isAllDay: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return events;
};

/**
 * Regenerate events from stored manual schedule template
 * Useful when the week rolls over and we need to extend the template
 */
export const shouldRegenerateManualEvents = (lastGenerated: Date): boolean => {
  const now = new Date();
  const daysSinceGenerated = (now.getTime() - lastGenerated.getTime()) / (1000 * 60 * 60 * 24);
  
  // Regenerate if it's been more than 7 days
  return daysSinceGenerated > 7;
};
