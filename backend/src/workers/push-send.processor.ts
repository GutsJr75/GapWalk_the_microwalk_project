import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { QUEUE_PUSH_SEND } from './workers.constants';

interface PushSendJobData {
  nudgePlanId?: string;
}

@Processor(QUEUE_PUSH_SEND)
export class PushSendProcessor extends WorkerHost {
  private readonly logger = new Logger(PushSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushNotificationsService,
  ) {
    super();
  }

  async process(job: Job<PushSendJobData>) {
    const { name, data } = job;

    if (name === 'send-nudge') {
      return this.sendNudge(data.nudgePlanId!);
    }

    if (name === 'send-due-nudges') {
      return this.pushService.sendDueNudges();
    }

    this.logger.warn(`Unknown job name: ${name}`);
  }

  private async sendNudge(nudgePlanId: string) {
    const plan = await this.prisma.nudgePlan.findUnique({
      where: { id: nudgePlanId },
    });
    if (!plan) {
      this.logger.warn(`NudgePlan ${nudgePlanId} not found`);
      return;
    }

    if (plan.status !== 'planned' && plan.status !== 'notified') {
      this.logger.log(`NudgePlan ${nudgePlanId} is ${plan.status}, skipping`);
      return;
    }

    const title = '🚶 Time for a walk!';
    const body = `Your ${plan.suggestedDurationMinutes}-minute micro-walk is scheduled now.`;

    const pushResult = await this.pushService.sendWalkNudge(
      plan.userId,
      nudgePlanId,
      plan.localId ?? nudgePlanId,
      title,
      body,
    );

    if (!pushResult.firstSuccessTicketId) {
      this.logger.warn(`No backup push sent for plan ${nudgePlanId}`);
      return;
    }

    await this.prisma.nudgePlan.update({
      where: { id: nudgePlanId },
      data: {
        pushTicketId: pushResult.firstSuccessTicketId,
        pushSentAt: new Date(),
      },
    });

    this.logger.log(`Push sent for plan ${nudgePlanId}`);
  }
}
