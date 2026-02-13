import { 
  startOfDay, 
  endOfDay, 
  addMinutes, 
  parseISO, 
  format,
  isAfter,
  isBefore,
  isWithinInterval,
} from 'date-fns';
import { BusyEvent, Preferences, NudgePlan } from './types';
import { timeUtils } from './time';

interface TimeInterval {
  start: Date;
  end: Date;
}

interface GapOpportunity {
  gapStart: Date;
  gapEnd: Date;
  durationMinutes: number;
  score: number;
}

export const gapEngine = {
  /**
   * Generate nudge plans for a specific date.
   * Respects grace period and notification timing preferences.
   */
  async generatePlansForDate(
    date: Date,
    events: BusyEvent[],
    prefs: Preferences
  ): Promise<NudgePlan[]> {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    const dayEvents = events.filter(event => {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);
      return (
        (isWithinInterval(eventStart, { start: dayStart, end: dayEnd }) ||
         isWithinInterval(eventEnd, { start: dayStart, end: dayEnd }) ||
         (isBefore(eventStart, dayStart) && isAfter(eventEnd, dayEnd)))
      );
    });
    
    const gaps = this.findGaps(dayStart, dayEnd, dayEvents, prefs);
    const opportunities = gaps.map(gap => this.scoreGap(gap, date));
    opportunities.sort((a, b) => b.score - a.score);
    const selectedOpportunities = opportunities.slice(0, prefs.notificationCountPerDay);

    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const notifyDelay = prefs.whenToNotify === 'delay' ? (prefs.notifyDelayMinutes ?? 5) : 0;

    return selectedOpportunities.map(opp => {
      // Walk timer starts after buffer + grace period
      const walkStart = addMinutes(opp.gapStart, prefs.bufferMinutes + gracePeriod);
      // Available walk time = gap duration minus buffer minus grace period
      const availableMinutes = opp.durationMinutes - prefs.bufferMinutes - gracePeriod;
      const suggestedDuration = Math.min(
        Math.max(availableMinutes, 0),
        15 // Cap at 15 minutes for micro-walks
      );

      return {
        id: `plan-${date.getTime()}-${Math.random().toString(36).substr(2, 9)}`,
        date: format(date, 'yyyy-MM-dd'),
        gapStart: opp.gapStart.toISOString(),
        gapEnd: opp.gapEnd.toISOString(),
        walkStart: walkStart.toISOString(),
        suggestedDurationMinutes: suggestedDuration,
        status: 'planned' as const,
        createdAt: new Date().toISOString(),
      };
    });
  },
  
  /**
   * Find free gaps in a day
   */
  findGaps(
    dayStart: Date,
    dayEnd: Date,
    events: BusyEvent[],
    prefs: Preferences
  ): TimeInterval[] {
    const timedEvents = events.filter(e => !e.isAllDay);
    
    const busyIntervals: TimeInterval[] = timedEvents
      .map(event => ({
        start: parseISO(event.start),
        end: parseISO(event.end),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    
    const merged = this.mergeIntervals(busyIntervals);
    
    const gaps: TimeInterval[] = [];
    let currentTime = dayStart;
    
    for (const busy of merged) {
      if (isBefore(currentTime, busy.start)) {
        const gap = { start: currentTime, end: busy.start };
        if (this.isValidGap(gap, prefs)) {
          gaps.push(gap);
        }
      }
      currentTime = isAfter(busy.end, currentTime) ? busy.end : currentTime;
    }
    
    if (isBefore(currentTime, dayEnd)) {
      const gap = { start: currentTime, end: dayEnd };
      if (this.isValidGap(gap, prefs)) {
        gaps.push(gap);
      }
    }
    
    return gaps;
  },
  
  /**
   * Merge overlapping time intervals
   */
  mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (intervals.length === 0) return [];
    
    const merged: TimeInterval[] = [];
    let current = intervals[0];
    
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i];
      
      if (isBefore(next.start, current.end) || next.start.getTime() === current.end.getTime()) {
        current = {
          start: current.start,
          end: isAfter(next.end, current.end) ? next.end : current.end,
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current);
    return merged;
  },
  
  /**
   * Check if a gap is valid (not in quiet hours, meets minimum duration)
   */
  isValidGap(gap: TimeInterval, prefs: Preferences): boolean {
    const durationMinutes = (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const requiredMinutes = prefs.bufferMinutes + gracePeriod + prefs.minWalkMinutes;
    if (durationMinutes < requiredMinutes) {
      return false;
    }
    
    const walkStart = addMinutes(gap.start, prefs.bufferMinutes);
    if (timeUtils.isInQuietHours(walkStart, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }
    
    return true;
  },
  
  /**
   * Score a gap opportunity (higher score = better)
   */
  scoreGap(gap: TimeInterval, date: Date): GapOpportunity {
    const durationMinutes = (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
    
    let score = 0;
    const idealMin = 8;
    const idealMax = 15;
    
    if (durationMinutes >= idealMin && durationMinutes <= idealMax) {
      score += 100;
    } else if (durationMinutes < idealMin) {
      score += 50 + (durationMinutes / idealMin) * 50;
    } else {
      score += 80;
    }
    
    const hourOfDay = gap.start.getHours();
    if (hourOfDay >= 8 && hourOfDay <= 17) score += 20;
    if (hourOfDay >= 11 && hourOfDay <= 14) score += 10;
    
    return {
      gapStart: gap.start,
      gapEnd: gap.end,
      durationMinutes,
      score,
    };
  },
};
