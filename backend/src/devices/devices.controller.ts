import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

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

  @Get()
  @ApiOperation({ summary: 'List active devices' })
  listActive(@CurrentUser('userId') userId: string) {
    return this.devicesService.getActiveDevices(userId);
  }

  @Delete(':token')
  @ApiOperation({ summary: 'Deactivate a device' })
  deactivate(
    @CurrentUser('userId') userId: string,
    @Param('token') token: string,
  ) {
    return this.devicesService.deactivate(userId, token);
  }
}
