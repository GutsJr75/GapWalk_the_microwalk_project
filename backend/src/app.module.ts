import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Infrastructure
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

// Feature modules
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { PreferencesModule } from './preferences/preferences.module';
import { ScheduleModule } from './schedule/schedule.module';
import { ManualScheduleModule } from './manual-schedule/manual-schedule.module';
import { NudgeEngineModule } from './nudge-engine/nudge-engine.module';
import { NudgePlansModule } from './nudge-plans/nudge-plans.module';
import { WalkSessionsModule } from './walk-sessions/walk-sessions.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { SyncModule } from './sync/sync.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BehaviorLogModule } from './behavior-log/behavior-log.module';
import { ResearcherModule } from './researcher/researcher.module';
import { DashboardSpaModule } from './dashboard-spa/dashboard-spa.module';
import { WorkersModule } from './workers/workers.module';

const enableWorkers =
  process.env.ENABLE_WORKERS !== 'false' && process.env.NODE_ENV !== 'test';

@Module({
  imports: [
    // Infrastructure
    ConfigModule,
    PrismaModule,
    AuthModule,

    // Feature modules
    UsersModule,
    DevicesModule,
    PreferencesModule,
    ScheduleModule,
    ManualScheduleModule,
    NudgeEngineModule,
    NudgePlansModule,
    WalkSessionsModule,
    PushNotificationsModule,
    SyncModule,
    AnalyticsModule,
    BehaviorLogModule,
    ResearcherModule,
    DashboardSpaModule,
    ...(enableWorkers ? [WorkersModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
