import {
  addMinutes,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isWithinInterval,
  parseISO,
  startOfDay,
} from 'date-fns';
import { BusyEvent, NudgePlan, Preferences } from './types';
import { timeUtils } from './time';

interface TimeInterval {
  start: Date;
  end: Date;
}

interface GapOpportunity {
  id: string;
  gapStart: Date;
  gapEnd: Date;
  durationMinutes: number;
  availableWalkMinutes: number;
  maxNotifications: number;
  score: number;
}

interface GapSlot {
  opportunityId: string;
  gapStart: Date;
  gapEnd: Date;
  walkStart: Date;
  slotCapacityMinutes: number;
  score: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sameDateKey = (a: Date, b: Date): boolean =>
  format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');

export const gapEngine = {
  /**
   * Generate nudge plans for a specific date.
   * Uses tiered gap caps + reminder spacing to avoid over-notifying.
   */
  async generatePlansForDate(
    date: Date,
    events: BusyEvent[],
    prefs: Preferences
  ): Promise<NudgePlan[]> {
    if (prefs.dailyTargetMinutes <= 0 || prefs.notificationCountPerDay <= 0) {
      return [];
    }

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const now = new Date();
    const isToday = sameDateKey(date, now);

    const dayEvents = events.filter((event) => {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);
      return (
        isWithinInterval(eventStart, { start: dayStart, end: dayEnd }) ||
        isWithinInterval(eventEnd, { start: dayStart, end: dayEnd }) ||
        (isBefore(eventStart, dayStart) && isAfter(eventEnd, dayEnd))
      );
    });

    const rawGaps = this.findGaps(dayStart, dayEnd, dayEvents, prefs);
    const candidateGaps = rawGaps
      .map((gap) => {
        if (!isToday) return gap;
        const start = isAfter(now, gap.start) ? now : gap.start;
        return isBefore(start, gap.end) ? { start, end: gap.end } : null;
      })
      .filter((gap): gap is TimeInterval => !!gap);

    const minReminderGapMinutes = clamp(
      prefs.notificationMinGapMinutes ?? 60,
      30,
      360
    );

    const opportunities = candidateGaps
      .map((gap) => this.scoreGap(gap, prefs, minReminderGapMinutes))
      .filter((opp) => opp.maxNotifications > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.gapStart.getTime() - b.gapStart.getTime();
      });

    if (opportunities.length === 0) return [];

    // Sustainability guard: avoid too many tiny sessions for a small target.
    const targetBasedMaxNotifications = Math.max(
      1,
      Math.floor(Math.max(1, prefs.dailyTargetMinutes) / Math.max(1, prefs.minWalkMinutes))
    );
    const notificationBudget = Math.max(
      1,
      Math.min(prefs.notificationCountPerDay, targetBasedMaxNotifications)
    );

    const selectedGapCounts = this.selectGapNotificationCounts(
      opportunities,
      notificationBudget
    );
    if (selectedGapCounts.length === 0) return [];

    const slots = selectedGapCounts
      .flatMap(({ opportunity, count }) =>
        this.buildSlotsForGap(opportunity, count, prefs, minReminderGapMinutes)
      )
      .sort((a, b) => a.walkStart.getTime() - b.walkStart.getTime());

    if (slots.length === 0) return [];

    const distributedDurations = this.distributeDurations(
      prefs.dailyTargetMinutes,
      slots.map((slot) => slot.slotCapacityMinutes),
      prefs.minWalkMinutes
    );

    const plans = slots.map((slot, idx) => ({
      id: `plan-${date.getTime()}-${Math.random().toString(36).slice(2, 11)}`,
      date: format(date, 'yyyy-MM-dd'),
      gapStart: slot.gapStart.toISOString(),
      gapEnd: slot.gapEnd.toISOString(),
      walkStart: slot.walkStart.toISOString(),
      suggestedDurationMinutes: Math.max(1, distributedDurations[idx] ?? prefs.minWalkMinutes),
      status: 'planned' as const,
      createdAt: new Date().toISOString(),
    }));

    if (!isToday) {
      return plans;
    }

