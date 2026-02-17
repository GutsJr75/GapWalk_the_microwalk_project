import {
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsObject,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ── Analytics Events ──

export class CreateAnalyticsEventDto {
  @ApiProperty({ example: 'walk_completed' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  clientCreatedAt?: string;
}

export class BulkCreateAnalyticsEventsDto {
  @ApiProperty({ type: [CreateAnalyticsEventDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAnalyticsEventDto)
  events: CreateAnalyticsEventDto[];
}

// ── Crash Reports ──

export class CreateCrashReportDto {
  @ApiProperty()
  @IsString()
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stack?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFatal?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  clientCreatedAt?: string;
}

export class BulkCreateCrashReportsDto {
  @ApiProperty({ type: [CreateCrashReportDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCrashReportDto)
  reports: CreateCrashReportDto[];
}

// ── Query ──

export class QueryAnalyticsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

export class QueryAggregationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: '2026-02-17' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: '2026-02-10' })
  @IsOptional()
  @IsString()
  weekStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
