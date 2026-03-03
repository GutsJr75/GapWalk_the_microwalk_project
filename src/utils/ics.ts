import ICAL from 'ical.js';
import { BusyEvent, ManualScheduleEntry } from '../types';

export interface ICSParseResult {
  events: BusyEvent[];
  errors: string[];
}

export const parseICSFile = async (fileContent: string): Promise<ICSParseResult> => {
  const errors: string[] = [];
  const events: BusyEvent[] = [];
  
  try {
    const jcalData = ICAL.parse(fileContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    for (const vevent of vevents) {
      try {
        const event = new ICAL.Event(vevent);
        
        // Skip if no start time
        if (!event.startDate) {
          continue;
        }
        
        const id = event.uid || `ics-${Date.now()}-${Math.random()}`;
        const title = event.summary || 'Busy';
        const isAllDay = event.startDate.isDate;
        
        // Get start and end times
        let start: Date;
        let end: Date;
        
        if (isAllDay) {
          start = event.startDate.toJSDate();
          if (event.endDate) {
            end = event.endDate.toJSDate();
          } else {
            // All-day event without end, assume 1 day
            end = new Date(start);
            end.setDate(end.getDate() + 1);
          }
        } else {
          start = event.startDate.toJSDate();
          if (event.endDate) {
            end = event.endDate.toJSDate();
          } else if (event.duration) {
            end = new Date(start.getTime() + event.duration.toSeconds() * 1000);
          } else {
            // No end time, assume 1 hour
            end = new Date(start.getTime() + 60 * 60 * 1000);
          }
        }
        
        events.push({
          id,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          source: 'ics',
          isAllDay,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        errors.push(`Failed to parse event: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    return { events, errors };
  } catch (err) {
    return {
      events: [],
      errors: [`Failed to parse ICS file: ${err instanceof Error ? err.message : 'Unknown error'}`],
    };
  }
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Convert imported ICS events into a weekly template used by the schedule grid.
 * Duplicates (same day/title/time) are removed.
 */
export const buildWeeklyTemplateFromIcsEvents = (events: BusyEvent[], idPrefix = 'ics'): ManualScheduleEntry[] => {
  const seen = new Set<string>();
  const template: ManualScheduleEntry[] = [];

  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    // Skip invalid or zero/negative spans.
    if (end.getTime() <= start.getTime()) continue;

    const dayOfWeek = start.getDay();
    const startTime = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
    const endTime = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
    const title = (event.title || 'Busy').trim();

    const dedupeKey = `${dayOfWeek}|${startTime}|${endTime}|${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    template.push({
      id: `${idPrefix}-${dayOfWeek}-${startTime}-${endTime}-${template.length}`,
      title,
      dayOfWeek,
      startTime,
      endTime,
    });
  }

  return template.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.endTime.localeCompare(b.endTime);
  });
};
