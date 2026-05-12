import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsEnum,
  Min,
  IsBoolean,
  IsIn,
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
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

export class RecordLocalDeliveryDto {
  @ApiProperty({ example: 'plan-local-id-123' })
  @IsString()
  localId: string;

  @ApiProperty()
  @IsDateString()
  deliveredAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiProperty({ enum: ['android_exact', 'expo_local'] })
  @IsIn(['android_exact', 'expo_local'])
  source: 'android_exact' | 'expo_local';
}
