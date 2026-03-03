import { IsString, IsOptional, IsIn, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Expo push token' })
  @IsString()
  expoPushToken: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  osVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationPermissionGranted?: boolean;

  @ApiPropertyOptional({ description: 'none | when_in_use | always' })
  @IsOptional()
  @IsString()
  locationPermissionLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activityPermissionGranted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  batterySaverDetected?: boolean;
}
