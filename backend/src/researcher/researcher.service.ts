import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudyDto, UpdateStudyDto } from './dto/researcher.dto';

@Injectable()
export class ResearcherService {
  constructor(private readonly prisma: PrismaService) {}

  // ───── STUDY CRUD ─────

  async createStudy(dto: CreateStudyDto) {
    return this.prisma.study.create({
      data: {
        name: dto.name,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        config: dto.config ?? Prisma.JsonNull,
      },
    });
  }

  async findAllStudies() {
    return this.prisma.study.findMany({
      include: {
        enrollments: { select: { id: true, userId: true, isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findStudy(studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      include: {
        enrollments: {
          include: {
            user: {
              select: { id: true, email: true, displayName: true, role: true },
            },
          },
        },
      },
    });
    if (!study) throw new NotFoundException('Study not found');
    return study;
  }

  async updateStudy(studyId: string, dto: UpdateStudyDto) {
    const data: Prisma.StudyUpdateInput = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    return this.prisma.study.update({ where: { id: studyId }, data });
  }

  async deleteStudy(studyId: string) {
    return this.prisma.study.delete({ where: { id: studyId } });
  }

  // ───── ENROLLMENT ─────

  async enrollParticipant(studyId: string, userId: string) {
    return this.prisma.studyEnrollment.upsert({
      where: { studyId_userId: { studyId, userId } },
      create: { studyId, userId },
      update: { isActive: true, withdrawnAt: null },
    });
  }

  async withdrawParticipant(studyId: string, userId: string) {
    return this.prisma.studyEnrollment.update({
      where: { studyId_userId: { studyId, userId } },
      data: { isActive: false, withdrawnAt: new Date() },
    });
  }

  // ───── DATA EXPORT ─────

  /**
   * Export all relevant data for participants enrolled in a given study.
   */
  async exportStudyData(studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      include: { enrollments: { where: { isActive: true } } },
    });
    if (!study) throw new NotFoundException('Study not found');

    const userIds = study.enrollments.map((e) => e.userId);

    const [
      users,
      walkSessions,
      nudgePlans,
      behaviorLogs,
      dailyAggs,
      weeklyAggs,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, displayName: true, createdAt: true },
      }),
      this.prisma.walkSession.findMany({
        where: { userId: { in: userIds } },
        orderBy: { start: 'desc' },
      }),
      this.prisma.nudgePlan.findMany({
        where: { userId: { in: userIds } },
        orderBy: { walkStart: 'desc' },
      }),
      this.prisma.behaviorLog.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dailyAggregation.findMany({
        where: { userId: { in: userIds } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.weeklyAggregation.findMany({
        where: { userId: { in: userIds } },
        orderBy: { weekStart: 'desc' },
      }),
    ]);

    return {
      study: {
        id: study.id,
        name: study.name,
        startDate: study.startDate,
        endDate: study.endDate,
      },
      participantCount: userIds.length,
      users,
      walkSessions,
      nudgePlans,
      behaviorLogs,
      dailyAggregations: dailyAggs,
      weeklyAggregations: weeklyAggs,
    };
  }

  /**
   * Per-participant summary for a study: walk totals, nudge adherence, etc.
   */
  async getParticipantSummaries(studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      include: {
        enrollments: { where: { isActive: true }, include: { user: true } },
      },
    });
    if (!study) throw new NotFoundException('Study not found');

    const summaries = await Promise.all(
      study.enrollments.map(async (enrollment) => {
        const uid = enrollment.userId;

        const [sessionAgg, nudgeCounts] = await Promise.all([
          this.prisma.walkSession.aggregate({
            where: { userId: uid },
            _sum: {
              activeSeconds: true,
              steps: true,
              distanceMeters: true,
              calories: true,
            },
            _count: { _all: true },
          }),
          this.prisma.nudgePlan.groupBy({
            by: ['status'],
            where: { userId: uid },
            _count: { _all: true },
          }),
        ]);

        const nudgeMap: Record<string, number> = {};
        for (const g of nudgeCounts) {
          nudgeMap[g.status] = g._count._all;
        }

        return {
          userId: uid,
          email: enrollment.user.email,
          displayName: enrollment.user.displayName,
          enrolledAt: enrollment.enrolledAt,
          totalSessions: sessionAgg._count?._all ?? 0,
          totalMinutes: Math.round((sessionAgg._sum?.activeSeconds ?? 0) / 60),
          totalSteps: sessionAgg._sum?.steps ?? 0,
          totalDistanceMeters: sessionAgg._sum?.distanceMeters ?? 0,
          nudgePlanned: nudgeMap['planned'] ?? 0,
          nudgeCompleted: nudgeMap['completed'] ?? 0,
          nudgeSkipped: nudgeMap['skipped'] ?? 0,
          nudgeMissed: nudgeMap['cancelled'] ?? 0,
        };
      }),
    );

    return summaries;
  }
}
