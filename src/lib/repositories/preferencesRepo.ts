import { getDatabase } from '../db';
import { Preferences, DEFAULT_PREFERENCES, WhenToNotify } from '../types';

export const preferencesRepo = {
  async get(): Promise<Preferences | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{
      daily_target_minutes: number;
      buffer_minutes: number;
      notification_count_per_day: number;
      quiet_hours_start: string;
      quiet_hours_end: string;
      min_walk_minutes: number;
      grace_period_minutes?: number;
      when_to_notify?: string;
      notify_delay_minutes?: number;
    }>('SELECT * FROM preferences WHERE id = 1');
    
    if (!result) return null;
    
    return {
      dailyTargetMinutes: result.daily_target_minutes,
      bufferMinutes: result.buffer_minutes,
      notificationCountPerDay: result.notification_count_per_day,
      quietHoursStart: result.quiet_hours_start,
      quietHoursEnd: result.quiet_hours_end,
      minWalkMinutes: result.min_walk_minutes,
      gracePeriodMinutes: result.grace_period_minutes ?? DEFAULT_PREFERENCES.gracePeriodMinutes,
      whenToNotify: (result.when_to_notify as WhenToNotify) ?? DEFAULT_PREFERENCES.whenToNotify,
      notifyDelayMinutes: result.notify_delay_minutes ?? DEFAULT_PREFERENCES.notifyDelayMinutes,
    };
  },
  
  async save(prefs: Preferences): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO preferences 
       (id, daily_target_minutes, buffer_minutes, notification_count_per_day, 
        quiet_hours_start, quiet_hours_end, min_walk_minutes,
        grace_period_minutes, when_to_notify, notify_delay_minutes, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        prefs.dailyTargetMinutes,
        prefs.bufferMinutes,
        prefs.notificationCountPerDay,
        prefs.quietHoursStart,
        prefs.quietHoursEnd,
        prefs.minWalkMinutes,
        prefs.gracePeriodMinutes,
        prefs.whenToNotify,
        prefs.notifyDelayMinutes,
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
