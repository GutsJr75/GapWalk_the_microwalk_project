import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpsertUserProfileDto } from './dto/user-profile.dto';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { firebaseUid } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findById(id); // ensure exists
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        preferences: true,
        scheduleSource: true,
        devices: { where: { isActive: true } },
        profile: true,
      },
    });
  }

  async upsertProfile(userId: string, dto: UpsertUserProfileDto) {
    await this.findById(userId);
    return this.prisma.userProfile.upsert({
      where: { userId },
      update: { ...dto },
      create: { userId, ...dto },
    });
  }

  /**
   * GDPR hard delete: permanently remove the user and every row that belongs
   * to them. Most relations cascade from the User FK, but several analytics
   * tables (daily/weekly aggregations, push logs, gap opportunities) store a
   * bare user_id with no foreign key, so they must be deleted explicitly.
   * Everything runs in one transaction so a partial delete is impossible.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.findById(userId);

    await this.prisma.$transaction([
      this.prisma.dailyAggregation.deleteMany({ where: { userId } }),
      this.prisma.weeklyAggregation.deleteMany({ where: { userId } }),
      this.prisma.pushLog.deleteMany({ where: { userId } }),
      this.prisma.gapOpportunity.deleteMany({ where: { userId } }),
      // Cascades to: devices, profile, preferences, scheduleSource,
      // busyEvents, manualScheduleEntries, nudgePlans, walkSessions,
      // walkPauseEvents, walkRoutePoints, analyticsEvents, appSessions,
      // crashReports, behaviorLogs, achievements.
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    this.logger.log(`Hard-deleted user ${userId} and all associated data`);
  }
}
