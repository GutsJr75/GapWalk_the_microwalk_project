import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync.dto';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
// Sync is the app's critical offline-first path: it fires on launch, on
// foreground/resume, and on retry after connectivity loss, so it gets a higher
// ceiling than the default API limit to avoid 429s blocking data continuity.
@Throttle({ default: { limit: 240, ttl: 60_000 } })
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @ApiOperation({
    summary: 'Bidirectional sync — send client changes, receive server state',
  })
  sync(@CurrentUser('userId') userId: string, @Body() dto: SyncRequestDto) {
    return this.syncService.sync(userId, dto);
  }
}
