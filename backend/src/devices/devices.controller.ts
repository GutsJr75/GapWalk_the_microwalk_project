import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
import { DeviceHeartbeatDto, RegisterDeviceDto } from './dto/register-device.dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiOperation({ summary: 'Register or update a device push token' })
  register(
    @CurrentUser('userId') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.devicesService.register(userId, dto);
  }

  @Post('heartbeat')
  // Heartbeats can fire on every foreground transition; allow a higher rate
  // than the default so frequent app switching never trips the limiter.
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({ summary: 'Refresh last-seen state for the current device' })
  heartbeat(
    @CurrentUser('userId') userId: string,
    @Body() dto: DeviceHeartbeatDto,
  ) {
    return this.devicesService.heartbeat(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List active devices' })
  listActive(@CurrentUser('userId') userId: string) {
    return this.devicesService.getActiveDevices(userId);
  }
}
