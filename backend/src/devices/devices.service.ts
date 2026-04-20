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

    const [device] = await Promise.all([
      this.prisma.device.upsert({
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
      }),
      dto.timezone
        ? this.prisma.user.update({
            where: { id: userId },
            data: { timezone: dto.timezone },
          })
        : Promise.resolve(),
    ]);

    // Deactivate stale device rows that represent the same physical device
    // but under a previous Expo push token (reinstall / token rotation).
    // "Same physical device" is approximated by (userId, platform, deviceModel);
    // users with two literally identical devices are rare and can re-register.
    if (dto.deviceModel) {
      await this.prisma.device.updateMany({
        where: {
          userId,
          platform: dto.platform,
          deviceModel: dto.deviceModel,
          id: { not: device.id },
          isActive: true,
        },
        data: { isActive: false },
      });
    }

    return device;
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
