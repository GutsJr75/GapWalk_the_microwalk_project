import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto) {
    const deviceFields = {
      platform: dto.platform,
      appVersion: dto.appVersion,
      osVersion: dto.osVersion,
      deviceModel: dto.deviceModel,
      notificationPermissionGranted: dto.notificationPermissionGranted,
      locationPermissionLevel: dto.locationPermissionLevel,
      activityPermissionGranted: dto.activityPermissionGranted,
      batterySaverDetected: dto.batterySaverDetected,
      lastSeenAt: new Date(),
      isActive: true,
    };

    return this.prisma.device.upsert({
      where: {
        userId_expoPushToken: {
          userId,
          expoPushToken: dto.expoPushToken,
        },
      },
      update: deviceFields,
      create: {
        userId,
        expoPushToken: dto.expoPushToken,
        ...deviceFields,
      },
    });
  }

  async deactivate(userId: string, expoPushToken: string) {
    return this.prisma.device.updateMany({
      where: { userId, expoPushToken },
      data: { isActive: false },
    });
  }

  async getActiveDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId, isActive: true },
    });
  }

  /** Get all active push tokens for a user */
  async getActiveTokens(userId: string): Promise<string[]> {
    const devices = await this.getActiveDevices(userId);
    return devices.map((d) => d.expoPushToken);
  }
}
