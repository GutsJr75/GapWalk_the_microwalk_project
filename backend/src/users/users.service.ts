import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByAuth0Sub(auth0Sub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { auth0Sub } });
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
        include: { preferences: true },
      }),
      this.prisma.user.count({ where: { role: 'participant', isActive: true } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
