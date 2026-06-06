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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        'local-plan-1',
        'Walk time!',
        'Go!',
      );
      expect(result).toEqual({
        tickets: [],
        firstSuccessTicketId: null,
      });
    });

    it('should send push and log the result', async () => {
      const result = await service.sendWalkNudge(
        'user-1',
        'plan-1',
        'local-plan-1',
        'Walk time!',
        'Go walking!',
      );
      expect(result.tickets.length).toBeGreaterThan(0);
      expect(result.firstSuccessTicketId).toBe('ticket-1');
      expect(mockPrisma.pushLog.create).toHaveBeenCalled();
    });
  });

  describe('sendDueNudges', () => {
    it('should process due plans', async () => {
      const now = Date.now();
      mockPrisma.nudgePlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          localId: 'local-plan-1',
          userId: 'user-1',
          walkStart: new Date(now - 6 * 60_000).toISOString(),
          gapEnd: new Date(now + 4 * 60_000).toISOString(),
          suggestedDurationMinutes: 10,
          status: 'planned',
          user: {
            id: 'user-1',
            timezone: 'America/Los_Angeles',
            lastSyncedAt: null,
            devices: [],
          },
        },
      ]);

      const result = await service.sendDueNudges();
      expect(result.sent).toBe(1);
      expect(mockPrisma.nudgePlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gapEnd: { gt: expect.any(Date) },
          }),
        }),
      );
      expect(mockPrisma.nudgePlan.updateMany).toHaveBeenCalled();
    });

    it('should not count a plan as sent when no push tokens are available', async () => {
      const now = Date.now();
      (mockDevices.getActiveTokens as jest.Mock).mockResolvedValue([]);
      mockPrisma.nudgePlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          localId: 'local-plan-1',
          userId: 'user-1',
          walkStart: new Date(now - 6 * 60_000).toISOString(),
          gapEnd: new Date(now + 4 * 60_000).toISOString(),
          suggestedDurationMinutes: 10,
          status: 'planned',
          user: {
            id: 'user-1',
            timezone: 'America/Los_Angeles',
            lastSyncedAt: null,
            devices: [],
          },
        },
      ]);

      const result = await service.sendDueNudges();
      expect(result.sent).toBe(0);
    });

    it('should only send one backup push when two workers race on the same due plan', async () => {
      const now = Date.now();
      const planState = {
        status: 'planned',
        pushSentAt: null as Date | null,
        pushTicketId: null as string | null,
      };

      mockPrisma.nudgePlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          localId: 'local-plan-1',
          userId: 'user-1',
          walkStart: new Date(now - 6 * 60_000).toISOString(),
          gapEnd: new Date(now + 4 * 60_000).toISOString(),
          suggestedDurationMinutes: 10,
          status: 'planned',
          user: {
            id: 'user-1',
            timezone: 'America/Los_Angeles',
            lastSyncedAt: null,
            devices: [],
          },
        },
      ]);

      mockPrisma.nudgePlan.updateMany.mockImplementation(
        async ({ where, data }: { where: any; data: any }) => {
          const statusFilter = where?.status?.in ?? [];
          const matchesStatus = statusFilter.includes(planState.status);
          const expectsNullClaim = Object.prototype.hasOwnProperty.call(
            where,
            'pushTicketId',
          );
          const claimMatches = !expectsNullClaim || planState.pushTicketId === null;

          if (
            where?.id !== 'plan-1' ||
            !matchesStatus ||
            !claimMatches ||
            planState.pushSentAt !== null
          ) {
            return { count: 0 };
          }

          planState.status = data.status ?? planState.status;
          if (Object.prototype.hasOwnProperty.call(data, 'pushTicketId')) {
            planState.pushTicketId = data.pushTicketId;
          }
          return { count: 1 };
        },
      );

      mockPrisma.nudgePlan.update.mockImplementation(
        async ({ data }: { data: any }) => {
          planState.pushTicketId = data.pushTicketId ?? planState.pushTicketId;
          planState.pushSentAt = data.pushSentAt ?? planState.pushSentAt;
          return {};
        },
      );

      const [first, second] = await Promise.all([
        service.sendDueNudges(),
        service.sendDueNudges(),
      ]);

      expect(first.sent + second.sent).toBe(1);
      expect(mockPrisma.pushLog.create).toHaveBeenCalledTimes(1);
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
