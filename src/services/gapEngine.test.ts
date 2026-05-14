import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BusyEvent, NudgePlan, Preferences } from '../types';

vi.mock('../data/repositories/plansRepo', () => ({
  plansRepo: {
    getByReasonSince: vi.fn(async () => []),
  },
}));

const buildIso = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string => new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();

const prefs: Preferences = {
  dailyTargetMinutes: 10,
  bufferMinutes: 0,
  notificationCountPerDay: 1,
  notificationMinGapMinutes: 60,
  quietHoursStart: '23:00',
  quietHoursEnd: '06:00',
  minWalkMinutes: 10,
  gracePeriodMinutes: 0,
  whenToNotify: 'now',
  notifyDelayMinutes: 0,
  strictnessMode: 'easygoing',
  stepGoalEnabled: false,
  stepGoal: 0,
  preferredWalkingPeriodsEnabled: false,
  preferredWalkingPeriods: [],
  endWalkMode: 'confirm',
};

describe('gapEngine.generatePlansForDate', () => {
  let gapEngine: typeof import('./gapEngine').gapEngine;

  beforeAll(async () => {
    ({ gapEngine } = await import('./gapEngine'));
  });

  it('does not generate an auto plan that overlaps an existing active walk', async () => {
    const date = new Date(2026, 4, 20, 0, 0, 0, 0);
    const events: BusyEvent[] = [
      {
        id: 'busy-1',
        title: 'Before gap',
        start: buildIso(2026, 5, 20, 0, 0),
        end: buildIso(2026, 5, 20, 9, 0),
        source: 'manual',
        isAllDay: false,
        createdAt: buildIso(2026, 5, 19, 12, 0),
      },
      {
        id: 'busy-2',
        title: 'After gap',
        start: buildIso(2026, 5, 20, 9, 20),
        end: buildIso(2026, 5, 20, 22, 59),
        source: 'manual',
        isAllDay: false,
        createdAt: buildIso(2026, 5, 19, 12, 0),
      },
    ];
    const existingPlans: NudgePlan[] = [
      {
        id: 'manual-1',
        date: '2026-05-20',
        gapStart: buildIso(2026, 5, 20, 9, 0),
        gapEnd: buildIso(2026, 5, 20, 9, 12),
        walkStart: buildIso(2026, 5, 20, 9, 0),
        suggestedDurationMinutes: 12,
        status: 'planned',
        reason: 'manual',
        createdAt: buildIso(2026, 5, 19, 12, 0),
      },
    ];

    const plans = await (gapEngine.generatePlansForDate as unknown as (
      date: Date,
      events: BusyEvent[],
      prefs: Preferences,
      existingPlans: NudgePlan[],
    ) => Promise<NudgePlan[]>)(date, events, prefs, existingPlans);

    expect(plans).toHaveLength(0);
  });
});
