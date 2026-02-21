import {
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { NudgePlanStatus, ScheduleSourceType } from '@prisma/client';

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
  @IsEnum(NudgePlanStatus) status: NudgePlanStatus;
  @IsOptional() @IsString() reason?: string;
}

class SyncWalkSessionDto {
  @IsOptional() @IsString() localId?: string;
  @IsOptional() @IsString() nudgePlanId?: string;
  @IsDateString() start: string;
  @IsDateString() endTime: string;
  @IsInt() activeSeconds: number;
  @IsOptional() @IsInt() pausedSeconds?: number;
  @IsOptional() @IsNumber() distanceMeters?: number;
  @IsOptional() @IsInt() steps?: number;
  @IsOptional() @IsNumber() calories?: number;
  @IsOptional() @IsBoolean() usedLocation?: boolean;
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
  @IsOptional() @IsString() whenToNotify?: string;
  @IsOptional() @IsInt() notifyDelayMinutes?: number;
  @IsOptional() @IsString() strictnessMode?: string;
  @IsOptional() @IsBoolean() stepGoalEnabled?: boolean;
  @IsOptional() @IsInt() stepGoal?: number;
  @IsOptional() preferredWalkingPeriods?: Array<{ start: string; end: string }>;
}

class SyncScheduleSourceDto {
  @IsEnum(ScheduleSourceType) type: ScheduleSourceType;
  @IsOptional() @IsString() filename?: string;
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
  @ValidateNested({ each: true })
  @Type(() => SyncBusyEventDto)
  busyEvents?: SyncBusyEventDto[];

  @ApiPropertyOptional({ type: [SyncManualEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncManualEntryDto)
  manualScheduleEntries?: SyncManualEntryDto[];

  @ApiPropertyOptional({ type: [SyncNudgePlanDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncNudgePlanDto)
  nudgePlans?: SyncNudgePlanDto[];

  @ApiPropertyOptional({ type: [SyncWalkSessionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncWalkSessionDto)
  walkSessions?: SyncWalkSessionDto[];

  @ApiPropertyOptional({ type: [SyncAnalyticsEventDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncAnalyticsEventDto)
  analyticsEvents?: SyncAnalyticsEventDto[];

  @ApiPropertyOptional({ type: [SyncCrashReportDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncCrashReportDto)
  crashReports?: SyncCrashReportDto[];
}
