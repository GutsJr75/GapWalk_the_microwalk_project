import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBusyEventDto,
  SetScheduleSourceDto,
  QueryEventsDto,
} from './dto/schedule.dto';
import { ScheduleSourceType } from '@prisma/client';

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Schedule Source ──

  async getScheduleSource(userId: string) {
    return this.prisma.scheduleSource.findUnique({ where: { userId } });
  }

  async setScheduleSource(userId: string, dto: SetScheduleSourceDto) {
    return this.prisma.scheduleSource.upsert({
      where: { userId },
      update: {
        type: dto.type,
        filename: dto.filename,
        googleAccessToken: dto.googleAccessToken,
        googleRefreshToken: dto.googleRefreshToken,
        lastImportedAt: new Date(),
      },
      create: {
        userId,
        type: dto.type,
        filename: dto.filename,
        googleAccessToken: dto.googleAccessToken,
        googleRefreshToken: dto.googleRefreshToken,
        lastImportedAt: new Date(),
      },
    });
  }

  async clearScheduleSource(userId: string) {
    const source = await this.prisma.scheduleSource.findUnique({
      where: { userId },
    });
    if (!source) throw new NotFoundException('No schedule source found');
    return this.prisma.scheduleSource.delete({ where: { userId } });
  }

  // ── Busy Events ──

  async getEvents(userId: string, query: QueryEventsDto) {
    const where: any = { userId };

    if (query.source) {
      where.source = query.source;
    }

    if (query.startDate || query.endDate) {
      where.start = {};
      if (query.startDate) where.start.gte = new Date(query.startDate);
      if (query.endDate) where.start.lte = new Date(query.endDate);
    }

    return this.prisma.busyEvent.findMany({
      where,
      orderBy: { start: 'asc' },
    });
  }

  async createEvent(userId: string, dto: CreateBusyEventDto) {
    return this.prisma.busyEvent.create({
      data: {
        userId,
        localId: dto.localId,
        title: dto.title,
        start: new Date(dto.start),
        endTime: new Date(dto.endTime),
        source: dto.source,
        isAllDay: dto.isAllDay ?? false,
      },
    });
  }

  async bulkCreateEvents(userId: string, events: CreateBusyEventDto[]) {
    const data = events.map((dto) => ({
      userId,
      localId: dto.localId,
      title: dto.title,
      start: new Date(dto.start),
      endTime: new Date(dto.endTime),
      source: dto.source,
      isAllDay: dto.isAllDay ?? false,
    }));

    return this.prisma.busyEvent.createMany({ data });
  }

  async deleteBySource(userId: string, source: ScheduleSourceType) {
    return this.prisma.busyEvent.deleteMany({
      where: { userId, source },
    });
  }

  async deleteAllEvents(userId: string) {
    return this.prisma.busyEvent.deleteMany({ where: { userId } });
  }

  async getEventCount(userId: string) {
    return this.prisma.busyEvent.count({ where: { userId } });
  }
}
