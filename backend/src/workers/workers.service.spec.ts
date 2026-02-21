import { WorkersService } from './workers.service';
import { Queue } from 'bullmq';

describe('WorkersService', () => {
  let service: WorkersService;
  let mockNudgeQueue: Partial<Queue>;
  let mockPushQueue: Partial<Queue>;
  let mockAggQueue: Partial<Queue>;
  let mockReceiptQueue: Partial<Queue>;

  beforeEach(() => {
    mockNudgeQueue = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    mockPushQueue = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue({ id: 'job-2' }),
    };
    mockAggQueue = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue({ id: 'job-3' }),
    };
    mockReceiptQueue = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue({ id: 'job-4' }),
    };

    service = new WorkersService(
      mockNudgeQueue as Queue,
      mockPushQueue as Queue,
      mockAggQueue as Queue,
      mockReceiptQueue as Queue,
    );
  });

  describe('onModuleInit', () => {
    it('should set up all repeating jobs including push-send', async () => {
      await service.onModuleInit();

      // Nudge generation daily at 06:00
      expect(mockNudgeQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'daily-nudge-generation',
        { pattern: '0 6 * * *' },
        { name: 'generate-all-users', data: {} },
      );

      // Push send every 2 minutes
      expect(mockPushQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'send-due-nudges',
        { pattern: '*/2 * * * *' },
        { name: 'send-due-nudges', data: {} },
      );

      // Receipt check every 15 min
      expect(mockReceiptQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'receipt-check',
        { pattern: '*/15 * * * *' },
        { name: 'check-receipts', data: {} },
      );

      // Daily aggregation
      expect(mockAggQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'daily-aggregation',
        { pattern: '0 2 * * *' },
        { name: 'compute-daily', data: {} },
      );

      // Weekly aggregation
      expect(mockAggQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'weekly-aggregation',
        { pattern: '0 3 * * 1' },
        { name: 'compute-weekly', data: {} },
      );
    });
  });

  describe('enqueueNudgeGeneration', () => {
    it('should add job to nudge queue', async () => {
      await service.enqueueNudgeGeneration('user-1', '2026-02-18');
      expect(mockNudgeQueue.add).toHaveBeenCalledWith('generate-for-user', {
        userId: 'user-1',
        date: '2026-02-18',
      });
    });
  });

  describe('enqueuePushSend', () => {
    it('should add job to push queue', async () => {
      await service.enqueuePushSend('plan-1');
      expect(mockPushQueue.add).toHaveBeenCalledWith('send-nudge', {
        nudgePlanId: 'plan-1',
      });
    });
  });

  describe('enqueueAggregation', () => {
    it('should add job to aggregation queue', async () => {
      await service.enqueueAggregation('user-1', '2026-02-18');
      expect(mockAggQueue.add).toHaveBeenCalledWith('compute-daily', {
        userId: 'user-1',
        date: '2026-02-18',
      });
    });
  });
});
