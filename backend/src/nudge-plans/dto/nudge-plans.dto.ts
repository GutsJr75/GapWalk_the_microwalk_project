import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsEnum,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NudgePlanStatus } from '@prisma/client';

export class CreateNudgePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localId?: string;

  @ApiProperty({ example: '2026-02-17' })
  @IsString()
  date: string;

  @ApiProperty()
  @IsDateString()
  gapStart: string;

  @ApiProperty()
  @IsDateString()
  gapEnd: string;

  @ApiProperty()
  @IsDateString()
  walkStart: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  suggestedDurationMinutes: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateNudgePlanStatusDto {
  @ApiProperty({ enum: NudgePlanStatus })
  @IsEnum(NudgePlanStatus)
  status: NudgePlanStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueryNudgePlansDto {
  @ApiPropertyOptional({ example: '2026-02-17' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: NudgePlanStatus })
  @IsOptional()
  @IsEnum(NudgePlanStatus)
  status?: NudgePlanStatus;
}
