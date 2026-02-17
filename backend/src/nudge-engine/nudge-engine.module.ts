import { Module } from '@nestjs/common';
import { NudgeEngineService } from './nudge-engine.service';

@Module({
  providers: [NudgeEngineService],
  exports: [NudgeEngineService],
})
export class NudgeEngineModule {}
