import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardSpaService } from './dashboard-spa.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('researcher' as any, 'admin' as any)
@Controller('dashboard-api')
export class DashboardSpaController {
  constructor(private readonly dashboardService: DashboardSpaService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview statistics' })
  overview() {
    return this.dashboardService.getOverview();
  }

  @Get('daily-activity')
  @ApiOperation({ summary: 'Daily walk activity (last N days)' })
  dailyActivity(@Query('days') days?: string) {
    return this.dashboardService.getDailyActivity(
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('nudge-adherence')
  @ApiOperation({ summary: 'Nudge plan adherence breakdown' })
  nudgeAdherence() {
    return this.dashboardService.getNudgeAdherence();
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Top walkers leaderboard' })
  leaderboard(@Query('limit') limit?: string) {
    return this.dashboardService.getLeaderboard(
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
