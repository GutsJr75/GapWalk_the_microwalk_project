import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { format, subDays, startOfWeek } from 'date-fns';
import { QUEUE_AGGREGATION } from './workers.module';

@Processor(QUEUE_AGGREGATION)
export class AggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(AggregationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {
    super();
  }

  async process(job: Job) {
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
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const users = await this.prisma.user.findMany({ select: { id: true } });

    this.logger.log(
      `Computing daily aggregation for ${users.length} users, date ${yesterday}`,
    );

    let ok = 0;
    for (const u of users) {
      try {
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
    const weekStart = format(
      startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }),
      'yyyy-MM-dd',
    );
    const users = await this.prisma.user.findMany({ select: { id: true } });

    this.logger.log(
      `Computing weekly aggregation for ${users.length} users, week ${weekStart}`,
    );

    let ok = 0;
    for (const u of users) {
      try {
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
