import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NudgeEngineService } from '../nudge-engine/nudge-engine.service';
import { TZDate } from '@date-fns/tz';
import { QUEUE_NUDGE_GENERATION } from './workers.constants';

interface NudgeGenerationJobData {
  userId?: string;
  date?: string;
}

@Processor(QUEUE_NUDGE_GENERATION)
export class NudgeGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(NudgeGenerationProcessor.name);

  /**
   * How many active users to pull per page when generating plans for everyone.
   * Configurable via NUDGE_GENERATION_BATCH_SIZE so the daily job scales to
   * large user counts without loading every user into memory at once.
   */
  private readonly batchSize = this.resolveBatchSize();

  constructor(
    private readonly prisma: PrismaService,
    private readonly nudgeEngine: NudgeEngineService,
  ) {
    super();
  }

  private resolveBatchSize(): number {
    const parsed = Number.parseInt(
      process.env.NUDGE_GENERATION_BATCH_SIZE ?? '',
      10,
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
  }

  async process(job: Job<NudgeGenerationJobData>) {
    const { name, data } = job;

    if (name === 'generate-all-users') {
      return this.generateForAllUsers();
    }

    if (name === 'generate-for-user') {
      return this.generateForUser(data.userId!, data.date!);
    }

    this.logger.warn(`Unknown job name: ${name}`);
  }

  private async generateForAllUsers() {
    this.logger.log(
      `Generating nudge plans for all active users (batch size ${this.batchSize})`,
    );

    let success = 0;
    let failed = 0;
    let total = 0;
    let cursor: string | undefined;

    // Cursor-based pagination: page through active users by id so the daily
    // job never holds more than `batchSize` users in memory regardless of how
    // large the user base grows.
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: this.batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (users.length === 0) break;

      for (const user of users) {
        total++;
        try {
          await this.nudgeEngine.generateAndSavePlans(user.id);
          success++;
        } catch (err) {
          failed++;
          this.logger.error(
            `Failed for user ${user.id}: ${(err as Error).message}`,
          );
        }
      }

      cursor = users[users.length - 1].id;
      if (users.length < this.batchSize) break;
    }

    this.logger.log(
      `Nudge generation complete: ${success} ok, ${failed} failed, ${total} total`,
    );
    return { success, failed, total };
  }

  private async generateForUser(userId: string, date: string) {
    this.logger.log(`Generating nudge plans for user ${userId} on ${date}`);

    if (date) {
      // Generate for the specific requested date only
      const prefs = await this.prisma.preference.findUnique({
        where: { userId },
      });
      if (!prefs) {
        this.logger.warn(
          `No preferences for user ${userId}, skipping generation`,
        );
        return { success: 0 };
      }

      // Resolve user timezone for consistent date key generation
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      const timezone = user?.timezone ?? 'America/New_York';

      // Construct midnight in the user's timezone so day boundaries are correct
      const targetDate = new TZDate(`${date}T00:00:00`, timezone);
      const dateKey = date;

      // Cancel existing active plans for this date
      await this.prisma.nudgePlan.updateMany({
        where: {
          userId,
          date: dateKey,
          status: { in: ['planned', 'notified'] },
        },
        data: { status: 'cancelled' },
      });

      const plans = await this.nudgeEngine.generatePlansForDate(
        userId,
        targetDate,
        prefs,
        timezone,
      );

      if (plans.length > 0) {
        await this.prisma.nudgePlan.createMany({
          data: plans.map((p) => ({
            id: p.id,
            userId: p.userId,
            date: p.date,
            gapStart: p.gapStart,
            gapEnd: p.gapEnd,
            walkStart: p.walkStart,
            suggestedDurationMinutes: p.suggestedDurationMinutes,
            status: p.status,
            origin: p.origin,
          })),
        });
      }

      return { success: plans.length };
    }

    // Fallback: generate for today + tomorrow
    return this.nudgeEngine.generateAndSavePlans(userId);
  }
}
