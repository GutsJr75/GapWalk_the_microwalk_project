import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpsertUserProfileDto } from './dto/user-profile.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user (with preferences, devices, profile)' })
  getProfile(@CurrentUser('userId') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user base info' })
  updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, dto);
  }

  @Post('me/profile')
  @ApiOperation({ summary: 'Upsert optional personalization profile' })
  upsertProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpsertUserProfileDto,
  ) {
    return this.usersService.upsertProfile(userId, dto);
  }

  @Delete('me')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Permanently delete the current user and all associated data (GDPR)',
  })
  deleteAccount(@CurrentUser('userId') userId: string) {
    return this.usersService.deleteAccount(userId);
  }
}
