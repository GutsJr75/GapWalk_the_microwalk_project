import { Controller, Get, Patch, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpsertUserProfileDto } from './dto/user-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile (includes research profile)' })
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
  @ApiOperation({ summary: 'Upsert research/demographic profile' })
  upsertResearchProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpsertUserProfileDto,
  ) {
    return this.usersService.upsertProfile(userId, dto);
  }

  @Get('participants')
  @Roles(UserRole.researcher, UserRole.admin)
  @ApiOperation({ summary: 'List all participants (researcher/admin)' })
  listParticipants(@Query() pagination: PaginationDto) {
    return this.usersService.listParticipants(
      pagination.page ?? 1,
      pagination.limit ?? 50,
    );
  }
}
