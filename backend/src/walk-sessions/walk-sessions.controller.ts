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
  @ApiOperation({ summary: 'Record a walk session' })
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
}
