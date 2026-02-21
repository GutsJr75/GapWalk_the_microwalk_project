import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScheduleService } from './schedule.service';
import {
  CreateBusyEventDto,
  BulkCreateBusyEventsDto,
  QueryEventsDto,
  SetScheduleSourceDto,
} from './dto/schedule.dto';
import { ScheduleSourceType } from '@prisma/client';

@ApiTags('schedule')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // ── Schedule Source ──

  @Get('source')
  @ApiOperation({ summary: 'Get schedule source' })
  getSource(@CurrentUser('userId') userId: string) {
    return this.scheduleService.getScheduleSource(userId);
  }

  @Put('source')
  @ApiOperation({ summary: 'Set schedule source (ics/manual/google)' })
  setSource(
    @CurrentUser('userId') userId: string,
    @Body() dto: SetScheduleSourceDto,
  ) {
    return this.scheduleService.setScheduleSource(userId, dto);
  }

  @Delete('source')
  @ApiOperation({ summary: 'Clear schedule source' })
  clearSource(@CurrentUser('userId') userId: string) {
    return this.scheduleService.clearScheduleSource(userId);
  }

  // ── Busy Events ──

  @Get('events')
  @ApiOperation({
    summary: 'Get busy events with optional date range and source filter',
  })
  getEvents(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryEventsDto,
  ) {
    return this.scheduleService.getEvents(userId, query);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create a single busy event' })
  createEvent(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBusyEventDto,
  ) {
    return this.scheduleService.createEvent(userId, dto);
  }

  @Post('events/bulk')
  @ApiOperation({ summary: 'Bulk create busy events' })
  bulkCreateEvents(
    @CurrentUser('userId') userId: string,
    @Body() dto: BulkCreateBusyEventsDto,
  ) {
    return this.scheduleService.bulkCreateEvents(userId, dto.events);
  }

  @Delete('events/source/:source')
  @ApiOperation({ summary: 'Delete all events from a specific source' })
  deleteBySource(
    @CurrentUser('userId') userId: string,
    @Param('source') source: ScheduleSourceType,
  ) {
    return this.scheduleService.deleteBySource(userId, source);
  }

  @Delete('events')
  @ApiOperation({ summary: 'Delete all busy events' })
  deleteAllEvents(@CurrentUser('userId') userId: string) {
    return this.scheduleService.deleteAllEvents(userId);
  }
}
