import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppSessionDto, SyncAchievementsDto } from './dto/app-sessions.dto';

@Injectable()
export class AppSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── App Sessions ──

  async createAppSession(userId: string, dto: CreateAppSessionDto) {
    return this.prisma.appSession.create({
      data: {
        userId,
        sessionStart: new Date(dto.sessionStart),
        sessionEnd: dto.sessionEnd ? new Date(dto.sessionEnd) : null,
        foregroundSeconds: dto.foregroundSeconds,
        screensVisited: dto.screensVisited
          ? (dto.screensVisited as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        source: dto.source ?? 'cold_start',
      },
    });
  }

  async getUserAppSessions(userId: string, limit = 100) {
    return this.prisma.appSession.findMany({
      where: { userId },
      orderBy: { sessionStart: 'desc' },
      take: limit,
    });
  }

  // ── Achievements ──

  async syncAchievements(userId: string, dto: SyncAchievementsDto) {
    const results = await Promise.all(
      dto.achievements.map((a) =>
        this.prisma.userAchievement.upsert({
          where: { userId_achievementId: { userId, achievementId: a.achievementId } },
          update: {
            notifiedAt: a.notifiedAt ? new Date(a.notifiedAt) : undefined,
          },
          create: {
            userId,
            achievementId: a.achievementId,
            unlockedAt: new Date(a.unlockedAt),
            notifiedAt: a.notifiedAt ? new Date(a.notifiedAt) : null,
          },
        }),
      ),
    );
    return { synced: results.length };
  }

  async getUserAchievements(userId: string) {
    return this.prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
    });
  }
}
