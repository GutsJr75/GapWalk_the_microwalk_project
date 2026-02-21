import { Module } from '@nestjs/common';
import { BehaviorLogController } from './behavior-log.controller';
import { BehaviorLogService } from './behavior-log.service';

@Module({
  controllers: [BehaviorLogController],
  providers: [BehaviorLogService],
  exports: [BehaviorLogService],
})
export class BehaviorLogModule {}
