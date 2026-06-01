import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import {
  CreateAnalyticsEventDto,
  BulkCreateAnalyticsEventsDto,
  CreateCrashReportDto,
  BulkCreateCrashReportsDto,
  QueryAggregationsDto,
} from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ── Events ──

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

  // ── Crash Reports ──

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

  // ── Aggregations (always scoped to the current user) ──

  @Get('daily')
  @ApiOperation({ summary: 'Get daily aggregations for the current user' })
  getDailyAggregations(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryAggregationsDto,
  ) {
    return this.analyticsService.getDailyAggregations({ ...query, userId });
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Get weekly aggregations for the current user' })
  getWeeklyAggregations(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryAggregationsDto,
  ) {
    return this.analyticsService.getWeeklyAggregations({ ...query, userId });
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
