import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardSpaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Top-level overview statistics for the researcher dashboard.
   */
  async getOverview() {
    const [totalUsers, totalSessions, totalPlans, activeStudies, sessionAgg] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.walkSession.count(),
        this.prisma.nudgePlan.count(),
        this.prisma.study.count({ where: { isActive: true } }),
        this.prisma.walkSession.aggregate({
          _sum: { activeSeconds: true, steps: true },
        }),
      ]);

    return {
      totalUsers,
      totalSessions,
      totalPlans,
      activeStudies,
      totalMinutesWalked: Math.round(
        (sessionAgg._sum?.activeSeconds ?? 0) / 60,
      ),
      totalSteps: sessionAgg._sum?.steps ?? 0,
    };
  }

  /**
   * Daily walk session counts for the last N days (default 30).
   */
  async getDailyActivity(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await this.prisma.dailyAggregation.findMany({
      where: { date: { gte: since.toISOString().slice(0, 10) } },
      orderBy: { date: 'asc' },
    });

    // Aggregate across users per day
    const byDate = new Map<
      string,
      { minutes: number; sessions: number; steps: number }
    >();
    for (const r of rows) {
      const existing = byDate.get(r.date) ?? {
        minutes: 0,
        sessions: 0,
        steps: 0,
      };
      existing.minutes += r.totalActiveMinutes;
      existing.sessions += r.sessionCount;
      existing.steps += r.totalSteps;
      byDate.set(r.date, existing);
    }

    return Array.from(byDate.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  /**
   * Nudge adherence: how many nudges were planned vs completed vs skipped vs missed.
   */
  async getNudgeAdherence() {
    const groups = await this.prisma.nudgePlan.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const result: Record<string, number> = {};
    for (const g of groups) {
      result[g.status] = g._count._all;
    }
    return result;
  }

  /**
   * Per-user leaderboard: top walkers by total minutes.
   */
  async getLeaderboard(limit = 20) {
    const agg = await this.prisma.walkSession.groupBy({
      by: ['userId'],
      _sum: { activeSeconds: true, steps: true },
      _count: { _all: true },
      orderBy: { _sum: { activeSeconds: 'desc' } },
      take: limit,
    });

    const userIds = agg.map((a) => a.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return agg.map((a) => ({
      userId: a.userId,
      displayName: userMap.get(a.userId)?.displayName ?? null,
      email: userMap.get(a.userId)?.email ?? null,
      totalMinutes: Math.round((a._sum?.activeSeconds ?? 0) / 60),
      totalSteps: a._sum?.steps ?? 0,
      sessionCount: a._count._all,
    }));
  }
}
