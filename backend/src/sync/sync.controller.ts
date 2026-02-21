import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync.dto';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
