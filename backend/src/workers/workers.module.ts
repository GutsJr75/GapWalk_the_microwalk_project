import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NudgeGenerationProcessor } from './nudge-generation.processor';
import { PushSendProcessor } from './push-send.processor';
import { AggregationProcessor } from './aggregation.processor';
import { ReceiptCheckProcessor } from './receipt-check.processor';
import { NudgeEngineModule } from '../nudge-engine/nudge-engine.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkersService } from './workers.service';
import {
  QUEUE_NUDGE_GENERATION,
  QUEUE_PUSH_SEND,
  QUEUE_AGGREGATION,
  QUEUE_RECEIPT_CHECK,
} from './workers.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url', 'redis://localhost:6379'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NUDGE_GENERATION },
      { name: QUEUE_PUSH_SEND },
      { name: QUEUE_AGGREGATION },
      { name: QUEUE_RECEIPT_CHECK },
    ),
    PrismaModule,
    NudgeEngineModule,
    PushNotificationsModule,
    AnalyticsModule,
  ],
  providers: [
    WorkersService,
    NudgeGenerationProcessor,
    PushSendProcessor,
    AggregationProcessor,
    ReceiptCheckProcessor,
  ],
  exports: [WorkersService],
})
export class WorkersModule {}
