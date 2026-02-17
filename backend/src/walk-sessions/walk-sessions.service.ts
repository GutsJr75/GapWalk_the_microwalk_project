import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWalkSessionDto,
  QueryWalkSessionsDto,
} from './dto/walk-sessions.dto';
import { format, startOfDay, endOfDay } from 'date-fns';

@Injectable()
export class WalkSessionsService {
  private readonly logger = new Logger(WalkSessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWalkSessionDto) {
    const session = await this.prisma.walkSession.create({
      data: {
        userId,
        nudgePlanId: dto.nudgePlanId || null,
        localId: dto.localId,
        start: new Date(dto.start),
        endTime: new Date(dto.endTime),
        activeSeconds: dto.activeSeconds,
        pausedSeconds: dto.pausedSeconds ?? 0,
        distanceMeters: dto.distanceMeters,
        steps: dto.steps ?? 0,
        calories: dto.calories,
        usedLocation: dto.usedLocation ?? false,
      },
    });

    // If linked to a plan, mark it completed
    if (dto.nudgePlanId) {
      try {
        await this.prisma.nudgePlan.update({
          where: { id: dto.nudgePlanId },
          data: { status: 'completed' },
        });
      } catch (e) {
        this.logger.warn(`Could not update nudge plan ${dto.nudgePlanId}: ${e}`);
      }
    }

    return session;
  }

  async query(userId: string, query: QueryWalkSessionsDto) {
    const where: any = { userId };

    if (query.startDate || query.endDate) {
      where.start = {};
      if (query.startDate) where.start.gte = new Date(query.startDate);
      if (query.endDate) where.start.lte = new Date(query.endDate);
    }

    return this.prisma.walkSession.findMany({
      where,
      orderBy: { start: 'desc' },
      include: { nudgePlan: true },
    });
  }

  async getTodaySessions(userId: string) {
    const now = new Date();
    return this.prisma.walkSession.findMany({
      where: {
        userId,
        start: { gte: startOfDay(now), lte: endOfDay(now) },
      },
      orderBy: { start: 'asc' },
    });
  }

  async getTodayMinutes(userId: string): Promise<number> {
    const sessions = await this.getTodaySessions(userId);
    return sessions.reduce((sum, s) => sum + s.activeSeconds / 60, 0);
  }

  async getTodaySteps(userId: string): Promise<number> {
    const sessions = await this.getTodaySessions(userId);
    return sessions.reduce((sum, s) => sum + s.steps, 0);
  }

  async getTodayStats(userId: string) {
    const sessions = await this.getTodaySessions(userId);
    return {
      sessionCount: sessions.length,
      totalMinutes: sessions.reduce((sum, s) => sum + s.activeSeconds / 60, 0),
      totalSteps: sessions.reduce((sum, s) => sum + s.steps, 0),
      totalDistanceMeters: sessions.reduce(
        (sum, s) => sum + (s.distanceMeters ?? 0),
        0,
      ),
      totalCalories: sessions.reduce(
        (sum, s) => sum + (s.calories ?? 0),
        0,
      ),
    };
  }

  async getAll(userId: string) {
    return this.prisma.walkSession.findMany({
      where: { userId },
      orderBy: { start: 'desc' },
    });
  }
}
