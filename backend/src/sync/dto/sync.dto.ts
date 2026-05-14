import {
  IsOptional,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { NudgePlanStatus, ScheduleSourceType, WhenToNotify, StrictnessMode, AppOpenSource } from '@prisma/client';

// ── Individual sync item DTOs ──

class SyncBusyEventDto {
  @IsOptional() @IsString() localId?: string;
  @IsString() title: string;
  @IsDateString() start: string;
  @IsDateString() endTime: string;
  @IsEnum(ScheduleSourceType) source: ScheduleSourceType;
  @IsOptional() @IsBoolean() isAllDay?: boolean;
}

class SyncManualEntryDto {
  @IsOptional() @IsString() localId?: string;
  @IsString() title: string;
  @IsInt() dayOfWeek: number;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsOptional() @IsBoolean() isOneTime?: boolean;
  @IsOptional() @IsString() oneTimeDate?: string;
}

class SyncNudgePlanDto {
  @IsOptional() @IsString() localId?: string;
  @IsString() date: string;
  @IsDateString() gapStart: string;
  @IsDateString() gapEnd: string;
  @IsDateString() walkStart: string;
  @IsInt() suggestedDurationMinutes: number;
  @IsOptional() @IsBoolean() notificationsEnabled?: boolean;
  @IsEnum(NudgePlanStatus) status: NudgePlanStatus;
  @IsOptional() @IsString() reason?: string;
}

class SyncWalkPauseEventDto {
  @IsDateString() pauseStartedAt: string;
  @IsOptional() @IsDateString() pauseEndedAt?: string;
  @IsOptional() @IsInt() pauseDurationSeconds?: number;
  @IsOptional() @IsString() pauseSource?: string;
  @IsOptional() @IsString() pauseReason?: string;
}

class SyncWalkRoutePointDto {
  @IsNumber() latitude: number;
  @IsNumber() longitude: number;
  @IsOptional() @IsNumber() accuracyMeters?: number;
  @IsOptional() @IsNumber() altitudeMeters?: number;
  @IsOptional() @IsNumber() speedMps?: number;
  @IsOptional() @IsNumber() bearingDegrees?: number;
  @IsDateString() recordedAt: string;
}

class SyncWalkSessionDto {
  @IsOptional() @IsString() localId?: string;
  @IsOptional() @IsString() nudgePlanId?: string;
  @IsDateString() start: string;
  @IsDateString() endTime: string;
  @IsInt() activeSeconds: number;
  @IsOptional() @IsInt() pausedSeconds?: number;
  @IsOptional() @IsInt() pauseCount?: number;
  @IsOptional() @IsNumber() distanceMeters?: number;
  @IsOptional() @IsInt() steps?: number;
  @IsOptional() @IsNumber() calories?: number;
  @IsOptional() @IsNumber() maxSpeedMps?: number;
  @IsOptional() @IsNumber() avgSpeedMps?: number;
  @IsOptional() @IsNumber() elevationGainMeters?: number;
  @IsOptional() @IsBoolean() usedLocation?: boolean;
  @IsOptional() @IsString() stepSource?: string;
  @IsOptional() @IsString() motionConfidence?: string;
  @IsOptional() @IsString() sensorHealthAtStart?: string;
  @IsOptional() @IsBoolean() wasRecovered?: boolean;
  @IsOptional() @IsInt() nudgeToStartLatencySeconds?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SyncWalkPauseEventDto)
  pauseEvents?: SyncWalkPauseEventDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SyncWalkRoutePointDto)
  routePoints?: SyncWalkRoutePointDto[];
}

