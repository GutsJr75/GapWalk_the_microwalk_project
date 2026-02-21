import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  usedLocation?: boolean;
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
