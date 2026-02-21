import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManualEntryDto } from './dto/manual-schedule.dto';
import { addDays, startOfDay, parse, isBefore, addWeeks } from 'date-fns';
import { TZDate } from '@date-fns/tz';

const DEFAULT_TIMEZONE = 'America/New_York';

export interface ManualBusyEvent {
  userId: string;
  title: string;
  start: Date;
  endTime: Date;
  source: 'manual';
  isAllDay: boolean;
}

@Injectable()
export class ManualScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone ?? DEFAULT_TIMEZONE;
  }

  async getAll(userId: string) {
    return this.prisma.manualScheduleEntry.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateManualEntryDto) {
    return this.prisma.manualScheduleEntry.create({
      data: {
        userId,
        localId: dto.localId,
        title: dto.title,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isOneTime: dto.isOneTime ?? false,
        oneTimeDate: dto.oneTimeDate,
      },
    });
  }

  async bulkSave(userId: string, entries: CreateManualEntryDto[]) {
    // Replace all entries for this user
    await this.prisma.manualScheduleEntry.deleteMany({ where: { userId } });

    if (entries.length === 0) return { count: 0 };

    const data = entries.map((dto) => ({
      userId,
      localId: dto.localId,
      title: dto.title,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      isOneTime: dto.isOneTime ?? false,
      oneTimeDate: dto.oneTimeDate,
    }));

    const result = await this.prisma.manualScheduleEntry.createMany({ data });
    return { count: result.count };
  }

  async deleteAll(userId: string) {
    return this.prisma.manualScheduleEntry.deleteMany({ where: { userId } });
  }

  async count(userId: string) {
    return this.prisma.manualScheduleEntry.count({ where: { userId } });
  }

  /**
   * Generate BusyEvents from manual schedule template for the next N weeks.
   * Same logic as frontend manualScheduleGenerator.ts
   */
  async generateBusyEventsFromTemplate(userId: string, weeksAhead = 4) {
    const entries = await this.getAll(userId);
    if (entries.length === 0) return [];

    const tz = await this.getUserTimezone(userId);
    const today = startOfDay(new TZDate(new Date(), tz));
    const rangeEnd = addWeeks(today, weeksAhead);

    const busyEvents: ManualBusyEvent[] = [];

    for (const entry of entries) {
      if (entry.isOneTime && entry.oneTimeDate) {
        const entryDate = parse(entry.oneTimeDate, 'yyyy-MM-dd', new Date());
        if (isBefore(entryDate, today) || !isBefore(entryDate, rangeEnd))
          continue;

        const eventStart = parse(entry.startTime, 'HH:mm', entryDate);
        const eventEnd = parse(entry.endTime, 'HH:mm', entryDate);

        busyEvents.push({
          userId: userId,
          title: entry.title,
          start: eventStart,
          endTime: eventEnd,
          source: 'manual',
          isAllDay: false,
        });
      } else {
        let cursor = today;
        while (isBefore(cursor, rangeEnd)) {
          if (cursor.getDay() === entry.dayOfWeek) {
            const eventStart = parse(entry.startTime, 'HH:mm', cursor);
            const eventEnd = parse(entry.endTime, 'HH:mm', cursor);

            busyEvents.push({
              userId: userId,
              title: entry.title,
              start: eventStart,
              endTime: eventEnd,
              source: 'manual',
              isAllDay: false,
            });
          }
          cursor = addDays(cursor, 1);
        }
      }
    }

    await this.prisma.busyEvent.deleteMany({
      where: { userId: userId, source: 'manual' },
    });

    if (busyEvents.length > 0) {
      await this.prisma.busyEvent.createMany({ data: busyEvents });
    }

    return busyEvents;
  }
}