class SyncPreferencesDto {
  @IsOptional() @IsInt() dailyTargetMinutes?: number;
  @IsOptional() @IsInt() bufferMinutes?: number;
  @IsOptional() @IsInt() notificationCountPerDay?: number;
  @IsOptional() @IsInt() notificationMinGapMinutes?: number;
  @IsOptional() @IsString() quietHoursStart?: string;
  @IsOptional() @IsString() quietHoursEnd?: string;
  @IsOptional() @IsInt() minWalkMinutes?: number;
  @IsOptional() @IsInt() gracePeriodMinutes?: number;
  @IsOptional() @IsEnum(WhenToNotify) whenToNotify?: WhenToNotify;
  @IsOptional() @IsInt() notifyDelayMinutes?: number;
  @IsOptional() @IsEnum(StrictnessMode) strictnessMode?: StrictnessMode;
  @IsOptional() @IsBoolean() stepGoalEnabled?: boolean;
  @IsOptional() @IsInt() stepGoal?: number;
  @IsOptional() preferredWalkingPeriods?: Array<{ start: string; end: string }>;
}

class SyncScheduleSourceDto {
  @IsEnum(ScheduleSourceType) type: ScheduleSourceType;
  @IsOptional() @IsString() filename?: string;
  @IsOptional() @IsBoolean() googleConnected?: boolean;
}

class SyncAnalyticsEventDto {
  @IsString() name: string;
  @IsOptional() payload?: any;
  @IsOptional() @IsDateString() clientCreatedAt?: string;
}

class SyncCrashReportDto {
  @IsString() message: string;
  @IsOptional() @IsString() stack?: string;
  @IsOptional() @IsBoolean() isFatal?: boolean;
  @IsOptional() context?: any;
  @IsOptional() @IsDateString() clientCreatedAt?: string;
  @IsOptional() @IsBoolean() wasWalkInProgress?: boolean;
  @IsOptional() @IsString() recoveredSessionId?: string;
  @IsOptional() @IsString() appState?: string;
}

class SyncAchievementDto {
  @IsString() achievementId: string;
  @IsDateString() unlockedAt: string;
  @IsOptional() @IsDateString() notifiedAt?: string;
}

class SyncAppSessionDto {
  @IsDateString() sessionStart: string;
  @IsOptional() @IsDateString() sessionEnd?: string;
  @IsOptional() @IsInt() foregroundSeconds?: number;
  @IsOptional() screensVisited?: string[];
  @IsOptional() @IsEnum(AppOpenSource) source?: AppOpenSource;
}

export class SyncUserProfileDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() displayName?: string;
}

// ── Main sync request ──

export class SyncRequestDto {
  @ApiPropertyOptional({ description: 'ISO timestamp of last successful sync' })
  @IsOptional()
  @IsDateString()
  lastSyncedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncUserProfileDto)
  userProfile?: SyncUserProfileDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncScheduleSourceDto)
  scheduleSource?: SyncScheduleSourceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncPreferencesDto)
  preferences?: SyncPreferencesDto;

  @ApiPropertyOptional({ type: [SyncBusyEventDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SyncBusyEventDto)
  busyEvents?: SyncBusyEventDto[];

  @ApiPropertyOptional({ type: [SyncManualEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => SyncManualEntryDto)
  manualScheduleEntries?: SyncManualEntryDto[];

  @ApiPropertyOptional({ type: [SyncNudgePlanDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => SyncNudgePlanDto)
  nudgePlans?: SyncNudgePlanDto[];

  @ApiPropertyOptional({ type: [SyncWalkSessionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SyncWalkSessionDto)
  walkSessions?: SyncWalkSessionDto[];

  @ApiPropertyOptional({ type: [SyncAnalyticsEventDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SyncAnalyticsEventDto)
  analyticsEvents?: SyncAnalyticsEventDto[];

  @ApiPropertyOptional({ type: [SyncCrashReportDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SyncCrashReportDto)
  crashReports?: SyncCrashReportDto[];

  @ApiPropertyOptional({ type: [SyncAchievementDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncAchievementDto)
  achievements?: SyncAchievementDto[];

  @ApiPropertyOptional({ type: [SyncAppSessionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SyncAppSessionDto)
  appSessions?: SyncAppSessionDto[];
}
