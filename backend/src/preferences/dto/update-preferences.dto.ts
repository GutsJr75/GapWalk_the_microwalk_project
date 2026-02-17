import {
  IsOptional,
  IsInt,
  IsString,
  IsBoolean,
  IsEnum,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

enum WhenToNotify {
  now = 'now',
  delay = 'delay',
  next_gap = 'next_gap',
}

enum StrictnessMode {
  easygoing = 'easygoing',
  no_excuses = 'no_excuses',
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  dailyTargetMinutes?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  bufferMinutes?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  notificationCountPerDay?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(360)
  notificationMinGapMinutes?: number;

  @ApiPropertyOptional({ default: '23:00', example: '23:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  quietHoursStart?: string;

  @ApiPropertyOptional({ default: '06:00', example: '06:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  quietHoursEnd?: string;

  @ApiPropertyOptional({ default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  minWalkMinutes?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  gracePeriodMinutes?: number;

  @ApiPropertyOptional({ enum: WhenToNotify, default: 'delay' })
  @IsOptional()
  @IsEnum(WhenToNotify)
  whenToNotify?: WhenToNotify;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  notifyDelayMinutes?: number;

  @ApiPropertyOptional({ enum: StrictnessMode, default: 'easygoing' })
  @IsOptional()
  @IsEnum(StrictnessMode)
  strictnessMode?: StrictnessMode;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  stepGoalEnabled?: boolean;

  @ApiPropertyOptional({ default: 1000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50000)
  stepGoal?: number;
}
