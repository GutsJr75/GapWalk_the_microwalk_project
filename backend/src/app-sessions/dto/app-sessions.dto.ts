import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsArray,
  IsEnum,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppOpenSource } from '@prisma/client';

export class CreateAppSessionDto {
  @ApiProperty()
  @IsDateString()
  sessionStart: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  sessionEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  foregroundSeconds?: number;

  @ApiPropertyOptional({ type: [String], description: 'List of screen names visited in order' })
  @IsOptional()
  @IsArray()
  screensVisited?: string[];

  @ApiPropertyOptional({ enum: AppOpenSource })
  @IsOptional()
  @IsEnum(AppOpenSource)
  source?: AppOpenSource;
}

export class SyncAchievementsDto {
  @ApiProperty({ type: [Object], description: 'Array of {id, unlockedAt, notifiedAt?}' })
  @IsArray()
  achievements: Array<{
    achievementId: string;
    unlockedAt: string;
    notifiedAt?: string;
  }>;
}
