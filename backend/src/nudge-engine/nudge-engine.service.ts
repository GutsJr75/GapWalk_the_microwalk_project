import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Preference, BusyEvent } from '@prisma/client';
import {
  addMinutes,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isWithinInterval,
  startOfDay,
} from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { v4 as uuid } from 'uuid';

const DEFAULT_TIMEZONE = 'America/New_York';

// ── Internal types (mirroring frontend gapEngine.ts) ──

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

export interface GeneratedPlan {
  id: string;
  userId: string;
  date: string;
  gapStart: Date;
  gapEnd: Date;
  walkStart: Date;
  suggestedDurationMinutes: number;
  status: 'planned';
  origin: 'server';
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sameDateKey = (a: Date, b: Date, timezone?: string): boolean => {
  if (timezone) {
    return (
      format(new TZDate(a, timezone), 'yyyy-MM-dd') ===
      format(new TZDate(b, timezone), 'yyyy-MM-dd')
    );
  }
  return format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');
};

/**
 * Parse "HH:mm" to a Date on the given base day.
 */
function parseTime(timeStr: string, baseDate: Date): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = startOfDay(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Check if a time falls within quiet hours.
 */
function isInQuietHours(
  checkTime: Date,
  quietStart: string,
  quietEnd: string,
): boolean {
  const dayStart = startOfDay(checkTime);
  const qStart = parseTime(quietStart, dayStart);
  const qEnd = parseTime(quietEnd, dayStart);

  if (isAfter(qStart, qEnd)) {
    // Overnight quiet hours (e.g., 23:00 → 06:00)
    return isAfter(checkTime, qStart) || isBefore(checkTime, qEnd);
  }
  return isWithinInterval(checkTime, { start: qStart, end: qEnd });
}

/**
 * Check whether the quiet-hours boundary falls inside a walk interval.
 * Catches the case where walkStart and walkEnd are both outside quiet hours
 * but the walk spans the entire quiet period (start→end crossing).
 */
function quietHoursOverlapInterval(
  walkStart: Date,
  walkEnd: Date,
  quietStartStr: string,
  quietEndStr: string,
): boolean {
  const dayBase = startOfDay(walkStart);
  const qStart = parseTime(quietStartStr, dayBase);
  const qEnd = parseTime(quietEndStr, dayBase);

  if (isAfter(qStart, qEnd)) {
    // Overnight quiet hours: check if qStart falls within walk interval
    // (qEnd would be next-morning, already handled by isInQuietHours for walkEnd)
    return isAfter(qStart, walkStart) && isBefore(qStart, walkEnd);
  }

  // Daytime quiet hours: check if either boundary falls within walk interval
  const qStartInWalk = isAfter(qStart, walkStart) && isBefore(qStart, walkEnd);
  const qEndInWalk = isAfter(qEnd, walkStart) && isBefore(qEnd, walkEnd);
  return qStartInWalk || qEndInWalk;
}

@Injectable()
export class NudgeEngineService {
  private readonly logger = new Logger(NudgeEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Get the user's configured timezone, falling back to default */
  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone ?? DEFAULT_TIMEZONE;
  }

  /** Get date key (YYYY-MM-DD) for a Date in the user's timezone */
  private getDateKeyInTz(date: Date, timezone: string): string {
    const dateInTz = new TZDate(date, timezone);
    return format(dateInTz, 'yyyy-MM-dd');
  }

  /**
   * Generate nudge plans for a specific user on a specific date.
   * Port of frontend gapEngine.generatePlansForDate().
   */
  async generatePlansForDate(
    userId: string,
    date: Date,
    prefs: Preference,
    timezone?: string,
  ): Promise<GeneratedPlan[]> {
    if (prefs.dailyTargetMinutes <= 0 || prefs.notificationCountPerDay <= 0) {
      return [];
    }

    // When timezone is provided, anchor day boundaries in the user's timezone
    const anchoredDate = timezone ? new TZDate(date, timezone) : date;
    const dayStart = startOfDay(anchoredDate);
    const dayEnd = endOfDay(anchoredDate);
    const now = new Date();
    const isToday = sameDateKey(date, now, timezone);

    // Fetch busy events for this day
    const dayEvents = await this.prisma.busyEvent.findMany({
      where: {
        userId,
        OR: [
          { start: { gte: dayStart, lte: dayEnd } },
          { endTime: { gte: dayStart, lte: dayEnd } },
          { start: { lt: dayStart }, endTime: { gt: dayEnd } },
        ],
      },
    });

    const rawGaps = this.findGaps(dayStart, dayEnd, dayEvents, prefs);

    let candidateGaps = rawGaps
      .map((gap) => {
        if (!isToday) return gap;
        const start = isAfter(now, gap.start) ? now : gap.start;
        return isBefore(start, gap.end) ? { start, end: gap.end } : null;
      })
      .filter((gap): gap is TimeInterval => !!gap);

    // Hard filter: restrict to preferred walking periods when set
    const periods = prefs.preferredWalkingPeriods as
      | Array<{ start: string; end: string }>
      | null
      | undefined;
    if (periods && periods.length > 0) {
      const filtered = candidateGaps.filter((gap) => {
        const dayBase = startOfDay(gap.start);
        return periods.some((period) => {
          const pStart = parseTime(period.start, dayBase);
          const pEnd = parseTime(period.end, dayBase);
          return isBefore(gap.start, pEnd) && isAfter(gap.end, pStart);
        });
      });
      // Graceful fallback: use all gaps if none match preferred periods
      if (filtered.length > 0) {
        candidateGaps = filtered;
      }
    }

    const minReminderGapMinutes = clamp(
      prefs.notificationMinGapMinutes ?? 60,
      30,
      360,
    );

    const opportunities = candidateGaps
      .map((gap) => this.scoreGap(gap, prefs, minReminderGapMinutes))
      .filter((opp) => opp.maxNotifications > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.gapStart.getTime() - b.gapStart.getTime();
      });

    if (opportunities.length === 0) return [];

    // Sustainability guard
    const targetBasedMaxNotifications = Math.max(
      1,
      Math.floor(
        Math.max(1, prefs.dailyTargetMinutes) /
          Math.max(1, prefs.minWalkMinutes),
      ),
    );
    const notificationBudget = Math.max(
      1,
      Math.min(prefs.notificationCountPerDay, targetBasedMaxNotifications),
    );

    const selectedGapCounts = this.selectGapNotificationCounts(
      opportunities,
      notificationBudget,
    );
    if (selectedGapCounts.length === 0) return [];

    const slots = selectedGapCounts
      .flatMap(({ opportunity, count }) =>
        this.buildSlotsForGap(opportunity, count, prefs, minReminderGapMinutes),
      )
      .sort((a, b) => a.walkStart.getTime() - b.walkStart.getTime());

    if (slots.length === 0) return [];

    const distributedDurations = this.distributeDurations(
      prefs.dailyTargetMinutes,
      slots.map((s) => s.slotCapacityMinutes),
      prefs.minWalkMinutes,
    );

    const dateKey = timezone
      ? this.getDateKeyInTz(date, timezone)
      : format(date, 'yyyy-MM-dd');
    const plans: GeneratedPlan[] = slots.map((slot, idx) => ({
      id: uuid(),
      userId,
      date: dateKey,
      gapStart: slot.gapStart,
      gapEnd: slot.gapEnd,
      walkStart: slot.walkStart,
      suggestedDurationMinutes: Math.max(
        1,
        distributedDurations[idx] ?? prefs.minWalkMinutes,
      ),
      status: 'planned' as const,
      origin: 'server' as const,
    }));

    if (isToday) {
      return plans.filter((plan) => isAfter(plan.walkStart, now));
    }

    return plans;
  }

  /**
   * Generate and persist plans for a user for today + tomorrow.
   * Cancels existing active plans before regenerating.
   */
  async generateAndSavePlans(userId: string): Promise<GeneratedPlan[]> {
    const prefs = await this.prisma.preference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      this.logger.warn(
        `No preferences for user ${userId}, skipping plan generation`,
      );
      return [];
    }

    const tz = await this.getUserTimezone(userId);
    const allPlans: GeneratedPlan[] = [];

    for (let i = 0; i < 2; i++) {
      const nowInTz = new TZDate(new Date(), tz);
      const date = addMinutes(startOfDay(nowInTz), i * 24 * 60);
      const dateKey = this.getDateKeyInTz(date, tz);

      // Cancel existing active plans for this date
      await this.prisma.nudgePlan.updateMany({
        where: {
          userId,
          date: dateKey,
          status: { in: ['planned', 'notified'] },
        },
        data: { status: 'cancelled' },
      });

      const plans = await this.generatePlansForDate(userId, date, prefs, tz);

      // Persist new plans
      if (plans.length > 0) {
        await this.prisma.nudgePlan.createMany({
          data: plans.map((p) => ({
            id: p.id,
            userId: p.userId,
            date: p.date,
            gapStart: p.gapStart,
            gapEnd: p.gapEnd,
            walkStart: p.walkStart,
            suggestedDurationMinutes: p.suggestedDurationMinutes,
            status: p.status,
            origin: p.origin,
          })),
        });
      }

      allPlans.push(...plans);
    }

    return allPlans;
  }

