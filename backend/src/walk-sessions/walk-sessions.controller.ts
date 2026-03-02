import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WalkSessionsService } from './walk-sessions.service';
import {
  CreateWalkSessionDto,
  QueryWalkSessionsDto,
} from './dto/walk-sessions.dto';

@ApiTags('walk-sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('walk-sessions')
export class WalkSessionsController {
  constructor(private readonly walkSessionsService: WalkSessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Record a walk session (with pause events and GPS route)' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateWalkSessionDto,
  ) {
    return this.walkSessionsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Query walk sessions with optional date filter' })
  query(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryWalkSessionsDto,
  ) {
    return this.walkSessionsService.query(userId, query);
  }

  @Get('today')
  @ApiOperation({ summary: 'Get today walk sessions' })
  today(@CurrentUser('userId') userId: string) {
    return this.walkSessionsService.getTodaySessions(userId);
  }

  @Get('today/stats')
  @ApiOperation({ summary: 'Get today walking statistics' })
  todayStats(@CurrentUser('userId') userId: string) {
    return this.walkSessionsService.getTodayStats(userId);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all walk sessions' })
  getAll(@CurrentUser('userId') userId: string) {
    return this.walkSessionsService.getAll(userId);
  }

  @Get(':sessionId/pauses')
  @ApiOperation({ summary: 'Get pause events for a walk session' })
  getPauseEvents(
    @CurrentUser('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.walkSessionsService.getPauseEvents(userId, sessionId);
  }

  @Get(':sessionId/route')
  @ApiOperation({ summary: 'Get GPS route points for a walk session' })
  getRoutePoints(
    @CurrentUser('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.walkSessionsService.getRoutePoints(userId, sessionId);
  }
}
