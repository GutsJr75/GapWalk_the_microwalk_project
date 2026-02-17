import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NUDGE_GENERATION,
  QUEUE_PUSH_SEND,
  QUEUE_AGGREGATION,
  QUEUE_RECEIPT_CHECK,
} from './workers.module';

/**
 * Service to enqueue background jobs and set up recurring schedules.
 */
@Injectable()
export class WorkersService implements OnModuleInit {
  private readonly logger = new Logger(WorkersService.name);

  constructor(
    @InjectQueue(QUEUE_NUDGE_GENERATION)
    private readonly nudgeQueue: Queue,
    @InjectQueue(QUEUE_PUSH_SEND)
    private readonly pushQueue: Queue,
    @InjectQueue(QUEUE_AGGREGATION)
    private readonly aggQueue: Queue,
    @InjectQueue(QUEUE_RECEIPT_CHECK)
    private readonly receiptQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.setupRepeatingJobs();
  }

  /**
   * Register cron-style repeating jobs.
   */
  private async setupRepeatingJobs() {
    // Generate daily nudge plans at 06:00 every day
    await this.nudgeQueue.upsertJobScheduler(
      'daily-nudge-generation',
      { pattern: '0 6 * * *' },
      { name: 'generate-all-users', data: {} },
    );
    this.logger.log('Scheduled: daily nudge generation at 06:00');

    // Check push receipts every 15 minutes
    await this.receiptQueue.upsertJobScheduler(
      'receipt-check',
      { pattern: '*/15 * * * *' },
      { name: 'check-receipts', data: {} },
    );
    this.logger.log('Scheduled: push receipt check every 15 min');

    // Compute daily aggregations at 02:00
    await this.aggQueue.upsertJobScheduler(
      'daily-aggregation',
      { pattern: '0 2 * * *' },
      { name: 'compute-daily', data: {} },
    );
    this.logger.log('Scheduled: daily aggregation at 02:00');

    // Compute weekly aggregations every Monday at 03:00
    await this.aggQueue.upsertJobScheduler(
      'weekly-aggregation',
      { pattern: '0 3 * * 1' },
      { name: 'compute-weekly', data: {} },
    );
    this.logger.log('Scheduled: weekly aggregation Mon 03:00');
  }

  // ───── Ad-hoc job enqueuing ─────

  async enqueueNudgeGeneration(userId: string, date: string) {
    return this.nudgeQueue.add('generate-for-user', { userId, date });
  }

  async enqueuePushSend(nudgePlanId: string) {
    return this.pushQueue.add('send-nudge', { nudgePlanId });
  }

  async enqueueAggregation(userId: string, date: string) {
    return this.aggQueue.add('compute-daily', { userId, date });
  }
}
