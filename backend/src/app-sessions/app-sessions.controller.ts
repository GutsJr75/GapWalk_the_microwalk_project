import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppSessionsService } from './app-sessions.service';
import { CreateAppSessionDto, SyncAchievementsDto } from './dto/app-sessions.dto';

@ApiTags('app-sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('app-sessions')
export class AppSessionsController {
  constructor(private readonly appSessionsService: AppSessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Record an app usage session' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAppSessionDto,
  ) {
    return this.appSessionsService.createAppSession(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get app sessions for the current user' })
  getAll(@CurrentUser('userId') userId: string) {
    return this.appSessionsService.getUserAppSessions(userId);
  }

  @Post('achievements/sync')
  @ApiOperation({ summary: 'Sync locally-unlocked achievements to the server' })
  syncAchievements(
    @CurrentUser('userId') userId: string,
    @Body() dto: SyncAchievementsDto,
  ) {
    return this.appSessionsService.syncAchievements(userId, dto);
  }

  @Get('achievements')
  @ApiOperation({ summary: 'Get all unlocked achievements for the current user' })
  getAchievements(@CurrentUser('userId') userId: string) {
    return this.appSessionsService.getUserAchievements(userId);
  }
}
