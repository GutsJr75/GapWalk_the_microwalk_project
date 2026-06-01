import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HealthModule } from './health/health.module';

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
import { WorkersModule } from './workers/workers.module';
import { AppSessionsModule } from './app-sessions/app-sessions.module';
import { ThrottlerBehindProxyGuard } from './common/guards/throttler-behind-proxy.guard';

const enableWorkers =
  process.env.ENABLE_WORKERS !== 'false' && process.env.NODE_ENV !== 'test';
const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const rateLimitTtlMs = toPositiveInt(process.env.RATE_LIMIT_TTL_MS, 60_000);
const rateLimitMax = toPositiveInt(process.env.RATE_LIMIT_MAX, 120);
const rateLimitBlockDurationMs = toPositiveInt(
  process.env.RATE_LIMIT_BLOCK_DURATION_MS,
  60_000,
);

@Module({
  imports: [
    // Infrastructure
    ConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: rateLimitTtlMs,
        limit: rateLimitMax,
        blockDuration: rateLimitBlockDurationMs,
      },
    ]),
    PrismaModule,
    AuthModule,
    HealthModule,

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
    AppSessionsModule,
    ...(enableWorkers ? [WorkersModule] : []),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
