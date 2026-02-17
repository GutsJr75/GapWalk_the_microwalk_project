import { Module } from '@nestjs/common';
import { WalkSessionsController } from './walk-sessions.controller';
import { WalkSessionsService } from './walk-sessions.service';

@Module({
  controllers: [WalkSessionsController],
  providers: [WalkSessionsService],
  exports: [WalkSessionsService],
})
export class WalkSessionsModule {}
