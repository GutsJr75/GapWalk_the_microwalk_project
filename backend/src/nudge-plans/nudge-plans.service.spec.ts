import { NudgePlansService } from './nudge-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('NudgePlansService', () => {
  let service: NudgePlansService;
  let mockPrisma: any;

  const basePlan = {
    id: 'plan-1',
    userId: 'user-1',
    date: '2026-02-18',
    gapStart: new Date('2026-02-18T10:00:00'),
    gapEnd: new Date('2026-02-18T11:00:00'),
    walkStart: new Date('2026-02-18T10:04:00'),
    suggestedDurationMinutes: 8,
    status: 'planned' as const,
    reason: null,
    origin: 'server' as const,
    localId: null,
    pushTicketId: null,
    pushSentAt: null,
    pushDeliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = {
      nudgePlan: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      preference: {
        findUnique: jest.fn(),
      },
      walkSession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ timezone: 'America/New_York' }),
      },
    };

    service = new NudgePlansService(mockPrisma as unknown as PrismaService);
  });

  describe('findById', () => {
    it('should throw NotFoundException when plan not found', async () => {
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(null);
      await expect(service.findById('user-1', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return plan when found', async () => {
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(basePlan);
      const result = await service.findById('user-1', 'plan-1');
      expect(result.id).toBe('plan-1');
    });
  });

  describe('updateStatus', () => {
    it('should not transition from terminal status', async () => {
      const completedPlan = { ...basePlan, status: 'completed' };
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(completedPlan);

      const result = await service.updateStatus('user-1', 'plan-1', {
        status: 'started' as any,
      });
      expect(result.status).toBe('completed');
      expect(mockPrisma.nudgePlan.update).not.toHaveBeenCalled();
    });

    it('should transition from non-terminal status', async () => {
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(basePlan);
      mockPrisma.nudgePlan.update.mockResolvedValue({
        ...basePlan,
        status: 'started',
      });

      await service.updateStatus('user-1', 'plan-1', {
        status: 'started' as any,
      });
      expect(mockPrisma.nudgePlan.update).toHaveBeenCalled();
    });
  });

  describe('canStartPlan', () => {
    it('should deny start for terminal status', async () => {
      const cancelledPlan = { ...basePlan, status: 'cancelled' };
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(cancelledPlan);

      const result = await service.canStartPlan('user-1', 'plan-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('terminal_status');
    });

    it('should allow start when goal not reached', async () => {
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(basePlan);
      mockPrisma.nudgePlan.update.mockResolvedValue({
        ...basePlan,
        status: 'notified',
      });
      mockPrisma.preference.findUnique.mockResolvedValue({
        dailyTargetMinutes: 15,
      });
      mockPrisma.walkSession.findMany.mockResolvedValue([]);

      const result = await service.canStartPlan('user-1', 'plan-1');
      expect(result.allowed).toBe(true);
    });

    it('should deny start when daily goal already reached', async () => {
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(basePlan);
      mockPrisma.nudgePlan.update.mockResolvedValue({
        ...basePlan,
        status: 'cancelled',
      });
      mockPrisma.preference.findUnique.mockResolvedValue({
        dailyTargetMinutes: 10,
      });
      // 20 minutes walked already (1200 activeSeconds)
      mockPrisma.walkSession.findMany.mockResolvedValue([
        { activeSeconds: 1200 },
      ]);

      const result = await service.canStartPlan('user-1', 'plan-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('goal_reached');
    });
  });

  describe('getTodayPlans', () => {
    it('should query plans for today', async () => {
      mockPrisma.nudgePlan.findMany.mockResolvedValue([basePlan]);
      const result = await service.getTodayPlans('user-1');
      expect(result.length).toBe(1);
    });
  });

  describe('skipGap', () => {
    it('should skip plan and cancel sibling plans in same gap', async () => {
      const siblingPlan = {
        ...basePlan,
        id: 'plan-2',
        walkStart: new Date(Date.now() + 60000),
      };
      mockPrisma.nudgePlan.findFirst.mockResolvedValue(basePlan);
      mockPrisma.nudgePlan.findMany.mockResolvedValue([
        { ...basePlan, walkStart: new Date(Date.now() + 60000) },
        siblingPlan,
      ]);
      mockPrisma.nudgePlan.update.mockResolvedValue({});

      const result = await service.skipGap('user-1', 'plan-1');
      expect(result.skipped).toBeDefined();
    });
  });
});
