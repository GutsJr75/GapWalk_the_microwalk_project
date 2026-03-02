import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class WalkPauseEventDto {
  @ApiProperty()
  @IsDateString()
  pauseStartedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  pauseEndedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  pauseDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'screen | auto_pause | notification' })
  @IsOptional()
  @IsString()
  pauseSource?: string;

  @ApiPropertyOptional({ description: 'not_moving | user_action | phone_call' })
  @IsOptional()
  @IsString()
  pauseReason?: string;
}

export class WalkRoutePointDto {
  @ApiProperty()
  @IsNumber()
  latitude: number;

  @ApiProperty()
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  accuracyMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  altitudeMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  speedMps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bearingDegrees?: number;

  @ApiProperty()
  @IsDateString()
  recordedAt: string;
}

export class CreateWalkSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nudgePlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localId?: string;

  @ApiProperty()
  @IsDateString()
  start: string;

  @ApiProperty()
  @IsDateString()
  endTime: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  activeSeconds: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pausedSeconds?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pauseCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  distanceMeters?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  steps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  calories?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxSpeedMps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  avgSpeedMps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  elevationGainMeters?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  usedLocation?: boolean;

  @ApiPropertyOptional({ description: 'sensor | gps_fallback | none' })
  @IsOptional()
  @IsString()
  stepSource?: string;

  @ApiPropertyOptional({ description: 'low | medium | high' })
  @IsOptional()
  @IsString()
  motionConfidence?: string;

  @ApiPropertyOptional({ description: 'active | stale | unsupported | denied' })
  @IsOptional()
  @IsString()
  sensorHealthAtStart?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  wasRecovered?: boolean;

  @ApiPropertyOptional({ description: 'Seconds from push notification to walk start' })
  @IsOptional()
  @IsInt()
  nudgeToStartLatencySeconds?: number;

  @ApiPropertyOptional({ type: [WalkPauseEventDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WalkPauseEventDto)
  pauseEvents?: WalkPauseEventDto[];

  @ApiPropertyOptional({ type: [WalkRoutePointDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WalkRoutePointDto)
  routePoints?: WalkRoutePointDto[];
}

export class QueryWalkSessionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
