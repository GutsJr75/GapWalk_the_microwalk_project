import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAnalyticsEventDto,
  CreateCrashReportDto,
  QueryAnalyticsDto,
  QueryAggregationsDto,
} from './dto/analytics.dto';
import { format, startOfDay, endOfDay, startOfWeek } from 'date-fns';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Events ──

  async createEvent(userId: string, dto: CreateAnalyticsEventDto) {
    return this.prisma.analyticsEvent.create({
      data: {
        userId,
        name: dto.name,
        payload: dto.payload ?? Prisma.JsonNull,
        clientCreatedAt: dto.clientCreatedAt
          ? new Date(dto.clientCreatedAt)
          : null,
      },
    });
  }

  async bulkCreateEvents(userId: string, events: CreateAnalyticsEventDto[]) {
    return this.prisma.analyticsEvent.createMany({
      data: events.map((e) => ({
        userId,
        name: e.name,
        payload: e.payload ?? Prisma.JsonNull,
        clientCreatedAt: e.clientCreatedAt
          ? new Date(e.clientCreatedAt)
          : null,
      })),
    });
  }

  async queryEvents(query: QueryAnalyticsDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.name) where.name = query.name;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    return this.prisma.analyticsEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async getEventCounts(query: QueryAnalyticsDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const events = await this.prisma.analyticsEvent.groupBy({
      by: ['name'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return events.map((e) => ({ name: e.name, count: e._count.id }));
  }

  // ── Crash Reports ──

  async createCrashReport(userId: string, dto: CreateCrashReportDto) {
    return this.prisma.crashReport.create({
      data: {
        userId,
        message: dto.message,
        stack: dto.stack,
        isFatal: dto.isFatal ?? false,
        context: dto.context ?? Prisma.JsonNull,
        clientCreatedAt: dto.clientCreatedAt
          ? new Date(dto.clientCreatedAt)
          : null,
      },
    });
  }

  async bulkCreateCrashReports(userId: string, reports: CreateCrashReportDto[]) {
    return this.prisma.crashReport.createMany({
      data: reports.map((r) => ({
        userId,
        message: r.message,
        stack: r.stack,
        isFatal: r.isFatal ?? false,
        context: r.context ?? Prisma.JsonNull,
        clientCreatedAt: r.clientCreatedAt
          ? new Date(r.clientCreatedAt)
          : null,
      })),
    });
  }

  async queryCrashReports(query: QueryAnalyticsDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    return this.prisma.crashReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Daily Aggregations ──

  async getDailyAggregations(query: QueryAggregationsDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.date) where.date = query.date;
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = query.startDate;
      if (query.endDate) where.date.lte = query.endDate;
    }

    return this.prisma.dailyAggregation.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async getWeeklyAggregations(query: QueryAggregationsDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.weekStart) where.weekStart = query.weekStart;
    if (query.startDate || query.endDate) {
      where.weekStart = {};
      if (query.startDate) where.weekStart.gte = query.startDate;
      if (query.endDate) where.weekStart.lte = query.endDate;
    }

    return this.prisma.weeklyAggregation.findMany({
      where,
      orderBy: { weekStart: 'desc' },
    });
  }

  /**
   * Compute and upsert daily aggregation for a user on a given date.
   */
  async computeDailyAggregation(userId: string, dateStr: string) {
    const dateStart = startOfDay(new Date(dateStr));
    const dateEnd = endOfDay(new Date(dateStr));

    const [sessions, plans] = await Promise.all([
      this.prisma.walkSession.findMany({
        where: { userId, start: { gte: dateStart, lte: dateEnd } },
      }),
      this.prisma.nudgePlan.findMany({
        where: { userId, date: dateStr },
      }),
    ]);

    const totalActiveMinutes = Math.round(
      sessions.reduce((s, sess) => s + sess.activeSeconds / 60, 0),
    );
    const totalSteps = sessions.reduce((s, sess) => s + sess.steps, 0);
    const totalDistanceMeters = sessions.reduce(
      (s, sess) => s + (sess.distanceMeters ?? 0),
      0,
    );
    const totalCalories = sessions.reduce(
      (s, sess) => s + (sess.calories ?? 0),
      0,
    );

    const nudgesPlanned = plans.length;
    const nudgesDelivered = plans.filter(
      (p) => p.status !== 'planned' && p.status !== 'cancelled',
    ).length;
    const nudgesOpened = plans.filter(
      (p) =>
        p.status === 'started' ||
        p.status === 'completed' ||
        p.status === 'notified',
    ).length;
    const nudgesSkipped = plans.filter((p) => p.status === 'skipped').length;

    const prefs = await this.prisma.preference.findUnique({
      where: { userId },
    });
    const goalReached = prefs
      ? totalActiveMinutes >= prefs.dailyTargetMinutes
      : false;

    return this.prisma.dailyAggregation.upsert({
      where: { userId_date: { userId, date: dateStr } },
      update: {
        totalActiveMinutes,
        totalSteps,
        totalDistanceMeters,
        totalCalories,
        sessionCount: sessions.length,
        nudgesPlanned,
        nudgesDelivered,
        nudgesOpened,
        nudgesSkipped,
        goalReached,
      },
      create: {
        userId,
        date: dateStr,
        totalActiveMinutes,
        totalSteps,
        totalDistanceMeters,
        totalCalories,
        sessionCount: sessions.length,
        nudgesPlanned,
        nudgesDelivered,
        nudgesOpened,
        nudgesSkipped,
        goalReached,
      },
    });
  }

  /**
   * Compute and upsert weekly aggregation for a user for a given week.
   */
  async computeWeeklyAggregation(userId: string, weekStartStr: string) {
    const dailies = await this.prisma.dailyAggregation.findMany({
      where: {
        userId,
        date: { gte: weekStartStr },
      },
      orderBy: { date: 'asc' },
      take: 7,
    });

    const totalActiveMinutes = dailies.reduce(
      (s, d) => s + d.totalActiveMinutes,
      0,
    );
    const totalSteps = dailies.reduce((s, d) => s + d.totalSteps, 0);
    const totalDistanceMeters = dailies.reduce(
      (s, d) => s + d.totalDistanceMeters,
      0,
    );
    const sessionCount = dailies.reduce((s, d) => s + d.sessionCount, 0);
    const daysActive = dailies.filter((d) => d.sessionCount > 0).length;
    const daysWithGoal = dailies.filter((d) => d.goalReached).length;
    const adherenceRate = dailies.length > 0 ? daysWithGoal / 7 : 0;

    return this.prisma.weeklyAggregation.upsert({
      where: { userId_weekStart: { userId, weekStart: weekStartStr } },
      update: {
        totalActiveMinutes,
        totalSteps,
        totalDistanceMeters,
        sessionCount,
        daysActive,
        adherenceRate,
      },
      create: {
        userId,
        weekStart: weekStartStr,
        totalActiveMinutes,
        totalSteps,
        totalDistanceMeters,
        sessionCount,
        daysActive,
        adherenceRate,
      },
    });
  }
}
