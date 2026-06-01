import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NudgePlansService } from './nudge-plans.service';
import { NudgeEngineService } from '../nudge-engine/nudge-engine.service';
import {
  CreateNudgePlanDto,
  RecordLocalDeliveryDto,
  UpdateNudgePlanStatusDto,
  QueryNudgePlansDto,
} from './dto/nudge-plans.dto';

@ApiTags('nudge-plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nudge-plans')
export class NudgePlansController {
  constructor(
    private readonly nudgePlansService: NudgePlansService,
    private readonly nudgeEngine: NudgeEngineService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Query nudge plans by date/status' })
  query(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryNudgePlansDto,
  ) {
    return this.nudgePlansService.query(userId, query);
  }

  @Get('today')
  @ApiOperation({ summary: 'Get today plans' })
  getTodayPlans(@CurrentUser('userId') userId: string) {
    return this.nudgePlansService.getTodayPlans(userId);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming active plans' })
  getUpcoming(@CurrentUser('userId') userId: string) {
    return this.nudgePlansService.getUpcomingPlans(userId);
  }

  @Post('local-delivery')
  // The client reports each locally-delivered reminder; a busy day with many
  // nudges plus retries warrants a higher ceiling than the default.
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record that the local walk-ready reminder was delivered' })
  recordLocalDelivery(
    @CurrentUser('userId') userId: string,
    @Body() dto: RecordLocalDeliveryDto,
  ) {
    return this.nudgePlansService.recordLocalDelivery(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan by ID' })
  getById(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.nudgePlansService.findById(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create nudge plan (local fallback upload)' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateNudgePlanDto,
  ) {
    return this.nudgePlansService.create(userId, dto);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Server-side: generate plans for today + tomorrow' })
  generate(@CurrentUser('userId') userId: string) {
    return this.nudgeEngine.generateAndSavePlans(userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update nudge plan status' })
  updateStatus(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNudgePlanStatusDto,
  ) {
    return this.nudgePlansService.updateStatus(userId, id, dto);
  }

  @Post(':id/notified')
  @ApiOperation({ summary: 'Mark plan as notified' })
  markNotified(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.nudgePlansService.markNotifiedIfPlanned(userId, id);
  }

  @Post(':id/skip')
  @ApiOperation({ summary: 'Skip gap (cancel all plans in same gap)' })
  skipGap(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.nudgePlansService.skipGap(userId, id);
  }

  @Post(':id/can-start')
  @ApiOperation({ summary: 'Check if plan walk can be started' })
  canStart(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.nudgePlansService.canStartPlan(userId, id);
  }
}
