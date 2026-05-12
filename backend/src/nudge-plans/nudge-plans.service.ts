import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNudgePlanDto,
  RecordLocalDeliveryDto,
  UpdateNudgePlanStatusDto,
  QueryNudgePlansDto,
} from './dto/nudge-plans.dto';
import { NudgePlanStatus, Prisma } from '@prisma/client';
import { format, startOfDay, endOfDay } from 'date-fns';
import { TZDate } from '@date-fns/tz';

const TERMINAL_STATUSES: NudgePlanStatus[] = [
  'cancelled',
  'completed',
  'skipped',
];

const DEFAULT_TIMEZONE = 'America/New_York';

@Injectable()
export class NudgePlansService {
  private readonly logger = new Logger(NudgePlansService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Get the user's configured timezone, falling back to default */
  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone ?? DEFAULT_TIMEZONE;
  }

  /** Get "today" date string (YYYY-MM-DD) in the user's timezone */
  private getTodayKeyInTz(timezone: string): string {
    const nowInTz = new TZDate(new Date(), timezone);
    return format(nowInTz, 'yyyy-MM-dd');
  }

  /** Get UTC-based day boundaries for "today" in the user's timezone */
  private getDayBoundariesInTz(timezone: string): {
    dayStart: Date;
    dayEnd: Date;
  } {
    const nowInTz = new TZDate(new Date(), timezone);
    return { dayStart: startOfDay(nowInTz), dayEnd: endOfDay(nowInTz) };
  }

  async findById(userId: string, id: string) {
    const plan = await this.prisma.nudgePlan.findFirst({
      where: { id, userId },
    });
    if (!plan) throw new NotFoundException('Nudge plan not found');
    return plan;
  }

  async query(userId: string, query: QueryNudgePlansDto) {
    const where: Prisma.NudgePlanWhereInput = { userId };
    if (query.date) where.date = query.date;
    if (query.status) where.status = query.status;

    return this.prisma.nudgePlan.findMany({
      where,
      orderBy: { walkStart: 'asc' },
    });
  }

  async getTodayPlans(userId: string) {
    const tz = await this.getUserTimezone(userId);
    const today = this.getTodayKeyInTz(tz);
    return this.prisma.nudgePlan.findMany({
      where: { userId, date: today },
      orderBy: { walkStart: 'asc' },
    });
  }

  async getUpcomingPlans(userId: string, limit = 100) {
    return this.prisma.nudgePlan.findMany({
      where: {
        userId,
        status: { in: ['planned', 'notified'] },
        walkStart: { gte: new Date() },
      },
      orderBy: { walkStart: 'asc' },
      take: limit,
    });
  }

  async create(userId: string, dto: CreateNudgePlanDto) {
    return this.prisma.nudgePlan.create({
      data: {
        userId,
        localId: dto.localId,
        date: dto.date,
        gapStart: new Date(dto.gapStart),
        gapEnd: new Date(dto.gapEnd),
        walkStart: new Date(dto.walkStart),
        suggestedDurationMinutes: dto.suggestedDurationMinutes,
        notificationsEnabled: dto.notificationsEnabled ?? true,
        reason: dto.reason,
        origin: 'local_fallback',
      },
    });
  }

  async updateStatus(
    userId: string,
    id: string,
    dto: UpdateNudgePlanStatusDto,
  ) {
    const plan = await this.findById(userId, id);

    if (TERMINAL_STATUSES.includes(plan.status)) {
      this.logger.warn(
        `Attempted to transition plan ${id} from terminal status ${plan.status}`,
      );
      return plan;
    }

    return this.prisma.nudgePlan.update({
      where: { id },
      data: {
        status: dto.status,
        reason: dto.reason ?? plan.reason,
      },
    });
  }

  /**
   * Mark plan as notified (planned → notified transition).
   */
  async markNotifiedIfPlanned(userId: string, planId: string) {
    const plan = await this.findById(userId, planId);
    if (TERMINAL_STATUSES.includes(plan.status)) return { transitioned: false };

    if (plan.status === 'planned') {
      await this.prisma.nudgePlan.update({
        where: { id: planId },
        data: { status: 'notified' },
      });
      return { transitioned: true };
    }
    return { transitioned: false };
  }

  /**
   * Skip a gap — cancel all plans in the same gap window.
   */
  async skipGap(userId: string, planId: string) {
    const plan = await this.findById(userId, planId);
    if (TERMINAL_STATUSES.includes(plan.status)) {
      return { skipped: false };
    }

    const todayPlans = await this.getTodayPlans(userId);
    const sameGapPlans = todayPlans.filter(
      (item) =>
        (item.status === 'planned' || item.status === 'notified') &&
        item.gapStart.getTime() === plan.gapStart.getTime() &&
        item.gapEnd.getTime() === plan.gapEnd.getTime() &&
        item.walkStart > new Date(),
    );

    for (const item of sameGapPlans) {
      await this.prisma.nudgePlan.update({
        where: { id: item.id },
        data: {
          status: item.id === plan.id ? 'skipped' : 'cancelled',
        },
      });
    }

    if (sameGapPlans.length === 0) {
      await this.prisma.nudgePlan.update({
        where: { id: plan.id },
        data: { status: 'skipped' },
      });
    }

    return { skipped: true, cancelledCount: sameGapPlans.length };
  }

  /**
   * Check if plan can be started (goal not yet reached).
   */
  async canStartPlan(userId: string, planId: string) {
    const plan = await this.findById(userId, planId);
    if (TERMINAL_STATUSES.includes(plan.status)) {
      return { allowed: false, planExists: true, reason: 'terminal_status' };
    }

    if (plan.status === 'planned') {
      await this.prisma.nudgePlan.update({
        where: { id: planId },
        data: { status: 'notified' },
      });
    }

    // Check if daily goal is already reached
    const prefs = await this.prisma.preference.findUnique({
      where: { userId },
    });

    if (prefs) {
      // Use the user's timezone for day boundaries
      const tz = await this.getUserTimezone(userId);
      const { dayStart, dayEnd } = this.getDayBoundariesInTz(tz);
      const todaySessions = await this.prisma.walkSession.findMany({
        where: {
          userId,
          start: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });
      const minutesWalked = todaySessions.reduce(
        (sum, s) => sum + s.activeSeconds / 60,
        0,
      );

      if (minutesWalked >= prefs.dailyTargetMinutes) {
        await this.prisma.nudgePlan.update({
          where: { id: planId },
          data: { status: 'cancelled' },
        });
        return {
          allowed: false,
          planExists: true,
          reason: 'goal_reached',
          minutesWalked,
        };
      }
    }

    return { allowed: true, planExists: true };
  }

  /** Get notifications count for today (in user's timezone) */
  async getTodayNotifiedCount(userId: string) {
    const tz = await this.getUserTimezone(userId);
    const today = this.getTodayKeyInTz(tz);
    return this.prisma.nudgePlan.count({
      where: {
        userId,
        date: today,
        status: { in: ['notified', 'started', 'completed'] },
      },
    });
  }

  async recordLocalDelivery(userId: string, dto: RecordLocalDeliveryDto) {
    const plan = await this.prisma.nudgePlan.findFirst({
      where: {
        userId,
        localId: dto.localId,
      },
      select: {
        id: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Nudge plan not found');
    }

    await this.prisma.nudgePlan.update({
      where: { id: plan.id },
      data: {
        localReminderDeliveredAt: new Date(dto.deliveredAt),
        localReminderScheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });

    return {
      recorded: true,
      source: dto.source,
    };
  }
}
