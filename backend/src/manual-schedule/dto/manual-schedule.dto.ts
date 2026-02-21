import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  Matches,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateManualEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localId?: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ description: '0=Sunday, 6=Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOneTime?: boolean;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsString()
  oneTimeDate?: string;
}

export class BulkSaveManualEntriesDto {
  @ApiProperty({ type: [CreateManualEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateManualEntryDto)
  entries: CreateManualEntryDto[];
}