  // ── Core algorithm methods (ported from frontend gapEngine.ts) ──

  findGaps(
    dayStart: Date,
    dayEnd: Date,
    events: BusyEvent[],
    prefs: Preference,
  ): TimeInterval[] {
    const timedEvents = events.filter((e) => !e.isAllDay);

    const busyIntervals: TimeInterval[] = timedEvents
      .map((event) => ({
        start: event.start,
        end: event.endTime,
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
  }

  mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (intervals.length === 0) return [];

    const merged: TimeInterval[] = [];
    let current = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i];
      if (
        isBefore(next.start, current.end) ||
        next.start.getTime() === current.end.getTime()
      ) {
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
  }

  isValidGap(gap: TimeInterval, prefs: Preference): boolean {
    const durationMinutes =
      (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const requiredMinutes =
      prefs.bufferMinutes + gracePeriod + prefs.minWalkMinutes;

    if (durationMinutes < requiredMinutes) return false;

    const walkStart = addMinutes(gap.start, prefs.bufferMinutes);
    const walkEnd = addMinutes(walkStart, prefs.minWalkMinutes);

    // Validate that neither the start nor the end of the walk falls in quiet hours
    if (isInQuietHours(walkStart, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }
    if (isInQuietHours(walkEnd, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }

    // Also check that quiet-hours boundary doesn't fall within the walk interval
    // (handles case where walk spans the entire quiet period)
    if (
      quietHoursOverlapInterval(
        walkStart,
        walkEnd,
        prefs.quietHoursStart,
        prefs.quietHoursEnd,
      )
    ) {
      return false;
    }

    return true;
  }

  scoreGap(
    gap: TimeInterval,
    prefs: Preference,
    minReminderGapMinutes: number,
  ): GapOpportunity {
    const durationMinutes = Math.floor(
      (gap.end.getTime() - gap.start.getTime()) / (1000 * 60),
    );
    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const availableWalkMinutes = Math.max(
      0,
      durationMinutes - prefs.bufferMinutes - gracePeriod,
    );

    const maxNotifications = this.computeGapNotificationCap(
      availableWalkMinutes,
      prefs,
      minReminderGapMinutes,
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

    // Boost score if gap overlaps a preferred walking period
    const scorePeriods = prefs.preferredWalkingPeriods as
      | Array<{ start: string; end: string }>
      | null
      | undefined;
    if (scorePeriods && scorePeriods.length > 0) {
      const dayBase = startOfDay(gap.start);
      for (const period of scorePeriods) {
        const pStart = parseTime(period.start, dayBase);
        const pEnd = parseTime(period.end, dayBase);
        // Check overlap between [gap.start, gap.end] and [pStart, pEnd]
        if (isBefore(gap.start, pEnd) && isAfter(gap.end, pStart)) {
          score += 30; // significant boost for preferred periods
          break;
        }
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
  }

  computeGapNotificationCap(
    availableWalkMinutes: number,
    prefs: Preference,
    minReminderGapMinutes: number,
  ): number {
    const ruleMinGapMinutes = Math.max(10, prefs.minWalkMinutes);
    if (availableWalkMinutes < ruleMinGapMinutes) return 0;

    let tierCap = 0;
    if (availableWalkMinutes <= 60) tierCap = 1;
    else if (availableWalkMinutes <= 180) tierCap = 2;
    else if (availableWalkMinutes <= 360) tierCap = 5;
    else tierCap = prefs.notificationCountPerDay;

    const spacingCap =
      1 +
      Math.floor(
        (availableWalkMinutes - prefs.minWalkMinutes) /
          Math.max(1, minReminderGapMinutes),
      );

    return Math.max(
      0,
      Math.min(tierCap, spacingCap, prefs.notificationCountPerDay),
    );
  }

  selectGapNotificationCounts(
    opportunities: GapOpportunity[],
    notificationBudget: number,
  ): Array<{ opportunity: GapOpportunity; count: number }> {
    if (notificationBudget <= 0 || opportunities.length === 0) return [];

    const counts = new Map<string, number>();
    let remaining = notificationBudget;

    // Pass 1: one per gap (fairness)
    for (const opp of opportunities) {
      if (remaining <= 0) break;
      if (opp.maxNotifications <= 0) continue;
      counts.set(opp.id, 1);
      remaining -= 1;
    }

    // Pass 2: fill extra by score
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
  }

  buildSlotsForGap(
    opportunity: GapOpportunity,
    count: number,
    prefs: Preference,
    minReminderGapMinutes: number,
  ): GapSlot[] {
    if (count <= 0) return [];

    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const baseWalkStart = addMinutes(
      opportunity.gapStart,
      prefs.bufferMinutes + gracePeriod,
    );
    const latestWalkStart = addMinutes(
      opportunity.gapEnd,
      -prefs.minWalkMinutes,
    );
    const spanMinutes = Math.max(
      0,
      opportunity.availableWalkMinutes - prefs.minWalkMinutes,
    );
    const stepMinutes =
      count > 1
        ? Math.max(minReminderGapMinutes, Math.floor(spanMinutes / (count - 1)))
        : 0;

    const baseCapacity = Math.floor(opportunity.availableWalkMinutes / count);
    const remainder = opportunity.availableWalkMinutes - baseCapacity * count;

    const slots: GapSlot[] = [];
    for (let i = 0; i < count; i++) {
      let walkStart = addMinutes(baseWalkStart, i * stepMinutes);
      if (isAfter(walkStart, latestWalkStart)) {
        walkStart = latestWalkStart;
      }

      const slotCapacityMinutes = Math.max(
        prefs.minWalkMinutes,
        baseCapacity + (i < remainder ? 1 : 0),
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
  }

  distributeDurations(
    dailyTargetMinutes: number,
    capacities: number[],
    minWalkMinutes: number,
  ): number[] {
    const count = capacities.length;
    if (count === 0) return [];

    const safeCaps = capacities.map((c) => Math.max(0, Math.floor(c)));
    const maxTotal = safeCaps.reduce((sum, cap) => sum + cap, 0);
    if (maxTotal <= 0) return new Array<number>(count).fill(0);

    const target = Math.max(
      1,
      Math.min(Math.floor(dailyTargetMinutes), maxTotal),
    );
    const out: number[] = new Array<number>(count).fill(0);

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
  }
}
