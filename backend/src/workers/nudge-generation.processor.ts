import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NudgeEngineService } from '../nudge-engine/nudge-engine.service';
import { format } from 'date-fns';
import { QUEUE_NUDGE_GENERATION } from './workers.module';

@Processor(QUEUE_NUDGE_GENERATION)
export class NudgeGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(NudgeGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nudgeEngine: NudgeEngineService,
  ) {
    super();
  }

  async process(job: Job) {
    const { name, data } = job;

    if (name === 'generate-all-users') {
      return this.generateForAllUsers();
    }

    if (name === 'generate-for-user') {
      return this.generateForUser(data.userId, data.date);
    }

    this.logger.warn(`Unknown job name: ${name}`);
  }

  private async generateForAllUsers() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const users = await this.prisma.user.findMany({
      select: { id: true },
    });

    this.logger.log(
      `Generating nudge plans for ${users.length} users on ${today}`,
    );

    let success = 0;
    let failed = 0;

    for (const user of users) {
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

    this.logger.log(
      `Nudge generation complete: ${success} ok, ${failed} failed`,
    );
    return { success, failed, total: users.length };
  }

  private async generateForUser(userId: string, date: string) {
    this.logger.log(`Generating nudge plans for user ${userId} on ${date}`);
    return this.nudgeEngine.generateAndSavePlans(userId);
  }
}
