import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWalkSessionDto,
  QueryWalkSessionsDto,
} from './dto/walk-sessions.dto';
import { startOfDay, endOfDay } from 'date-fns';
import { TZDate } from '@date-fns/tz';

const DEFAULT_TIMEZONE = 'America/New_York';

@Injectable()
export class WalkSessionsService {
  private readonly logger = new Logger(WalkSessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone ?? DEFAULT_TIMEZONE;
  }

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
        pauseCount: dto.pauseCount ?? 0,
        distanceMeters: dto.distanceMeters,
        steps: dto.steps ?? 0,
        calories: dto.calories,
        maxSpeedMps: dto.maxSpeedMps,
        avgSpeedMps: dto.avgSpeedMps,
        elevationGainMeters: dto.elevationGainMeters,
        usedLocation: dto.usedLocation ?? false,
        stepSource: dto.stepSource,
        motionConfidence: dto.motionConfidence,
        sensorHealthAtStart: dto.sensorHealthAtStart,
        wasRecovered: dto.wasRecovered ?? false,
        nudgeToStartLatencySeconds: dto.nudgeToStartLatencySeconds,
      },
    });

    // Persist pause events
    if (dto.pauseEvents && dto.pauseEvents.length > 0) {
      await this.prisma.walkPauseEvent.createMany({
        data: dto.pauseEvents.map((p) => ({
          userId,
          sessionId: session.id,
          pauseStartedAt: new Date(p.pauseStartedAt),
          pauseEndedAt: p.pauseEndedAt ? new Date(p.pauseEndedAt) : null,
          pauseDurationSeconds: p.pauseDurationSeconds,
          pauseSource: p.pauseSource,
          pauseReason: p.pauseReason,
        })),
      });
    }

    // Persist GPS route points
    if (dto.routePoints && dto.routePoints.length > 0) {
      await this.prisma.walkRoutePoint.createMany({
        data: dto.routePoints.map((r) => ({
          userId,
          sessionId: session.id,
          latitude: r.latitude,
          longitude: r.longitude,
          accuracyMeters: r.accuracyMeters,
          altitudeMeters: r.altitudeMeters,
          speedMps: r.speedMps,
          bearingDegrees: r.bearingDegrees,
          recordedAt: new Date(r.recordedAt),
        })),
      });
    }

    // If linked to a plan, mark it completed
    if (dto.nudgePlanId) {
      try {
        await this.prisma.nudgePlan.update({
          where: { id: dto.nudgePlanId },
          data: { status: 'completed' },
        });
      } catch (e) {
        this.logger.warn(
          `Could not update nudge plan ${dto.nudgePlanId}: ${e}`,
        );
      }
    }

    return session;
  }

  async query(userId: string, query: QueryWalkSessionsDto) {
    const where: Prisma.WalkSessionWhereInput = { userId };

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
    const tz = await this.getUserTimezone(userId);
    const nowInTz = new TZDate(new Date(), tz);
    return this.prisma.walkSession.findMany({
      where: {
        userId,
        start: { gte: startOfDay(nowInTz), lte: endOfDay(nowInTz) },
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
      totalCalories: sessions.reduce((sum, s) => sum + (s.calories ?? 0), 0),
    };
  }

  async getAll(userId: string) {
    return this.prisma.walkSession.findMany({
      where: { userId },
      orderBy: { start: 'desc' },
    });
  }

  async getPauseEvents(userId: string, sessionId: string) {
    return this.prisma.walkPauseEvent.findMany({
      where: { userId, sessionId },
      orderBy: { pauseStartedAt: 'asc' },
    });
  }

  async getRoutePoints(userId: string, sessionId: string) {
    return this.prisma.walkRoutePoint.findMany({
      where: { userId, sessionId },
      orderBy: { recordedAt: 'asc' },
    });
  }
}
