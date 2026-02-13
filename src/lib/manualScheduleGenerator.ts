import { ManualScheduleEntry, BusyEvent } from './types';
import { addDays, setHours, setMinutes, startOfWeek, format } from 'date-fns';

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
  const today = new Date();
  const currentWeekStart = startOfWeek(today);

  for (let week = 0; week < weeksAhead; week++) {
    for (const entry of entries) {
      const eventDate = addDays(currentWeekStart, week * 7 + entry.dayOfWeek);
      const [startHour, startMin] = entry.startTime.split(':').map(Number);
      const [endHour, endMin] = entry.endTime.split(':').map(Number);

      const start = setMinutes(setHours(eventDate, startHour), startMin);
      const end = setMinutes(setHours(eventDate, endHour), endMin);

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
