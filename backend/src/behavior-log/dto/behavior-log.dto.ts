import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BehaviorEventType } from '@prisma/client';

export class CreateBehaviorLogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nudgePlanId?: string;

  @ApiProperty({ enum: BehaviorEventType })
  @IsEnum(BehaviorEventType)
  eventType: BehaviorEventType;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiProperty()
  @IsDateString()
  clientTimestamp: string;
}

export class BulkCreateBehaviorLogsDto {
  @ApiProperty({ type: [CreateBehaviorLogDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBehaviorLogDto)
  logs: CreateBehaviorLogDto[];
}
