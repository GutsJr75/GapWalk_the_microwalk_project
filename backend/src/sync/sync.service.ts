import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncRequestDto } from './dto/sync.dto';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full bidirectional sync.
   * Client sends all data changed since lastSyncedAt.
   * Server merges (last-write-wins), then returns latest server state.
   */
  async sync(userId: string, dto: SyncRequestDto) {
    const syncTimestamp = new Date();

    // ── 1. Ingest client data ──

    // Schedule source
    if (dto.scheduleSource) {
      await this.prisma.scheduleSource.upsert({
        where: { userId },
        update: {
          type: dto.scheduleSource.type,
          filename: dto.scheduleSource.filename,
          lastImportedAt: syncTimestamp,
        },
        create: {
          userId,
          type: dto.scheduleSource.type,
          filename: dto.scheduleSource.filename,
          lastImportedAt: syncTimestamp,
        },
      });
    }

    // Preferences
    if (dto.preferences) {
      await this.prisma.preference.upsert({
        where: { userId },
        update: dto.preferences as any,
        create: { userId, ...dto.preferences } as any,
      });
    }

    // Busy events (append new, skip duplicates by localId)
    if (dto.busyEvents && dto.busyEvents.length > 0) {
      for (const event of dto.busyEvents) {
        if (event.localId) {
          const exists = await this.prisma.busyEvent.findFirst({
            where: { userId, localId: event.localId },
          });
          if (exists) continue;
        }
        await this.prisma.busyEvent.create({
          data: {
            userId,
            localId: event.localId,
            title: event.title,
            start: new Date(event.start),
            endTime: new Date(event.endTime),
            source: event.source,
            isAllDay: event.isAllDay ?? false,
          },
        });
      }
    }

    // Manual schedule entries (replace all)
    if (dto.manualScheduleEntries && dto.manualScheduleEntries.length > 0) {
      await this.prisma.manualScheduleEntry.deleteMany({ where: { userId } });
      await this.prisma.manualScheduleEntry.createMany({
        data: dto.manualScheduleEntries.map((e) => ({
          userId,
          localId: e.localId,
          title: e.title,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          isOneTime: e.isOneTime ?? false,
          oneTimeDate: e.oneTimeDate,
        })),
      });
    }

    // Nudge plans (upsert by localId)
    if (dto.nudgePlans && dto.nudgePlans.length > 0) {
      for (const plan of dto.nudgePlans) {
        if (plan.localId) {
          const existing = await this.prisma.nudgePlan.findFirst({
            where: { userId, localId: plan.localId },
          });
          if (existing) {
            // Last-write-wins: update status
            await this.prisma.nudgePlan.update({
              where: { id: existing.id },
              data: {
                status: plan.status,
                reason: plan.reason,
              },
            });
            continue;
          }
        }

        await this.prisma.nudgePlan.create({
          data: {
            userId,
            localId: plan.localId,
            date: plan.date,
            gapStart: new Date(plan.gapStart),
            gapEnd: new Date(plan.gapEnd),
            walkStart: new Date(plan.walkStart),
            suggestedDurationMinutes: plan.suggestedDurationMinutes,
            status: plan.status,
            reason: plan.reason,
            origin: 'local_fallback',
          },
        });
      }
    }

    // Walk sessions (append new, skip duplicates by localId)
    if (dto.walkSessions && dto.walkSessions.length > 0) {
      for (const session of dto.walkSessions) {
        if (session.localId) {
          const exists = await this.prisma.walkSession.findFirst({
            where: { userId, localId: session.localId },
          });
          if (exists) continue;
        }

        await this.prisma.walkSession.create({
          data: {
            userId,
            localId: session.localId,
            nudgePlanId: session.nudgePlanId || null,
            start: new Date(session.start),
            endTime: new Date(session.endTime),
            activeSeconds: session.activeSeconds,
            pausedSeconds: session.pausedSeconds ?? 0,
            distanceMeters: session.distanceMeters,
            steps: session.steps ?? 0,
            calories: session.calories,
            usedLocation: session.usedLocation ?? false,
          },
        });
      }
    }

    // Analytics events (always append)
    if (dto.analyticsEvents && dto.analyticsEvents.length > 0) {
      await this.prisma.analyticsEvent.createMany({
        data: dto.analyticsEvents.map((e) => ({
          userId,
          name: e.name,
          payload: e.payload ?? null,
          clientCreatedAt: e.clientCreatedAt
            ? new Date(e.clientCreatedAt)
            : null,
        })),
      });
    }

    // Crash reports (always append)
    if (dto.crashReports && dto.crashReports.length > 0) {
      await this.prisma.crashReport.createMany({
        data: dto.crashReports.map((r) => ({
          userId,
          message: r.message,
          stack: r.stack,
          isFatal: r.isFatal ?? false,
          context: r.context ?? null,
          clientCreatedAt: r.clientCreatedAt
            ? new Date(r.clientCreatedAt)
            : null,
        })),
      });
    }

    // ── 2. Update user sync timestamp ──
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSyncedAt: syncTimestamp },
    });

    // ── 3. Return server state ──
    const lastSyncedAt = dto.lastSyncedAt
      ? new Date(dto.lastSyncedAt)
      : new Date(0);

    const [
      scheduleSource,
      preferences,
      busyEvents,
      manualScheduleEntries,
      nudgePlans,
      walkSessions,
    ] = await Promise.all([
      this.prisma.scheduleSource.findUnique({ where: { userId } }),
      this.prisma.preference.findUnique({ where: { userId } }),
      this.prisma.busyEvent.findMany({
        where: { userId, createdAt: { gt: lastSyncedAt } },
        orderBy: { start: 'asc' },
      }),
      this.prisma.manualScheduleEntry.findMany({
        where: { userId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.nudgePlan.findMany({
        where: { userId, updatedAt: { gt: lastSyncedAt } },
        orderBy: { walkStart: 'asc' },
      }),
      this.prisma.walkSession.findMany({
        where: { userId, createdAt: { gt: lastSyncedAt } },
        orderBy: { start: 'desc' },
      }),
    ]);

    return {
      syncedAt: syncTimestamp.toISOString(),
      scheduleSource,
      preferences,
      busyEvents,
      manualScheduleEntries,
      nudgePlans,
      walkSessions,
    };
  }
}
