import { getDatabase } from '../db';
import {
  Preferences,
  DEFAULT_PREFERENCES,
  PreferredWalkingPeriod,
  StrictnessMode,
  WhenToNotify,
} from '../../types';

const normalizeStepGoal = (raw: number | undefined): number => {
  const base = typeof raw === 'number' ? Math.floor(raw) : DEFAULT_PREFERENCES.stepGoal;
  return Math.max(500, Math.min(6000, base));
};

const TIME_24H_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidTime = (value: unknown): value is string =>
  typeof value === 'string' && TIME_24H_RE.test(value);

const normalizePreferredWalkingPeriods = (raw: unknown): PreferredWalkingPeriod[] => {
  if (!Array.isArray(raw)) return [];

  const out: PreferredWalkingPeriod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const start = (item as { start?: unknown }).start;
    const end = (item as { end?: unknown }).end;
    if (!isValidTime(start) || !isValidTime(end) || start === end) continue;
    out.push({ start, end });
    if (out.length >= 5) break;
  }
  return out;
};

export const preferencesRepo = {
  async get(): Promise<Preferences | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{
      daily_target_minutes: number;
      buffer_minutes: number;
      notification_count_per_day: number;
      notification_min_gap_minutes?: number;
      quiet_hours_start: string;
      quiet_hours_end: string;
      min_walk_minutes: number;
      grace_period_minutes?: number;
      when_to_notify?: string;
      notify_delay_minutes?: number;
      strictness_mode?: string;
      step_goal_enabled?: number;
      step_goal?: number;
      preferred_walking_periods_enabled?: number;
      preferred_walking_periods_json?: string;
    }>('SELECT * FROM preferences WHERE id = 1');
    
    if (!result) return null;

    const strictnessMode: StrictnessMode =
      result.strictness_mode === 'no_excuses' ? 'no_excuses' : DEFAULT_PREFERENCES.strictnessMode;
    const stepGoal = normalizeStepGoal(result.step_goal);
    const stepGoalEnabled =
      strictnessMode === 'no_excuses'
        ? true
        : (result.step_goal_enabled ?? 0) === 1;
    let preferredWalkingPeriods = DEFAULT_PREFERENCES.preferredWalkingPeriods;
    try {
      const parsed = result.preferred_walking_periods_json
        ? JSON.parse(result.preferred_walking_periods_json)
        : [];
      preferredWalkingPeriods = normalizePreferredWalkingPeriods(parsed);
    } catch {
      preferredWalkingPeriods = DEFAULT_PREFERENCES.preferredWalkingPeriods;
    }
    const preferredWalkingPeriodsEnabled =
      (result.preferred_walking_periods_enabled ?? 0) === 1 && preferredWalkingPeriods.length > 0;
    
    return {
      dailyTargetMinutes: result.daily_target_minutes,
      bufferMinutes: result.buffer_minutes,
      notificationCountPerDay: result.notification_count_per_day,
      notificationMinGapMinutes: result.notification_min_gap_minutes ?? DEFAULT_PREFERENCES.notificationMinGapMinutes,
      quietHoursStart: result.quiet_hours_start,
      quietHoursEnd: result.quiet_hours_end,
      minWalkMinutes: result.min_walk_minutes,
      gracePeriodMinutes: result.grace_period_minutes ?? DEFAULT_PREFERENCES.gracePeriodMinutes,
      whenToNotify: (result.when_to_notify as WhenToNotify) ?? DEFAULT_PREFERENCES.whenToNotify,
      notifyDelayMinutes: result.notify_delay_minutes ?? DEFAULT_PREFERENCES.notifyDelayMinutes,
      strictnessMode,
      stepGoalEnabled,
      stepGoal,
      preferredWalkingPeriodsEnabled,
      preferredWalkingPeriods,
    };
  },
  
  async save(prefs: Preferences): Promise<void> {
    const db = await getDatabase();
    const strictnessMode: StrictnessMode =
      prefs.strictnessMode === 'no_excuses' ? 'no_excuses' : 'easygoing';
    const stepGoal = normalizeStepGoal(prefs.stepGoal);
    const stepGoalEnabled = strictnessMode === 'no_excuses' ? 1 : (prefs.stepGoalEnabled ? 1 : 0);
    const preferredWalkingPeriods = normalizePreferredWalkingPeriods(prefs.preferredWalkingPeriods);
    const preferredWalkingPeriodsEnabled =
      prefs.preferredWalkingPeriodsEnabled && preferredWalkingPeriods.length > 0 ? 1 : 0;

    await db.runAsync(
      `INSERT OR REPLACE INTO preferences 
       (id, daily_target_minutes, buffer_minutes, notification_count_per_day, 
        notification_min_gap_minutes, quiet_hours_start, quiet_hours_end, min_walk_minutes,
        grace_period_minutes, when_to_notify, notify_delay_minutes,
        preferred_walking_periods_enabled, preferred_walking_periods_json,
        strictness_mode, step_goal_enabled, step_goal, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        prefs.dailyTargetMinutes,
        prefs.bufferMinutes,
        prefs.notificationCountPerDay,
        prefs.notificationMinGapMinutes,
        prefs.quietHoursStart,
        prefs.quietHoursEnd,
        prefs.minWalkMinutes,
        prefs.gracePeriodMinutes,
        prefs.whenToNotify,
        prefs.notifyDelayMinutes,
        preferredWalkingPeriodsEnabled,
        JSON.stringify(preferredWalkingPeriods),
        strictnessMode,
        stepGoalEnabled,
        stepGoal,
      ]
    );
  },
  
  async exists(): Promise<boolean> {
    const prefs = await this.get();
    return prefs !== null;
  },
  
  async getOrDefault(): Promise<Preferences> {
    const prefs = await this.get();
    return prefs || DEFAULT_PREFERENCES;
  },
};
