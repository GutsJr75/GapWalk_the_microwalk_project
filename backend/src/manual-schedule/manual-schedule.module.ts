import { Module } from '@nestjs/common';
import { ManualScheduleController } from './manual-schedule.controller';
import { ManualScheduleService } from './manual-schedule.service';

@Module({
  controllers: [ManualScheduleController],
  providers: [ManualScheduleService],
  exports: [ManualScheduleService],
})
export class ManualScheduleModule {}
