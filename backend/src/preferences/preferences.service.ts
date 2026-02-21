import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { Preference } from '@prisma/client';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string): Promise<Preference> {
    let prefs = await this.prisma.preference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await this.prisma.preference.create({
        data: { userId },
      });
    }

    return prefs;
  }

  async update(userId: string, dto: UpdatePreferencesDto): Promise<Preference> {
    return this.prisma.preference.upsert({
      where: { userId },
      update: dto,
      create: {
        userId,
        ...dto,
      },
    });
  }
}
