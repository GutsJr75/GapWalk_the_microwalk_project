import { getDatabase } from '../db';
import { WalkSession } from '../types';
import { startOfDay, endOfDay } from 'date-fns';

export const sessionsRepo = {
  async save(session: WalkSession): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO walk_sessions 
       (id, nudge_plan_id, start, end, active_seconds, paused_seconds, 
        distance_meters, calories, used_location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.nudgePlanId || null,
        session.start,
        session.end,
        session.activeSeconds,
        session.pausedSeconds,
        session.distanceMeters || null,
        session.calories || null,
        session.usedLocation ? 1 : 0,
        session.createdAt,
      ]
    );
  },
  
  async getById(id: string): Promise<WalkSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      id: string;
      nudge_plan_id: string | null;
      start: string;
      end: string;
      active_seconds: number;
      paused_seconds: number;
      distance_meters: number | null;
      calories: number | null;
      used_location: number;
      created_at: string;
    }>('SELECT * FROM walk_sessions WHERE id = ?', [id]);
    
    if (!row) return null;
    
    return {
      id: row.id,
      nudgePlanId: row.nudge_plan_id || undefined,
      start: row.start,
      end: row.end,
      activeSeconds: row.active_seconds,
      pausedSeconds: row.paused_seconds,
      distanceMeters: row.distance_meters || undefined,
      calories: row.calories || undefined,
      usedLocation: row.used_location === 1,
      createdAt: row.created_at,
    };
  },
  
  async getTodaySessions(): Promise<WalkSession[]> {
    const db = await getDatabase();
    const today = new Date();
    const startTime = startOfDay(today).toISOString();
    const endTime = endOfDay(today).toISOString();
    
    const rows = await db.getAllAsync<{
      id: string;
      nudge_plan_id: string | null;
      start: string;
      end: string;
      active_seconds: number;
      paused_seconds: number;
      distance_meters: number | null;
      calories: number | null;
      used_location: number;
      created_at: string;
    }>(
      'SELECT * FROM walk_sessions WHERE start >= ? AND start < ? ORDER BY start DESC',
      [startTime, endTime]
    );
    
    return rows.map(row => ({
      id: row.id,
      nudgePlanId: row.nudge_plan_id || undefined,
      start: row.start,
      end: row.end,
      activeSeconds: row.active_seconds,
      pausedSeconds: row.paused_seconds,
      distanceMeters: row.distance_meters || undefined,
      calories: row.calories || undefined,
      usedLocation: row.used_location === 1,
      createdAt: row.created_at,
    }));
  },
  
  async getTodayMinutes(): Promise<number> {
    const sessions = await this.getTodaySessions();
    const totalSeconds = sessions.reduce((sum, s) => sum + s.activeSeconds, 0);
    return Math.floor(totalSeconds / 60);
  },

  async getAll(): Promise<WalkSession[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      nudge_plan_id: string | null;
      start: string;
      end: string;
      active_seconds: number;
      paused_seconds: number;
      distance_meters: number | null;
      calories: number | null;
      used_location: number;
      created_at: string;
    }>('SELECT * FROM walk_sessions ORDER BY start DESC');
    
    return rows.map(row => ({
      id: row.id,
      nudgePlanId: row.nudge_plan_id || undefined,
      start: row.start,
      end: row.end,
      activeSeconds: row.active_seconds,
      pausedSeconds: row.paused_seconds,
      distanceMeters: row.distance_meters || undefined,
      calories: row.calories || undefined,
      usedLocation: row.used_location === 1,
      createdAt: row.created_at,
    }));
  },
};
