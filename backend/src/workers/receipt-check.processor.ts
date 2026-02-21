import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { QUEUE_RECEIPT_CHECK } from './workers.constants';

@Processor(QUEUE_RECEIPT_CHECK)
export class ReceiptCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptCheckProcessor.name);

  constructor(private readonly pushService: PushNotificationsService) {
    super();
  }

  async process(job: Job) {
    const { name } = job;

    if (name === 'check-receipts') {
      return this.checkReceipts();
    }

    this.logger.warn(`Unknown job name: ${name}`);
  }

  private async checkReceipts() {
    this.logger.log('Checking push notification receipts...');
    const result = await this.pushService.checkReceipts();
    this.logger.log(`Receipt check complete: ${JSON.stringify(result)}`);
    return result;
  }
}
