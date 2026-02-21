import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import {
  CreateAnalyticsEventDto,
  BulkCreateAnalyticsEventsDto,
  CreateCrashReportDto,
  BulkCreateCrashReportsDto,
  QueryAnalyticsDto,
  QueryAggregationsDto,
} from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ── Events (participant) ──

  @Post('events')
  @ApiOperation({ summary: 'Track an analytics event' })
  createEvent(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAnalyticsEventDto,
  ) {
    return this.analyticsService.createEvent(userId, dto);
  }

  @Post('events/bulk')
  @ApiOperation({ summary: 'Batch upload analytics events' })
  bulkCreateEvents(
    @CurrentUser('userId') userId: string,
    @Body() dto: BulkCreateAnalyticsEventsDto,
  ) {
    return this.analyticsService.bulkCreateEvents(userId, dto.events);
  }

  // ── Crash Reports (participant) ──

  @Post('crashes')
  @ApiOperation({ summary: 'Report a crash' })
  createCrash(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateCrashReportDto,
  ) {
    return this.analyticsService.createCrashReport(userId, dto);
  }

  @Post('crashes/bulk')
  @ApiOperation({ summary: 'Batch upload crash reports' })
  bulkCreateCrashes(
    @CurrentUser('userId') userId: string,
    @Body() dto: BulkCreateCrashReportsDto,
  ) {
    return this.analyticsService.bulkCreateCrashReports(userId, dto.reports);
  }

  // ── Query (researcher / admin) ──

  @Get('events')
  @Roles(UserRole.researcher, UserRole.admin)
  @ApiOperation({ summary: 'Query analytics events (researcher/admin)' })
  queryEvents(@Query() query: QueryAnalyticsDto) {
    return this.analyticsService.queryEvents(query);
  }

  @Get('events/counts')
  @Roles(UserRole.researcher, UserRole.admin)
  @ApiOperation({ summary: 'Get event name counts (researcher/admin)' })
  getEventCounts(@Query() query: QueryAnalyticsDto) {
    return this.analyticsService.getEventCounts(query);
  }

  @Get('crashes')
  @Roles(UserRole.researcher, UserRole.admin)
  @ApiOperation({ summary: 'Query crash reports (researcher/admin)' })
  queryCrashes(@Query() query: QueryAnalyticsDto) {
    return this.analyticsService.queryCrashReports(query);
  }

  // ── Aggregations ──

  @Get('daily')
  @ApiOperation({ summary: 'Get daily aggregations' })
  getDailyAggregations(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryAggregationsDto,
  ) {
    // Participants can only see their own; for researchers, userId query param is used
    const targetUserId = query.userId ?? userId;
    return this.analyticsService.getDailyAggregations({
      ...query,
      userId: targetUserId,
    });
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Get weekly aggregations' })
  getWeeklyAggregations(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryAggregationsDto,
  ) {
    const targetUserId = query.userId ?? userId;
    return this.analyticsService.getWeeklyAggregations({
      ...query,
      userId: targetUserId,
    });
  }

  @Post('aggregate/daily')
  @ApiOperation({ summary: 'Trigger daily aggregation for current user' })
  computeDaily(
    @CurrentUser('userId') userId: string,
    @Body('date') date: string,
  ) {
    return this.analyticsService.computeDailyAggregation(userId, date);
  }

  @Post('aggregate/weekly')
  @ApiOperation({ summary: 'Trigger weekly aggregation for current user' })
  computeWeekly(
    @CurrentUser('userId') userId: string,
    @Body('weekStart') weekStart: string,
  ) {
    return this.analyticsService.computeWeeklyAggregation(userId, weekStart);
  }
}
