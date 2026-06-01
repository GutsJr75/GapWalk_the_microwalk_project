import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BehaviorLogService } from './behavior-log.service';
import {
  CreateBehaviorLogDto,
  BulkCreateBehaviorLogsDto,
} from './dto/behavior-log.dto';

@ApiTags('behavior-log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('behavior-log')
export class BehaviorLogController {
  constructor(private readonly behaviorLogService: BehaviorLogService) {}

  @Post()
  @ApiOperation({ summary: 'Log a behavior event' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBehaviorLogDto,
  ) {
    return this.behaviorLogService.create(userId, dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Batch upload behavior logs' })
  bulkCreate(
    @CurrentUser('userId') userId: string,
    @Body() dto: BulkCreateBehaviorLogsDto,
  ) {
    return this.behaviorLogService.bulkCreate(userId, dto.logs);
  }
}
