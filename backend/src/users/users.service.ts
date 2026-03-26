import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpsertUserProfileDto } from './dto/user-profile.dto';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
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
      update: {
        ...dto,
        consentGivenAt: dto.consentGivenAt ? new Date(dto.consentGivenAt) : undefined,
        onboardingCompletedAt: dto.onboardingCompletedAt
          ? new Date(dto.onboardingCompletedAt)
          : undefined,
      },
      create: {
        userId,
        ...dto,
        consentGivenAt: dto.consentGivenAt ? new Date(dto.consentGivenAt) : undefined,
        onboardingCompletedAt: dto.onboardingCompletedAt
          ? new Date(dto.onboardingCompletedAt)
          : undefined,
      },
    });
  }

  /** For researcher dashboard: list all participants */
  async listParticipants(page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'participant', isActive: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { preferences: true, profile: true },
      }),
      this.prisma.user.count({
        where: { role: 'participant', isActive: true },
      }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
