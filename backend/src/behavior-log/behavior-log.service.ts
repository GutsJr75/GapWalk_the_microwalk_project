import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBehaviorLogDto } from './dto/behavior-log.dto';

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

}
