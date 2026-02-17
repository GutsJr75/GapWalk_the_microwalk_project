import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBehaviorLogDto,
  QueryBehaviorLogsDto,
} from './dto/behavior-log.dto';

@Injectable()
export class BehaviorLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateBehaviorLogDto) {
    return this.prisma.behaviorLog.create({
      data: {
        userId,
        nudgePlanId: dto.nudgePlanId || null,
        eventType: dto.eventType,
        payload: dto.payload ?? Prisma.JsonNull,
        clientTimestamp: new Date(dto.clientTimestamp),
      },
    });
  }

  async bulkCreate(userId: string, logs: CreateBehaviorLogDto[]) {
    return this.prisma.behaviorLog.createMany({
      data: logs.map((l) => ({
        userId,
        nudgePlanId: l.nudgePlanId || null,
        eventType: l.eventType,
        payload: l.payload ?? Prisma.JsonNull,
        clientTimestamp: new Date(l.clientTimestamp),
      })),
    });
  }

  async query(query: QueryBehaviorLogsDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.eventType) where.eventType = query.eventType;
    if (query.nudgePlanId) where.nudgePlanId = query.nudgePlanId;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    return this.prisma.behaviorLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async getEventTypeCounts(query: QueryBehaviorLogsDto) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const groups = await this.prisma.behaviorLog.groupBy({
      by: ['eventType'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return groups.map((g) => ({ eventType: g.eventType, count: g._count.id }));
  }

  /**
   * Get the nudge response funnel for a specific user or all users.
   * Returns counts: received → opened → started → completed/skipped/dismissed
   */
  async getNudgeFunnel(userId?: string, startDate?: string, endDate?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const nudgeEvents = [
      'nudge_received',
      'nudge_opened',
      'nudge_dismissed',
      'nudge_expired',
      'walk_started',
      'walk_completed',
      'walk_cancelled',
    ] as const;

    const counts: Record<string, number> = {};
    for (const eventType of nudgeEvents) {
      counts[eventType] = await this.prisma.behaviorLog.count({
        where: { ...where, eventType },
      });
    }

    return counts;
  }
}
