import { PushNotificationsService } from './push-notifications.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';

// Mock expo-server-sdk
jest.mock('expo-server-sdk', () => {
  const mockExpo = {
    chunkPushNotifications: jest.fn((msgs) => [msgs]),
    sendPushNotificationsAsync: jest
      .fn()
      .mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]),
    chunkPushNotificationReceiptIds: jest.fn((ids) => [ids]),
    getPushNotificationReceiptsAsync: jest.fn().mockResolvedValue({}),
  };

  const ExpoClass = jest.fn(() => mockExpo);
  (ExpoClass as any).isExpoPushToken = jest.fn(() => true);

  return { __esModule: true, default: ExpoClass };
});

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;
  let mockConfig: Partial<ConfigService>;
  let mockPrisma: any;
  let mockDevices: Partial<DevicesService>;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn().mockReturnValue(undefined),
    };

    mockPrisma = {
      pushLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      nudgePlan: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockDevices = {
      getActiveTokens: jest.fn().mockResolvedValue(['ExponentPushToken[test]']),
      deactivate: jest.fn().mockResolvedValue(undefined),
    };

    service = new PushNotificationsService(
      mockConfig as ConfigService,
      mockPrisma as PrismaService,
      mockDevices as DevicesService,
    );
  });

  describe('sendWalkNudge', () => {
    it('should return empty when no tokens available', async () => {
      (mockDevices.getActiveTokens as jest.Mock).mockResolvedValue([]);
      const result = await service.sendWalkNudge(
        'user-1',
        'plan-1',
        'Walk time!',
        'Go!',
      );
      expect(result).toEqual([]);
    });

    it('should send push and log the result', async () => {
      const result = await service.sendWalkNudge(
        'user-1',
        'plan-1',
        'Walk time!',
        'Go walking!',
      );
      expect(result.length).toBeGreaterThan(0);
      expect(mockPrisma.pushLog.create).toHaveBeenCalled();
      expect(mockPrisma.nudgePlan.update).toHaveBeenCalled();
    });
  });

  describe('sendDueNudges', () => {
    it('should process due plans', async () => {
      mockPrisma.nudgePlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          userId: 'user-1',
          suggestedDurationMinutes: 10,
          status: 'planned',
          user: { id: 'user-1' },
        },
      ]);

      const result = await service.sendDueNudges();
      expect(result.sent).toBe(1);
    });

    it('should return 0 when no due plans', async () => {
      mockPrisma.nudgePlan.findMany.mockResolvedValue([]);
      const result = await service.sendDueNudges();
      expect(result.sent).toBe(0);
    });
  });

  describe('checkReceipts', () => {
    it('should return 0 when no pending logs', async () => {
      mockPrisma.pushLog.findMany.mockResolvedValue([]);
      const result = await service.checkReceipts();
      expect(result.checked).toBe(0);
    });
  });
});
