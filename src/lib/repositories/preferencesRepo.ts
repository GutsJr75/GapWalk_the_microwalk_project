import { getDatabase } from '../db';
import { Preferences, DEFAULT_PREFERENCES, StrictnessMode, WhenToNotify } from '../types';

const normalizeStepGoal = (raw: number | undefined): number => {
  const base = typeof raw === 'number' ? Math.floor(raw) : DEFAULT_PREFERENCES.stepGoal;
  return Math.max(500, Math.min(6000, base));
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
    }>('SELECT * FROM preferences WHERE id = 1');
    
    if (!result) return null;

    const strictnessMode: StrictnessMode =
      result.strictness_mode === 'no_excuses' ? 'no_excuses' : DEFAULT_PREFERENCES.strictnessMode;
    const stepGoal = normalizeStepGoal(result.step_goal);
    const stepGoalEnabled =
      strictnessMode === 'no_excuses'
        ? true
        : (result.step_goal_enabled ?? 0) === 1;
    
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
    };
  },
  
  async save(prefs: Preferences): Promise<void> {
    const db = await getDatabase();
    const strictnessMode: StrictnessMode =
      prefs.strictnessMode === 'no_excuses' ? 'no_excuses' : 'easygoing';
    const stepGoal = normalizeStepGoal(prefs.stepGoal);
    const stepGoalEnabled = strictnessMode === 'no_excuses' ? 1 : (prefs.stepGoalEnabled ? 1 : 0);

    await db.runAsync(
      `INSERT OR REPLACE INTO preferences 
       (id, daily_target_minutes, buffer_minutes, notification_count_per_day, 
        notification_min_gap_minutes, quiet_hours_start, quiet_hours_end, min_walk_minutes,
        grace_period_minutes, when_to_notify, notify_delay_minutes,
        strictness_mode, step_goal_enabled, step_goal, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
