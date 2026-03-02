import { Module } from '@nestjs/common';
import { AppSessionsController } from './app-sessions.controller';
import { AppSessionsService } from './app-sessions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppSessionsController],
  providers: [AppSessionsService],
  exports: [AppSessionsService],
})
export class AppSessionsModule {}
