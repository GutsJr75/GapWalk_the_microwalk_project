import { Module } from '@nestjs/common';
import { NudgePlansController } from './nudge-plans.controller';
import { NudgePlansService } from './nudge-plans.service';
import { NudgeEngineModule } from '../nudge-engine/nudge-engine.module';

@Module({
  imports: [NudgeEngineModule],
  controllers: [NudgePlansController],
  providers: [NudgePlansService],
  exports: [NudgePlansService],
})
export class NudgePlansModule {}
