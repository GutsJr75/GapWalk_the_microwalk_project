import { Controller, Get, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ManualScheduleService } from './manual-schedule.service';
import {
  CreateManualEntryDto,
  BulkSaveManualEntriesDto,
} from './dto/manual-schedule.dto';

@ApiTags('manual-schedule')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('manual-schedule')
export class ManualScheduleController {
  constructor(private readonly manualScheduleService: ManualScheduleService) {}

  @Get()
  @ApiOperation({ summary: 'Get all manual schedule entries' })
  getAll(@CurrentUser('userId') userId: string) {
    return this.manualScheduleService.getAll(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single manual schedule entry' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateManualEntryDto,
  ) {
    return this.manualScheduleService.create(userId, dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Replace all manual schedule entries' })
  bulkSave(
    @CurrentUser('userId') userId: string,
    @Body() dto: BulkSaveManualEntriesDto,
  ) {
    return this.manualScheduleService.bulkSave(userId, dto.entries);
  }

  @Post('generate-events')
  @ApiOperation({ summary: 'Generate busy events from manual template' })
  generateEvents(@CurrentUser('userId') userId: string) {
    return this.manualScheduleService.generateBusyEventsFromTemplate(userId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all manual schedule entries' })
  deleteAll(@CurrentUser('userId') userId: string) {
    return this.manualScheduleService.deleteAll(userId);
  }
}
