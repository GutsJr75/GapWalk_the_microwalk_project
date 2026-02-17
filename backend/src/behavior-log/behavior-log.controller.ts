import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BehaviorLogService } from './behavior-log.service';
import {
  CreateBehaviorLogDto,
  BulkCreateBehaviorLogsDto,
  QueryBehaviorLogsDto,
} from './dto/behavior-log.dto';

@ApiTags('behavior-log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Get()
  @Roles('researcher' as any, 'admin' as any)
  @ApiOperation({ summary: 'Query behavior logs (researcher/admin)' })
  query(@Query() query: QueryBehaviorLogsDto) {
    return this.behaviorLogService.query(query);
  }

  @Get('counts')
  @Roles('researcher' as any, 'admin' as any)
  @ApiOperation({ summary: 'Get event type counts (researcher/admin)' })
  getCounts(@Query() query: QueryBehaviorLogsDto) {
    return this.behaviorLogService.getEventTypeCounts(query);
  }

  @Get('nudge-funnel')
  @Roles('researcher' as any, 'admin' as any)
  @ApiOperation({ summary: 'Get nudge response funnel (researcher/admin)' })
  getNudgeFunnel(
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.behaviorLogService.getNudgeFunnel(userId, startDate, endDate);
  }
}
