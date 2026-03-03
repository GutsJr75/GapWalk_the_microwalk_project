import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { format, subDays, startOfWeek } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { QUEUE_AGGREGATION } from './workers.constants';

interface AggregationJobData {
  userId?: string;
  date?: string;
}

@Processor(QUEUE_AGGREGATION)
export class AggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(AggregationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {
    super();
  }

  async process(job: Job<AggregationJobData>) {
    const { name, data } = job;

    if (name === 'compute-daily') {
      if (data?.userId && data?.date) {
        return this.computeDaily(data.userId, data.date);
      }
      return this.computeDailyAll();
    }

    if (name === 'compute-weekly') {
      return this.computeWeeklyAll();
    }

    this.logger.warn(`Unknown job name: ${name}`);
  }

  private async computeDaily(userId: string, date: string) {
    return this.analyticsService.computeDailyAggregation(userId, date);
  }

  private async computeDailyAll() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, timezone: true },
    });

    this.logger.log(`Computing daily aggregation for ${users.length} users`);

    let ok = 0;
    for (const u of users) {
      try {
        const tz = u.timezone ?? 'America/New_York';
        const yesterday = format(
          subDays(new TZDate(new Date(), tz), 1),
          'yyyy-MM-dd',
        );
        await this.analyticsService.computeDailyAggregation(u.id, yesterday);
        ok++;
      } catch (err) {
        this.logger.error(
          `Daily agg failed for ${u.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Daily aggregation done: ${ok}/${users.length}`);
    return { processed: ok, total: users.length };
  }

  private async computeWeeklyAll() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, timezone: true },
    });

    this.logger.log(`Computing weekly aggregation for ${users.length} users`);

    let ok = 0;
    for (const u of users) {
      try {
        const tz = u.timezone ?? 'America/New_York';
        const weekStart = format(
          startOfWeek(subDays(new TZDate(new Date(), tz), 7), {
            weekStartsOn: 1,
          }),
          'yyyy-MM-dd',
        );
        await this.analyticsService.computeWeeklyAggregation(u.id, weekStart);
        ok++;
      } catch (err) {
        this.logger.error(
          `Weekly agg failed for ${u.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Weekly aggregation done: ${ok}/${users.length}`);
    return { processed: ok, total: users.length };
  }
}
