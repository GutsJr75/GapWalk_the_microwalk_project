import {
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityLevel, BiologicalSex, OccupationType } from '@prisma/client';

export class UpsertUserProfileDto {
  @ApiPropertyOptional({
    description: 'Age bracket e.g. "18-24", "25-34", "35-44", "45-54", "55-64", "65+"',
    example: '25-34',
  })
  @IsOptional()
  @IsString()
  ageGroup?: string;

  @ApiPropertyOptional({ enum: BiologicalSex })
  @IsOptional()
  @IsEnum(BiologicalSex)
  biologicalSex?: BiologicalSex;

  @ApiPropertyOptional({ description: 'Height in centimetres', example: 175 })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm?: number;

  @ApiPropertyOptional({ description: 'Weight in kilograms', example: 70 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  weightKg?: number;

  @ApiPropertyOptional({ enum: OccupationType })
  @IsOptional()
  @IsEnum(OccupationType)
  occupationType?: OccupationType;

  @ApiPropertyOptional({ enum: ActivityLevel })
  @IsOptional()
  @IsEnum(ActivityLevel)
  selfReportedActivityLevel?: ActivityLevel;

  @ApiPropertyOptional({ description: 'How the user found the app', example: 'app_store' })
  @IsOptional()
  @IsString()
  referralSource?: string;

  @ApiPropertyOptional({ description: 'BCP-47 locale string', example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp of consent', example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  consentGivenAt?: string;

  @ApiPropertyOptional({ description: 'Version of the consent form agreed to', example: 'v1.2' })
  @IsOptional()
  @IsString()
  consentVersion?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp when onboarding was completed' })
  @IsOptional()
  @IsDateString()
  onboardingCompletedAt?: string;

  @ApiPropertyOptional({
    description: 'Research study arm/group e.g. "control" or "intervention"',
    example: 'intervention',
  })
  @IsOptional()
  @IsString()
  studyGroup?: string;
}
