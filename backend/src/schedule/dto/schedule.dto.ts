import {
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleSourceType } from '@prisma/client';

export class CreateBusyEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localId?: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsDateString()
  start: string;

  @ApiProperty()
  @IsDateString()
  endTime: string;

  @ApiProperty({ enum: ScheduleSourceType })
  @IsEnum(ScheduleSourceType)
  source: ScheduleSourceType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;
}

export class BulkCreateBusyEventsDto {
  @ApiProperty({ type: [CreateBusyEventDto] })
  events: CreateBusyEventDto[];
}

export class QueryEventsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ScheduleSourceType })
  @IsOptional()
  @IsEnum(ScheduleSourceType)
  source?: ScheduleSourceType;
}

export class SetScheduleSourceDto {
  @ApiProperty({ enum: ScheduleSourceType })
  @IsEnum(ScheduleSourceType)
  type: ScheduleSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  googleAccessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  googleRefreshToken?: string;
}
