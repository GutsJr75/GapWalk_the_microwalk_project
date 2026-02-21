import { NudgeEngineService } from './nudge-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { Preference } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';

// Minimal mock PrismaService
const mockPrisma = {
  busyEvent: { findMany: jest.fn().mockResolvedValue([]) },
  nudgePlan: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  preference: { findUnique: jest.fn() },
};

describe('NudgeEngineService', () => {
  let service: NudgeEngineService;

  const basePrefs: Preference = {
    id: 'pref-1',
    userId: 'user-1',
    dailyTargetMinutes: 15,
    bufferMinutes: 2,
    notificationCountPerDay: 2,
    notificationMinGapMinutes: 60,
    quietHoursStart: '23:00',
    quietHoursEnd: '06:00',
    minWalkMinutes: 6,
    gracePeriodMinutes: 2,
    whenToNotify: 'delay',
    notifyDelayMinutes: 5,
    strictnessMode: 'easygoing',
    stepGoalEnabled: false,
    stepGoal: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(() => {
    service = new NudgeEngineService(mockPrisma as unknown as PrismaService);
    jest.clearAllMocks();
  });

  // ── findGaps ──

  describe('findGaps', () => {
    it('should return full day as one gap when no events (no quiet hours)', () => {
      const day = new Date('2026-02-18T00:00:00');
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      // Disable quiet hours so the full day is valid
      const noQuietPrefs = {
        ...basePrefs,
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
      };
      const gaps = service.findGaps(dayStart, dayEnd, [], noQuietPrefs);
      expect(gaps.length).toBe(1);
      expect(gaps[0].start).toEqual(dayStart);
    });

    it('should split around a busy event', () => {
      const day = new Date('2026-02-18T00:00:00');
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const event = {
        id: 'e1',
        userId: 'user-1',
        localId: null,
        title: 'Meeting',
        start: new Date('2026-02-18T10:00:00'),
        endTime: new Date('2026-02-18T11:00:00'),
        source: 'manual' as any,
        isAllDay: false,
        createdAt: new Date(),
      };

      // Use no quiet hours to make both gaps valid
      const noQuietPrefs = {
        ...basePrefs,
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
      };
      const gaps = service.findGaps(dayStart, dayEnd, [event], noQuietPrefs);
      // Should have gap before and after the meeting
      expect(gaps.length).toBeGreaterThanOrEqual(2);
      // Gap before meeting ends at 10:00
      expect(gaps[0].end.getHours()).toBe(10);
      // Gap after meeting starts at 11:00
      expect(gaps[1].start.getHours()).toBe(11);
    });

    it('should not count all-day events as blocking busy time', () => {
      const day = new Date('2026-02-18T00:00:00');
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const allDayEvent = {
        id: 'e2',
        userId: 'user-1',
        localId: null,
        title: 'Holiday',
        start: dayStart,
        endTime: dayEnd,
        source: 'manual' as any,
        isAllDay: true,
        createdAt: new Date(),
      };

      // Use prefs with no quiet hours to avoid quiet-hours filtering
      const noQuietPrefs = {
        ...basePrefs,
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
      };
      const gapsWithAllDay = service.findGaps(
        dayStart,
        dayEnd,
        [allDayEvent],
        noQuietPrefs,
      );
      const gapsWithout = service.findGaps(dayStart, dayEnd, [], noQuietPrefs);
      // All-day events are filtered out, so gaps should be the same
      expect(gapsWithAllDay.length).toBe(gapsWithout.length);
    });
  });

  // ── mergeIntervals ──

  describe('mergeIntervals', () => {
    it('should merge overlapping intervals', () => {
      const intervals = [
        {
          start: new Date('2026-02-18T09:00:00'),
          end: new Date('2026-02-18T10:30:00'),
        },
        {
          start: new Date('2026-02-18T10:00:00'),
          end: new Date('2026-02-18T11:00:00'),
        },
      ];

      const merged = service.mergeIntervals(intervals);
      expect(merged.length).toBe(1);
      expect(merged[0].start.getHours()).toBe(9);
      expect(merged[0].end.getHours()).toBe(11);
    });

    it('should not merge non-overlapping intervals', () => {
      const intervals = [
        {
          start: new Date('2026-02-18T09:00:00'),
          end: new Date('2026-02-18T10:00:00'),
        },
        {
          start: new Date('2026-02-18T11:00:00'),
          end: new Date('2026-02-18T12:00:00'),
        },
      ];

      const merged = service.mergeIntervals(intervals);
      expect(merged.length).toBe(2);
    });

    it('should handle empty array', () => {
      expect(service.mergeIntervals([])).toEqual([]);
    });
  });

  // ── isValidGap ──

  describe('isValidGap', () => {
    it('should reject gaps smaller than minimum required', () => {
      const gap = {
        start: new Date('2026-02-18T10:00:00'),
        end: new Date('2026-02-18T10:05:00'), // 5 min < buffer(2) + grace(2) + minWalk(6) = 10
      };
      expect(service.isValidGap(gap, basePrefs)).toBe(false);
    });

    it('should accept gaps larger than minimum required', () => {
      const gap = {
        start: new Date('2026-02-18T10:00:00'),
        end: new Date('2026-02-18T10:20:00'), // 20 min > 10 min required
      };
      expect(service.isValidGap(gap, basePrefs)).toBe(true);
    });

    it('should reject gaps where walk start falls in quiet hours', () => {
      const gap = {
        start: new Date('2026-02-18T23:00:00'),
        end: new Date('2026-02-18T23:30:00'),
      };
      expect(service.isValidGap(gap, basePrefs)).toBe(false);
    });

    it('should reject gaps where walk end falls in quiet hours', () => {
      // Walk starts at 22:52 (22:50 + 2 buffer), ends at 22:58 — OK
      // But if walk starts at 22:56, walk end would be 23:02 — in quiet hours
      const gap = {
        start: new Date('2026-02-18T22:54:00'),
        end: new Date('2026-02-18T23:15:00'),
      };
      // walkStart = 22:54 + 2min buffer = 22:56, walkEnd = 22:56 + 6min = 23:02 (quiet hours!)
      expect(service.isValidGap(gap, basePrefs)).toBe(false);
    });
  });

  // ── scoreGap ──

  describe('scoreGap', () => {
    it('should give higher score to ideal-length gaps (8-15 min)', () => {
      const idealGap = {
        start: new Date('2026-02-18T10:00:00'),
        end: new Date('2026-02-18T10:12:00'), // 12 min
      };
      const longGap = {
        start: new Date('2026-02-18T10:00:00'),
        end: new Date('2026-02-18T12:00:00'), // 120 min
      };

      const idealScore = service.scoreGap(idealGap, basePrefs, 60);
      const longScore = service.scoreGap(longGap, basePrefs, 60);

      expect(idealScore.score).toBeGreaterThan(longScore.score);
    });

    it('should boost score for gaps overlapping preferred walking periods', () => {
      const gap = {
        start: new Date('2026-02-18T08:00:00'),
        end: new Date('2026-02-18T08:12:00'),
      };

      const prefsWithPeriods = {
        ...basePrefs,
        preferredWalkingPeriods: [{ start: '07:00', end: '09:00' }],
      } as any;

      const scoreWithPref = service.scoreGap(gap, prefsWithPeriods, 60);
      const scoreWithout = service.scoreGap(gap, basePrefs, 60);

      expect(scoreWithPref.score).toBeGreaterThan(scoreWithout.score);
    });

    it('should compute correct maxNotifications', () => {
      const gap = {
        start: new Date('2026-02-18T10:00:00'),
        end: new Date('2026-02-18T10:30:00'), // 30 min
      };

      const opp = service.scoreGap(gap, basePrefs, 60);
      expect(opp.maxNotifications).toBeGreaterThanOrEqual(1);
    });
  });

  // ── distributeDurations ──

  describe('distributeDurations', () => {
    it('should distribute minutes evenly across slots', () => {
      const result = service.distributeDurations(15, [10, 10, 10], 6);
      const total = result.reduce((s, v) => s + v, 0);
      expect(total).toBe(15);
    });

    it('should respect capacity limits', () => {
      const result = service.distributeDurations(30, [5, 5, 5], 1);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeLessThanOrEqual(5);
      }
    });

    it('should handle empty capacities', () => {
      expect(service.distributeDurations(10, [], 6)).toEqual([]);
    });

    it('should handle single slot', () => {
      const result = service.distributeDurations(8, [20], 6);
      expect(result).toEqual([8]);
    });
  });

  // ── selectGapNotificationCounts ──

  describe('selectGapNotificationCounts', () => {
    it('should allocate one notification per gap with fair distribution', () => {
      const opps = [
        {
          id: '1',
          gapStart: new Date(),
          gapEnd: new Date(),
          durationMinutes: 30,
          availableWalkMinutes: 26,
          maxNotifications: 2,
          score: 100,
        },
        {
          id: '2',
          gapStart: new Date(),
          gapEnd: new Date(),
          durationMinutes: 20,
          availableWalkMinutes: 16,
          maxNotifications: 1,
          score: 80,
        },
      ];

      const result = service.selectGapNotificationCounts(opps, 2);
      expect(result.length).toBe(2);
      expect(result[0].count).toBe(1);
      expect(result[1].count).toBe(1);
    });

    it('should return empty for zero budget', () => {
      expect(service.selectGapNotificationCounts([], 0)).toEqual([]);
    });
  });

  // ── buildSlotsForGap ──

  describe('buildSlotsForGap', () => {
    it('should build requested number of slots', () => {
      const opp = {
        id: '1',
        gapStart: new Date('2026-02-18T10:00:00'),
        gapEnd: new Date('2026-02-18T12:00:00'),
        durationMinutes: 120,
        availableWalkMinutes: 116,
        maxNotifications: 3,
        score: 100,
      };

      const slots = service.buildSlotsForGap(opp, 2, basePrefs, 60);
      expect(slots.length).toBe(2);
      expect(slots[0].walkStart.getTime()).toBeLessThan(
        slots[1].walkStart.getTime(),
      );
    });

    it('should return empty for zero count', () => {
      const opp = {
        id: '1',
        gapStart: new Date(),
        gapEnd: new Date(),
        durationMinutes: 30,
        availableWalkMinutes: 26,
        maxNotifications: 1,
        score: 50,
      };
      expect(service.buildSlotsForGap(opp, 0, basePrefs, 60)).toEqual([]);
    });
  });

  // ── generatePlansForDate ──

  describe('generatePlansForDate', () => {
    it('should return empty if dailyTargetMinutes is 0', async () => {
      const prefs = { ...basePrefs, dailyTargetMinutes: 0 };
      const plans = await service.generatePlansForDate(
        'user-1',
        new Date(),
        prefs,
      );
      expect(plans).toEqual([]);
    });

    it('should return empty if notificationCountPerDay is 0', async () => {
      const prefs = { ...basePrefs, notificationCountPerDay: 0 };
      const plans = await service.generatePlansForDate(
        'user-1',
        new Date(),
        prefs,
      );
      expect(plans).toEqual([]);
    });

    it('should generate plans for a date with no busy events', async () => {
      mockPrisma.busyEvent.findMany.mockResolvedValue([]);
      // Use a future date to avoid "isToday" filtering
      const futureDate = new Date('2026-03-01T12:00:00');
      // Use prefs with no quiet hours so full day is available
      const noQuietPrefs = {
        ...basePrefs,
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
      };
      const plans = await service.generatePlansForDate(
        'user-1',
        futureDate,
        noQuietPrefs as any,
      );
      expect(plans.length).toBeGreaterThan(0);
      expect(plans[0].status).toBe('planned');
      expect(plans[0].origin).toBe('server');
      expect(plans[0].userId).toBe('user-1');
    });
  });
});
