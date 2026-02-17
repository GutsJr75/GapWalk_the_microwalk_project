import { Module } from '@nestjs/common';
import { ResearcherController } from './researcher.controller';
import { ResearcherService } from './researcher.service';

@Module({
  controllers: [ResearcherController],
  providers: [ResearcherService],
  exports: [ResearcherService],
})
export class ResearcherModule {}