    return plans.filter((plan) => isAfter(parseISO(plan.walkStart), now));
  },

  /**
   * Find free gaps in a day.
   */
  findGaps(
    dayStart: Date,
    dayEnd: Date,
    events: BusyEvent[],
    prefs: Preferences
  ): TimeInterval[] {
    const timedEvents = events.filter((e) => !e.isAllDay);

    const eventBusyIntervals: TimeInterval[] = timedEvents
      .map((event) => ({
        start: parseISO(event.start),
        end: parseISO(event.end),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    // Treat quiet hours as blocked time so we never generate plans inside them.
    const quietIntervals = this.expandTimeRangeForDay(dayStart, prefs.quietHoursStart, prefs.quietHoursEnd);
    const busyIntervals = [...eventBusyIntervals, ...quietIntervals]
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
   * Expand an HH:mm-HH:mm range into concrete intervals for a specific day.
   * Handles overnight ranges by splitting into two intervals.
   */
  expandTimeRangeForDay(dayStart: Date, startTime: string, endTime: string): TimeInterval[] {
    const start = timeUtils.parseTime(startTime, dayStart);
    const end = timeUtils.parseTime(endTime, dayStart);
    const dayEnd = endOfDay(dayStart);

    if (start.getTime() === end.getTime()) return [];

    if (isBefore(start, end)) {
      return [{ start, end }];
    }

    const intervals: TimeInterval[] = [];
    if (isAfter(end, dayStart)) {
      intervals.push({ start: dayStart, end });
    }
    if (isAfter(dayEnd, start)) {
      intervals.push({ start, end: dayEnd });
    }
    return intervals;
  },

  /**
   * Intersect base intervals with filter intervals.
   */
  intersectIntervals(base: TimeInterval[], filters: TimeInterval[]): TimeInterval[] {
    if (base.length === 0 || filters.length === 0) return [];

    const out: TimeInterval[] = [];
    for (const source of base) {
      for (const filter of filters) {
        const start = isAfter(source.start, filter.start) ? source.start : filter.start;
        const end = isBefore(source.end, filter.end) ? source.end : filter.end;
        if (isBefore(start, end)) {
          out.push({ start, end });
        }
      }
    }
    return out;
  },

  /**
   * Merge overlapping time intervals.
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
   * Check if a gap is valid (not in quiet hours, meets minimum duration).
   */
  isValidGap(gap: TimeInterval, prefs: Preferences): boolean {
    const durationMinutes = (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const requiredMinutes = prefs.bufferMinutes + gracePeriod + prefs.minWalkMinutes;

    if (durationMinutes < requiredMinutes) {
      return false;
    }

    const walkStart = addMinutes(gap.start, prefs.bufferMinutes + gracePeriod);
    const walkEnd = addMinutes(walkStart, prefs.minWalkMinutes);
    if (timeUtils.isInQuietHours(walkStart, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }
    if (timeUtils.isInQuietHours(walkEnd, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }
    return true;
  },

  /**
   * Score a gap and compute how many reminders it can support.
   */
  scoreGap(
    gap: TimeInterval,
    prefs: Preferences,
    minReminderGapMinutes: number
  ): GapOpportunity {
    const durationMinutes = Math.floor((gap.end.getTime() - gap.start.getTime()) / (1000 * 60));
    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const availableWalkMinutes = Math.max(
      0,
      durationMinutes - prefs.bufferMinutes - gracePeriod
    );

    const maxNotifications = this.computeGapNotificationCap(
      availableWalkMinutes,
      prefs,
      minReminderGapMinutes
    );

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

    if (prefs.preferredWalkingPeriodsEnabled && prefs.preferredWalkingPeriods.length > 0) {
      if (timeUtils.isInPreferredPeriods(gap.start, prefs.preferredWalkingPeriods)) {
        score += 50;
      }
    }

    return {
      id: `${gap.start.toISOString()}__${gap.end.toISOString()}`,
      gapStart: gap.start,
      gapEnd: gap.end,
      durationMinutes,
      availableWalkMinutes,
      maxNotifications,
      score,
    };
  },

  /**
   * Tiered cap + spacing cap for max reminders in one gap.
   */
  computeGapNotificationCap(
    availableWalkMinutes: number,
    prefs: Preferences,
    minReminderGapMinutes: number
  ): number {
    const ruleMinGapMinutes = Math.max(10, prefs.minWalkMinutes);
    if (availableWalkMinutes < ruleMinGapMinutes) return 0;

    let tierCap = 0;
    if (availableWalkMinutes <= 60) tierCap = 1;
    else if (availableWalkMinutes <= 180) tierCap = 2;
    else if (availableWalkMinutes <= 360) tierCap = 5;
    else tierCap = prefs.notificationCountPerDay;

    const spacingCap = 1 + Math.floor(
      (availableWalkMinutes - prefs.minWalkMinutes) / Math.max(1, minReminderGapMinutes)
    );

    return Math.max(0, Math.min(tierCap, spacingCap, prefs.notificationCountPerDay));
  },

  /**
   * Allocate reminder counts across gaps.
   * Pass 1: one reminder per gap (fairness).
   * Pass 2: fill extra reminders by score until budget is exhausted.
   */
  selectGapNotificationCounts(
    opportunities: GapOpportunity[],
    notificationBudget: number
  ): Array<{ opportunity: GapOpportunity; count: number }> {
    if (notificationBudget <= 0 || opportunities.length === 0) return [];

    const counts = new Map<string, number>();
    let remaining = notificationBudget;

    for (const opp of opportunities) {
      if (remaining <= 0) break;
      if (opp.maxNotifications <= 0) continue;
      counts.set(opp.id, 1);
      remaining -= 1;
    }

    while (remaining > 0) {
      let progressed = false;
      for (const opp of opportunities) {
        if (remaining <= 0) break;
        const current = counts.get(opp.id) ?? 0;
        if (current < opp.maxNotifications) {
          counts.set(opp.id, current + 1);
          remaining -= 1;
          progressed = true;
        }
      }
      if (!progressed) break;
    }

    return opportunities
      .map((opportunity) => ({
        opportunity,
        count: counts.get(opportunity.id) ?? 0,
      }))
      .filter((item) => item.count > 0);
  },

  /**
   * Build concrete reminder slots inside a gap.
   */
  buildSlotsForGap(
    opportunity: GapOpportunity,
    count: number,
    prefs: Preferences,
    minReminderGapMinutes: number
  ): GapSlot[] {
    if (count <= 0) return [];

    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const baseWalkStart = addMinutes(opportunity.gapStart, prefs.bufferMinutes + gracePeriod);
    const latestWalkStart = addMinutes(opportunity.gapEnd, -prefs.minWalkMinutes);
    const spanMinutes = Math.max(0, opportunity.availableWalkMinutes - prefs.minWalkMinutes);
    const stepMinutes = count > 1
      ? Math.max(minReminderGapMinutes, Math.floor(spanMinutes / (count - 1)))
      : 0;

    const baseCapacity = Math.floor(opportunity.availableWalkMinutes / count);
    const remainder = opportunity.availableWalkMinutes - baseCapacity * count;

    const slots: GapSlot[] = [];
    for (let i = 0; i < count; i++) {
      let walkStart: Date;
      if (count === 1) {
        const spanMinutesToLatest = Math.max(
          0,
          Math.floor((latestWalkStart.getTime() - baseWalkStart.getTime()) / 60000)
        );
        walkStart = addMinutes(baseWalkStart, Math.floor(spanMinutesToLatest / 2));
      } else {
        walkStart = addMinutes(baseWalkStart, i * stepMinutes);
      }
      if (isAfter(walkStart, latestWalkStart)) {
        walkStart = latestWalkStart;
      }

      const slotCapacityMinutes = Math.max(
        prefs.minWalkMinutes,
        baseCapacity + (i < remainder ? 1 : 0)
      );

      slots.push({
        opportunityId: opportunity.id,
        gapStart: opportunity.gapStart,
        gapEnd: opportunity.gapEnd,
        walkStart,
        slotCapacityMinutes,
        score: opportunity.score - i * 0.25,
      });
    }

    return slots;
  },

  /**
   * Distribute target minutes across selected slots while respecting capacities.
   */
  distributeDurations(
    dailyTargetMinutes: number,
    capacities: number[],
    minWalkMinutes: number
  ): number[] {
    const count = capacities.length;
    if (count === 0) return [];

    const safeCaps = capacities.map((c) => Math.max(0, Math.floor(c)));
    const maxTotal = safeCaps.reduce((sum, cap) => sum + cap, 0);
    if (maxTotal <= 0) return new Array(count).fill(0);

    const target = Math.max(1, Math.min(Math.floor(dailyTargetMinutes), maxTotal));
    const out = new Array(count).fill(0);

    const minPerSlot = target >= minWalkMinutes * count ? minWalkMinutes : 1;
    let remaining = target;

    for (let i = 0; i < count; i++) {
      const seeded = Math.min(safeCaps[i], minPerSlot);
      out[i] = seeded;
      remaining -= seeded;
    }

    let cursor = 0;
    let guard = 0;
    const guardLimit = maxTotal * 2 + count * 4;

    while (remaining > 0 && guard < guardLimit) {
      const idx = cursor % count;
      if (out[idx] < safeCaps[idx]) {
        out[idx] += 1;
        remaining -= 1;
      }
      cursor += 1;
      guard += 1;
    }

    return out.map((value, idx) => Math.max(0, Math.min(value, safeCaps[idx])));
  },
};
